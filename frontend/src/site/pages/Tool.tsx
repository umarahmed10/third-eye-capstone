import { useCallback, useEffect, useRef, useState } from "react";
import { C, F, S, sevColor } from "../design";
import { Badge, Card, Caveat, P, Section, VerdictPill } from "../ui";
import BUNDLED_SAMPLES from "../samples.json";
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
  // run Ollama. The same ten contracts now ship in the bundle; the API call
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
    try {
      await streamCouncil(
        code,
        (ev: StreamEvent) => {
          const e = ev as unknown as Record<string, unknown>;
          if (e.event === "routing") {
            setRoles((e.roles as string[]) || []);
            setPhase("scanning");
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
            setResult(e.result as CouncilResult);
            setPhase("done");
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

  const scanning = phase === "routing" || phase === "scanning";
  const canScanLive = Boolean(pre?.ready);
  // Only offer a cached result for UNEDITED sample code. Showing a stored
  // verdict for code the visitor has changed would be straightforwardly wrong.
  const cacheFor =
    active && code === active.code ? (CACHE.results[active.id] ?? null) : null;
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

          <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 12 }}>
            {canScanLive || scanning ? (
              <button
                onClick={scanning ? () => abort.current?.abort() : run}
                disabled={!code.trim()}
                style={{
                  background: scanning ? "transparent" : C.accent,
                  color: scanning ? C.inkMid : C.bg,
                  border: `1px solid ${scanning ? C.line : C.accent}`,
                  borderRadius: 7,
                  padding: "10px 20px",
                  fontFamily: F.sans,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: code.trim() ? "pointer" : "not-allowed",
                  opacity: code.trim() ? 1 : 0.45,
                }}
              >
                {scanning ? "Stop" : "Run scan"}
              </button>
            ) : (
              <button
                onClick={() => setCached(cacheFor)}
                disabled={!cacheFor}
                title={
                  cacheFor
                    ? "Show the result a real local scan produced for this contract"
                    : "No cached result for edited code — start the backend to scan it"
                }
                style={{
                  background: "transparent",
                  color: cacheFor ? C.accent : C.inkDim,
                  border: `1px solid ${cacheFor ? C.accentDim : C.line}`,
                  borderRadius: 7,
                  padding: "10px 20px",
                  fontFamily: F.sans,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: cacheFor ? "pointer" : "not-allowed",
                  opacity: cacheFor ? 1 : 0.5,
                }}
              >
                Show cached result
              </button>
            )}
            {scanning && (
              <span style={{ fontFamily: F.mono, fontSize: 13, color: C.inkMid }}>
                {phase === "routing" ? "routing…" : "council running…"} {elapsed.toFixed(1)}s
              </span>
            )}
            {!canScanLive && !preLoading && (
              <span style={{ fontFamily: F.sans, fontSize: 13, color: C.inkDim }}>
                {cacheFor
                  ? "No local backend — showing a previously measured scan."
                  : "No local backend, and this code has been edited, so there is no cached result for it."}
              </span>
            )}
          </div>

          {/* expected scan cost, so nobody thinks it hung */}
          {scanning && (
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

          {/* ── cached verdict (only when a live scan is impossible) ── */}
          {cached && !result && (
            <Section title="Cached result">
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
                  <Badge fg={C.inkDim} bg={C.inconcGhost}>
                    not a live scan
                  </Badge>
                  <span style={{ fontFamily: F.mono, fontSize: 12, color: C.inkDim }}>
                    measured {CACHE.generated_at.replace("T", " ")} · coder{" "}
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

              <Caveat title="Why a cached result is shown here">
                This page is static and can be opened anywhere, but a live scan
                needs Ollama running on the machine viewing it — a public host
                cannot do that. The verdict above is what the real pipeline
                returned on a local run, including where it disagreed with the
                sample. Start the backend to replace it with a live scan.
              </Caveat>
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
  if (loading) {
    return (
      <Card style={{ marginTop: 24 }}>
        <span style={{ fontFamily: F.mono, fontSize: 13, color: C.inkDim }}>
          checking local backend…
        </span>
      </Card>
    );
  }

  if (!pre) {
    return (
      <Card style={{ marginTop: 24, borderColor: C.lineHi }}>
        <div style={{ ...S.h3 }}>Backend not reachable</div>
        <P style={{ fontSize: 14, margin: "6px 0 10px" }}>
          The pages on this site are static and work anywhere, but a live scan
          needs the ThirdEye backend running locally. Start it and reload:
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
          {ok ? "Ready to scan locally" : "Not ready for a live scan"}
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
