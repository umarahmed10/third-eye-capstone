import { useCallback, useEffect, useRef, useState } from "react";
import { C, F, S, sevColor } from "../design";
import { Badge, Card, Caveat, P, Section, VerdictPill } from "../ui";
import BUNDLED_SAMPLES from "../samples.json";
import { AuditStages } from "../AuditStages";
import { STAGES } from "../stages";
import DEMO_CACHE from "../demo-cache.json";
import {
  API,
  getSamples,
  streamCouncil,
  type CouncilResult,
  type CouncilVuln,
  type SampleContract,
  type StreamEvent,
} from "../../lib/api";

type Preflight = {
  mode: string;
  ollama_running: boolean;
  ready: boolean;
  required_models: string[];
  present: string[];
  missing: string[];
  problems: string[];
  fixes: string[];
  judge_model: string;
  judge_present: boolean;
};

type Phase = "idle" | "routing" | "scanning" | "done" | "error";

/* Is the backend we are asking actually on this machine?
 *
 * This decides whether "no live scan" is a FAULT or just the situation. On a
 * laptop with the backend down it is a fault, and the fix is one command. On a
 * public host it is neither: that host can never run Ollama, so a red "not
 * ready" panel reports a problem nobody can act on and makes a working page
 * look broken -- which is exactly what the deployed site was doing, because
 * VITE_API_URL points it at a hosted backend that then truthfully reports
 * Ollama missing at localhost:11434.
 *
 * "/api" counts as local: that is the dev-server proxy to 127.0.0.1:8000. */
function apiIsLocal(): boolean {
  if (!API || API.startsWith("/")) return true;
  try {
    const h = new URL(API, window.location.href).hostname;
    return h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h.endsWith(".localhost");
  } catch {
    return false;
  }
}

/* A previously-measured local scan, shipped in the bundle.
 *
 * Without this, the deployed site's tool page can only say "no backend" --
 * true, but it demonstrates nothing. These results were produced by
 * backend/build_demo_cache.py against real local models, and are shown ONLY
 * when a live scan is impossible, always labelled as cached. They are never
 * presented as a live run, and a cached verdict that disagrees with the
 * sample's expected answer is shown disagreeing. */
type CachedResult = {
  verdict: string;
  expected: string;
  agrees: boolean;
  latency_s: number;
  roles_routed: string[];
  specialists_errored: number;
  verdict_reason: string;
  findings: {
    type: string;
    severity: string;
    confidence: number;
    evidence_quote: string;
    description: string;
  }[];
};

const CACHE = DEMO_CACHE as unknown as {
  generated_at: string;
  models: Record<string, string>;
  results: Record<string, CachedResult>;
};

export function Tool() {
  // Seeded from the bundle, NOT fetched-then-empty.
  //
  // The sample list used to come only from /api/samples, so with no backend
  // the tool page rendered "SAMPLES · 0" and an empty picker -- which is what
  // every visitor to the deployed site would see, since a public host cannot
  // run Ollama. The same six contracts now ship in the bundle; the API call
  // still runs and replaces them when a backend IS present, so the local path
  // stays the source of truth.
  const [samples, setSamples] = useState<SampleContract[]>(
    BUNDLED_SAMPLES as unknown as SampleContract[]
  );
  const [active, setActive] = useState<SampleContract | null>(null);
  const [code, setCode] = useState("");
  const [pre, setPre] = useState<Preflight | null>(null);
  const [preLoading, setPreLoading] = useState(true);

  const [phase, setPhase] = useState<Phase>("idle");
  const [roles, setRoles] = useState<string[]>([]);
  const [done, setDone] = useState<{ role: string; found: boolean; model: string }[]>([]);
  const [result, setResult] = useState<CouncilResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [cached, setCached] = useState<CachedResult | null>(null);
  const abort = useRef<AbortController | null>(null);
  const timer = useRef<number | null>(null);
  /* Which pipeline stage the audit has reached. -1 = not started. */
  const [stage, setStage] = useState(-1);
  const walkTimers = useRef<number[]>([]);

  const clearWalk = useCallback(() => {
    walkTimers.current.forEach((t) => window.clearTimeout(t));
    walkTimers.current = [];
  }, []);

  const refreshPreflight = useCallback(async () => {
    setPreLoading(true);
    try {
      const r = await fetch(`${API}/preflight`);
      setPre(await r.json());
    } catch {
      setPre(null);
    } finally {
      setPreLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshPreflight();
    const seed = BUNDLED_SAMPLES as unknown as SampleContract[];
    if (seed.length) {
      setActive(seed[0]);
      setCode(seed[0].code);
    }
    getSamples()
      .then((s) => {
        if (s.length) setSamples(s);
      })
      // Keep the bundled list on failure. Replacing it with [] was the bug.
      .catch(() => undefined);
  }, [refreshPreflight]);

  useEffect(() => {
    if (phase === "routing" || phase === "scanning") {
      const t0 = Date.now();
      timer.current = window.setInterval(() => setElapsed((Date.now() - t0) / 1000), 200);
    } else if (timer.current) {
      window.clearInterval(timer.current);
      timer.current = null;
    }
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [phase]);

  function pick(s: SampleContract) {
    clearWalk();
    setStage(-1);
    setActive(s);
    setCode(s.code);
    setCached(null);
    setResult(null);
    setDone([]);
    setRoles([]);
    setPhase("idle");
    setErr(null);
  }

  async function run() {
    abort.current?.abort();
    const ctl = new AbortController();
    abort.current = ctl;
    setPhase("routing");
    setCached(null);
    setResult(null);
    setDone([]);
    setRoles([]);
    setErr(null);
    setElapsed(0);
    clearWalk();
    setStage(0); // static pre-pass
    try {
      await streamCouncil(
        code,
        (ev: StreamEvent) => {
          const e = ev as unknown as Record<string, unknown>;
          if (e.event === "routing") {
            setRoles((e.roles as string[]) || []);
            setPhase("scanning");
            setStage(1); // router has chosen
            // The council is the long stage; move onto it shortly after the
            // router reports, rather than pretending it is instant.
            walkTimers.current.push(window.setTimeout(() => setStage(2), 420));
          } else if (e.event === "specialist_done") {
            setDone((d) => [
              ...d,
              {
                role: String(e.role),
                found: Boolean(e.found),
                model: String(e.model || ""),
              },
            ]);
          } else if (e.event === "final") {
            /* The gate, the pooling and the verdict all happen server-side
               between the last specialist and this event, so they are shown
               completing in sequence rather than all at once. */
            setStage(3);
            walkTimers.current.push(window.setTimeout(() => setStage(4), 260));
            walkTimers.current.push(window.setTimeout(() => setStage(5), 520));
            walkTimers.current.push(
              window.setTimeout(() => {
                setResult(e.result as CouncilResult);
                setPhase("done");
                setStage(STAGES.length);
              }, 780)
            );
          }
        },
        { signal: ctl.signal }
      );
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setErr((e as Error).message || String(e));
      setPhase("error");
    }
  }

  const canScanLive = Boolean(pre?.ready);
  // Only offer a cached result for UNEDITED sample code. Showing a stored
  // verdict for code the visitor has changed would be straightforwardly wrong.
  const cacheFor =
    active && code === active.code ? (CACHE.results[active.id] ?? null) : null;

  /* Recorded run: walk every stage, then reveal the stored verdict.
   *
   * The previous build dumped the cached result the instant the button was
   * clicked, which showed none of the pipeline the page spends eight hundred
   * words describing. Walking the stages makes the same data demonstrate the
   * process. Paced at 520ms a stage -- about three seconds total, slow enough
   * to read each label, fast enough not to stall a live demo. */
  const startRecorded = useCallback(() => {
    if (!cacheFor) return;
    clearWalk();
    setResult(null);
    setCached(null);
    setErr(null);
    setDone([]);
    setRoles(cacheFor.roles_routed);
    setElapsed(0);
    setPhase("scanning");
    setStage(0);

    const STEP = 520;
    for (let i = 1; i < STAGES.length; i++) {
      walkTimers.current.push(window.setTimeout(() => setStage(i), STEP * i));
    }
    walkTimers.current.push(
      window.setTimeout(() => {
        setCached(cacheFor);
        setPhase("done");
        setStage(STAGES.length);
      }, STEP * STAGES.length)
    );
  }, [cacheFor, clearWalk]);

  useEffect(() => () => clearWalk(), [clearWalk]);

  const scanning = phase === "routing" || phase === "scanning";
  const vulns: CouncilVuln[] = (result?.vulnerabilities as CouncilVuln[]) || [];

  return (
    <div style={S.page}>
      <div style={{ paddingTop: 44 }}>
        <div style={S.eyebrow}>Live tool</div>
        <h1 style={S.h1}>Scan a contract</h1>
        <P>
          This runs the real pipeline on your machine — static pre-pass, router,
          model-diverse council, evidence gate, verdict. No API key, no network
          call, and the source never leaves the laptop. Pick a sample or paste
          your own Solidity.
        </P>
      </div>

      <Preflight pre={pre} loading={preLoading} onRetry={refreshPreflight} />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(240px, 300px) 1fr",
          gap: 20,
          marginTop: 28,
          alignItems: "start",
        }}
      >
        {/* ── sample picker ── */}
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ ...S.eyebrow, margin: "0 0 4px" }}>
            Samples · {samples.length}
          </div>
          {samples.map((s) => {
            const on = active?.id === s.id;
            const safe = s.expected === "GO";
            return (
              <button
                key={s.id}
                onClick={() => pick(s)}
                style={{
                  textAlign: "left",
                  background: on ? C.panelHi : C.panel,
                  border: `1px solid ${on ? C.accentDim : C.line}`,
                  borderRadius: 8,
                  padding: "10px 12px",
                  cursor: "pointer",
                  color: C.ink,
                  font: "inherit",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 99,
                      background: safe ? C.go : C.nogo,
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ fontSize: 13.5, fontWeight: 500 }}>{s.name}</span>
                </div>
                <div
                  style={{
                    fontFamily: F.mono,
                    fontSize: 11,
                    color: C.inkDim,
                    marginTop: 4,
                    paddingLeft: 14,
                  }}
                >
                  {s.category}
                </div>
              </button>
            );
          })}
        </div>

        {/* ── editor + run ── */}
        <div>
          {active && (
            <Card style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <strong style={{ fontSize: 15, color: C.ink }}>{active.name}</strong>
                <Badge
                  fg={active.expected === "GO" ? C.go : C.nogo}
                  bg={active.expected === "GO" ? C.goGhost : C.nogoGhost}
                >
                  expected {active.expected}
                </Badge>
              </div>
              <P style={{ margin: "10px 0 0", fontSize: 14 }}>{active.blurb}</P>
            </Card>
          )}

          <textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            spellCheck={false}
            style={{
              ...S.code,
              width: "100%",
              minHeight: 240,
              resize: "vertical",
              display: "block",
            }}
          />

          <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 12, flexWrap: "wrap" }}>
            {/* ONE button, one label.
             *
             * It used to read "Run scan" with a backend and "Show cached
             * result" without one, which made the second path look like a
             * consolation prize for a broken page. Both run the same six
             * stages and end on the same verdict panel; whether the models are
             * executing now or the run was recorded is reported where it
             * belongs -- on the result, with its timestamp. */}
            <button
              onClick={
                scanning
                  ? () => {
                      abort.current?.abort();
                      clearWalk();
                      setPhase("idle");
                      setStage(-1);
                    }
                  : canScanLive
                    ? run
                    : startRecorded
              }
              disabled={!code.trim() || (!canScanLive && !cacheFor && !scanning)}
              title={
                canScanLive
                  ? "Run the full pipeline on this contract now"
                  : cacheFor
                    ? "Replay this contract's audit stage by stage"
                    : "This code has been edited and no backend is running, so there is nothing to audit it with"
              }
              style={{
                background: scanning ? "transparent" : C.accent,
                color: scanning ? C.inkMid : C.bg,
                border: `1px solid ${scanning ? C.line : C.accent}`,
                borderRadius: 7,
                padding: "10px 20px",
                fontFamily: F.sans,
                fontSize: 14,
                fontWeight: 600,
                cursor:
                  code.trim() && (canScanLive || cacheFor || scanning)
                    ? "pointer"
                    : "not-allowed",
                opacity:
                  code.trim() && (canScanLive || cacheFor || scanning) ? 1 : 0.45,
              }}
            >
              {scanning ? "Stop" : "Start audit"}
            </button>

            {scanning && (
              <span style={{ fontFamily: F.mono, fontSize: 13, color: C.inkMid }}>
                {stage >= 0 && stage < STAGES.length
                  ? STAGES[stage].name.toLowerCase()
                  : "running"}
                {canScanLive ? ` · ${elapsed.toFixed(1)}s` : ""}
              </span>
            )}

            {!canScanLive && !preLoading && !cacheFor && (
              <span style={{ fontFamily: F.sans, fontSize: 13, color: C.inkDim }}>
                Edited code needs a running backend — start it to audit this.
              </span>
            )}
          </div>

          {/* ── the six stages, highlighted as the audit walks them ── */}
          {stage >= 0 && (
            <div style={{ marginTop: 18 }}>
              <AuditStages active={stage} complete={stage >= STAGES.length} />
            </div>
          )}

          {/* expected scan cost, so nobody thinks it hung */}
          {scanning && canScanLive && (
            <P style={{ fontSize: 13, color: C.inkDim, marginTop: 10 }}>
              On a 4&nbsp;GB laptop GPU a scan measured 55–66&nbsp;s for a small
              contract. The models load one at a time, so the first call of a
              session is the slowest.
            </P>
          )}

          {err && (
            <Card style={{ marginTop: 14, borderColor: C.nogo }}>
              <div style={{ ...S.h3, color: C.nogo }}>Scan failed</div>
              <code style={{ fontFamily: F.mono, fontSize: 12.5, color: C.inkMid }}>{err}</code>
            </Card>
          )}

          {/* ── live specialist progress ── */}
          {(roles.length > 0 || done.length > 0) && (
            <Section title="Specialists" id="specialists">
              <P style={{ fontSize: 14 }}>
                The router fired {roles.length} of 8 specialists for this
                contract. Each returns a finding only if it can quote a line of
                the submitted source.
              </P>
              <div style={{ display: "grid", gap: 7 }}>
                {roles.map((r) => {
                  const d = done.find((x) => x.role === r);
                  return (
                    <div
                      key={r}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "8px 12px",
                        background: C.panel,
                        border: `1px solid ${C.line}`,
                        borderRadius: 7,
                      }}
                    >
                      <span
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: 99,
                          background: !d ? C.inkDim : d.found ? C.nogo : C.go,
                          flexShrink: 0,
                        }}
                      />
                      <span style={{ fontFamily: F.mono, fontSize: 12.5, color: C.ink }}>
                        {r}
                      </span>
                      <span style={{ marginLeft: "auto", fontFamily: F.mono, fontSize: 11, color: C.inkDim }}>
                        {!d ? "waiting" : d.found ? "flagged" : "clean"}
                        {d?.model ? ` · ${d.model}` : ""}
                      </span>
                    </div>
                  );
                })}
              </div>
            </Section>
          )}

          {/* ── recorded verdict (shown when the models cannot run here) ── */}
          {cached && !result && (
            <Section title="Audit result">
              <Card style={{ borderColor: C.lineHi }}>
                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    alignItems: "center",
                    flexWrap: "wrap",
                    marginBottom: 10,
                  }}
                >
                  {/* Provenance, stated as instrumentation rather than as an
                      apology. A live run reads "just now"; this one carries
                      the date it was measured, which is the honest difference
                      and the only one a reader needs. */}
                  <span style={{ fontFamily: F.mono, fontSize: 12, color: C.inkDim }}>
                    recorded run · {CACHE.generated_at.slice(0, 10)} · coder{" "}
                    {CACHE.models.coder} · {cached.latency_s}s ·{" "}
                    {cached.roles_routed.length} specialists
                  </span>
                </div>

                <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <VerdictPill verdict={cached.verdict} />
                  <span style={{ fontFamily: F.sans, fontSize: 13.5, color: C.inkMid }}>
                    expected <strong style={{ color: C.ink }}>{cached.expected}</strong> ·{" "}
                    {cached.agrees ? (
                      <span style={{ color: C.go }}>match</span>
                    ) : (
                      <span style={{ color: C.nogo }}>mismatch</span>
                    )}
                  </span>
                </div>

                {cached.verdict_reason && (
                  <P style={{ fontSize: 14, marginTop: 12 }}>{cached.verdict_reason}</P>
                )}

                {cached.findings.length > 0 && (
                  <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
                    {cached.findings.map((f, i) => (
                      <div
                        key={i}
                        style={{
                          background: C.bgAlt,
                          border: `1px solid ${C.line}`,
                          borderRadius: 8,
                          padding: 14,
                        }}
                      >
                        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                          <Badge fg={sevColor(f.severity)} bg={`${sevColor(f.severity)}22`}>
                            {f.severity}
                          </Badge>
                          <strong style={{ fontSize: 14, color: C.ink }}>{f.type}</strong>
                          <span style={{ fontFamily: F.mono, fontSize: 12, color: C.inkDim }}>
                            confidence {f.confidence}
                          </span>
                        </div>
                        {f.evidence_quote && (
                          <pre style={{ ...S.code, marginTop: 10, marginBottom: 0 }}>
                            {f.evidence_quote}
                          </pre>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Card>

            </Section>
          )}

          {/* ── verdict ── */}
          {result && (
            <Section title="Verdict">
              <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <VerdictPill verdict={result.final_verdict} />
                {active && (
                  <span style={{ fontFamily: F.sans, fontSize: 13.5, color: C.inkMid }}>
                    expected <strong style={{ color: C.ink }}>{active.expected}</strong> ·{" "}
                    {result.final_verdict === active.expected ? (
                      <span style={{ color: C.go }}>match</span>
                    ) : (
                      <span style={{ color: C.nogo }}>mismatch</span>
                    )}
                  </span>
                )}
              </div>

              {active && result.final_verdict !== active.expected && (
                <Caveat title="This is a disagreement, and it is not hidden">
                  The tool returned a different verdict than this sample
                  expects. On the full benchmark it raises a false alarm on{" "}
                  <strong style={{ color: C.ink }}>45.9%</strong> of safe
                  contracts, so a wrong call here is the measured behaviour
                  rather than a surprise. The findings page explains why that
                  floor is structural.
                </Caveat>
              )}

              {result.verdict_reason && (
                <P style={{ fontSize: 14, marginTop: 12 }}>{result.verdict_reason}</P>
              )}

              {vulns.length > 0 && (
                <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
                  {vulns.map((v, i) => (
                    <Card key={i}>
                      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                        <Badge fg={sevColor(v.severity)} bg={`${sevColor(v.severity)}22`}>
                          {v.severity}
                        </Badge>
                        <strong style={{ fontSize: 14, color: C.ink }}>{v.type}</strong>
                        <span style={{ fontFamily: F.mono, fontSize: 12, color: C.inkDim }}>
                          confidence {v.confidence}
                        </span>
                      </div>
                      {v.evidence_quote && (
                        <pre style={{ ...S.code, marginTop: 10, marginBottom: 0 }}>
                          {v.evidence_quote}
                        </pre>
                      )}
                      <P style={{ fontSize: 13.5, margin: "10px 0 0" }}>{v.description}</P>
                    </Card>
                  ))}
                </div>
              )}
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── preflight banner: the demo's honesty layer ──────────────────────────── */

function Preflight({
  pre,
  loading,
  onRetry,
}: {
  pre: Preflight | null;
  loading: boolean;
  onRetry: () => void;
}) {
  const local = apiIsLocal();

  if (loading) {
    return (
      <Card flat style={{ marginTop: 24 }}>
        <span style={{ fontFamily: F.mono, fontSize: 13, color: C.inkDim }}>
          checking for a local engine…
        </span>
      </Card>
    );
  }

  /* Remote or unreachable backend: one quiet line, no alarm. The audit button
   * still works -- it replays a recorded run -- so there is nothing here for
   * the reader to fix and nothing to warn them about. */
  if (!pre || !pre.ready) {
    if (!local) {
      return (
        <div
          style={{
            marginTop: 24,
            display: "flex",
            gap: 10,
            alignItems: "baseline",
            flexWrap: "wrap",
            fontFamily: F.sans,
            fontSize: 13.5,
            color: C.inkDim,
          }}
        >
          <Badge>local-only</Badge>
          <span>
            The models run on the machine viewing this page, so a live scan
            needs ThirdEye started locally. Start audit replays a recorded run
            of the same pipeline.
          </span>
        </div>
      );
    }
  }

  /* From here: the backend IS local, so anything wrong is actionable. */
  if (!pre) {
    return (
      <Card flat style={{ marginTop: 24, borderColor: C.lineHi }}>
        <div style={{ ...S.h3 }}>Backend not reachable</div>
        <P style={{ fontSize: 14, margin: "6px 0 10px" }}>
          Every other page works without it, but a live scan needs the ThirdEye
          backend on this machine. Start it and retry:
        </P>
        <pre style={S.code}>
{`cd backend
uvicorn main:app --reload --port 8000`}
        </pre>
        <RetryButton onRetry={onRetry} />
      </Card>
    );
  }

  const ok = pre.ready;
  return (
    <Card
      flat
      style={{
        marginTop: 24,
        borderColor: ok ? `${C.go}55` : `${C.nogo}55`,
        background: ok ? C.goGhost : C.nogoGhost,
      }}
    >
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <span
          style={{ width: 8, height: 8, borderRadius: 99, background: ok ? C.go : C.nogo }}
        />
        <strong style={{ fontSize: 14.5, color: C.ink }}>
          {ok ? "Ready to scan locally" : "Engine not ready"}
        </strong>
        <Badge>{pre.mode}</Badge>
        {pre.required_models.map((m) => (
          <Badge
            key={m}
            fg={pre.present.includes(m) ? C.go : C.nogo}
            bg={pre.present.includes(m) ? C.goGhost : C.nogoGhost}
          >
            {m}
          </Badge>
        ))}
      </div>

      {pre.problems.length > 0 && (
        <div style={{ marginTop: 12 }}>
          {pre.problems.map((p, i) => (
            <P key={i} style={{ fontSize: 13.5, margin: "0 0 8px" }}>
              {p}
            </P>
          ))}
          {pre.fixes.length > 0 && <pre style={S.code}>{pre.fixes.join("\n")}</pre>}
          <RetryButton onRetry={onRetry} />
        </div>
      )}

      {ok && (
        <P style={{ fontSize: 13.5, margin: "10px 0 0" }}>
          Models are checked by name, not counted. That distinction cost this
          project a wasted evaluation run once — a healthy-looking Ollama was
          serving a different model store, and every call to the missing model
          failed silently.
        </P>
      )}
    </Card>
  );
}

function RetryButton({ onRetry }: { onRetry: () => void }) {
  return (
    <button
      onClick={onRetry}
      style={{
        marginTop: 10,
        background: "transparent",
        color: C.accent,
        border: `1px solid ${C.accentDim}`,
        borderRadius: 6,
        padding: "6px 14px",
        fontFamily: F.sans,
        fontSize: 13,
        cursor: "pointer",
      }}
    >
      Check again
    </button>
  );
}
