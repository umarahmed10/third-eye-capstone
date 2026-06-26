import { useEffect, useRef, useState, type ChangeEvent } from "react";
import {
  streamCouncil,
  createSession,
  getSamples,
  type CouncilResult,
  type SampleContract,
  type StreamEvent,
  type User,
} from "../lib/api";
import { SPECIALIST_ROLES } from "../lib/theme";
import { SpecialistCard, type SpecialistState } from "../components/analyze/SpecialistCard";
import { VerdictBanner, StatsStrip, VulnList, PrecedentPanel } from "../components/analyze/ResultPanel";
import { SectionLabel, Spinner, Pill } from "../components/ui/primitives";
import { BoltIcon, UploadIcon, EyeIcon, ScanIcon, FlowIcon, ChartIcon, ArrowRightIcon } from "../components/ui/icons";
import type { Tab } from "../components/Layout";

type Phase = "idle" | "running" | "done" | "error";

function initialStates(): Record<string, SpecialistState> {
  const m: Record<string, SpecialistState> = {};
  for (const r of SPECIALIST_ROLES) m[r] = { role: r, status: "queued" };
  return m;
}

export function Analyze({
  user,
  onNavigate,
  onScanComplete,
}: {
  user: User;
  onNavigate?: (t: Tab) => void;
  onScanComplete?: () => void;
}) {
  const [code, setCode] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");
  const [tier, setTier] = useState<string>("");
  const [specs, setSpecs] = useState<Record<string, SpecialistState>>(initialStates);
  const [result, setResult] = useState<CouncilResult | null>(null);
  const [activeSample, setActiveSample] = useState<string | null>(null);

  const [samples, setSamples] = useState<SampleContract[]>([]);
  const [samplesErr, setSamplesErr] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editorRef = useRef<HTMLElement>(null);
  const sessionRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const order = SPECIALIST_ROLES as readonly string[];
  const list = order.map((r) => specs[r]);
  const doneCount = list.filter((s) => s.status === "done").length;
  const running = phase === "running";

  useEffect(() => {
    let alive = true;
    getSamples()
      .then((s) => alive && setSamples(s))
      .catch(() => alive && setSamplesErr(true));
    return () => {
      alive = false;
    };
  }, []);

  // Best-effort session — anonymous scans still work if this fails.
  async function ensureSession(): Promise<number | null> {
    if (sessionRef.current != null) return sessionRef.current;
    try {
      const s = await createSession(user.user_id);
      sessionRef.current = s.id;
      return s.id;
    } catch {
      return null;
    }
  }

  function reset() {
    setResult(null);
    setError("");
    setTier("");
    setSpecs(initialStates());
  }

  function focusEditor() {
    editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    setTimeout(() => textareaRef.current?.focus(), 350);
  }

  async function run(srcOverride?: string) {
    const trimmed = (srcOverride ?? code).trim();
    if (trimmed.length < 10 || running) return;
    reset();
    setPhase("running");
    try {
      const sid = await ensureSession();
      await runLive(trimmed, sid);
      setPhase("done");
      onScanComplete?.();
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        setPhase("idle");
        return;
      }
      setError(e instanceof Error ? e.message : "Analysis failed");
      setPhase("error");
    }
  }

  function applyFinal(r: CouncilResult) {
    setResult(r);
    if (r.council_detail?.length) {
      setSpecs((prev) => {
        const next = { ...prev };
        for (const d of r.council_detail!) {
          next[d.role] = {
            role: d.role,
            provider: d.provider,
            model: d.model,
            status: "done",
            found: d.found,
            confidence: d.confidence,
            severity: d.severity,
            evidence_quote: d.evidence_quote,
          };
        }
        return next;
      });
    }
  }

  async function runLive(trimmed: string, sid: number | null) {
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    await streamCouncil(
      trimmed,
      (ev: StreamEvent) => {
        if (ev.event === "start") {
          const start = ev as Extract<StreamEvent, { event: "start" }>;
          setTier(start.tier);
          setSpecs((prev) => {
            const next = { ...prev };
            for (const sp of start.specialists ?? []) {
              next[sp.role] = {
                ...(next[sp.role] || { role: sp.role }),
                role: sp.role,
                provider: sp.provider,
                model: sp.model,
                status: "analyzing",
              };
            }
            for (const r of SPECIALIST_ROLES) {
              if (next[r].status === "queued") next[r] = { ...next[r], status: "analyzing" };
            }
            return next;
          });
        } else if (ev.event === "specialist_done") {
          const d = ev as Extract<StreamEvent, { event: "specialist_done" }>;
          setSpecs((prev) => ({
            ...prev,
            [d.role]: {
              role: d.role,
              provider: d.provider,
              model: d.model,
              status: "done",
              found: d.found,
              confidence: d.confidence,
              severity: d.severity,
              evidence_quote: d.evidence_quote,
              llm_error: d.llm_error,
            },
          }));
        } else if (ev.event === "final") {
          const f = ev as Extract<StreamEvent, { event: "final" }>;
          applyFinal(f.result);
        }
      },
      { sessionId: sid, signal: ctrl.signal }
    );
  }

  function cancel() {
    abortRef.current?.abort();
  }

  function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setActiveSample(null);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setCode(reader.result);
        focusEditor();
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  function loadSample(s: SampleContract) {
    setActiveSample(s.id);
    setCode(s.code);
    focusEditor();
  }

  return (
    <div className="px-4 sm:px-6 py-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Hero header */}
        <header className="relative overflow-hidden rounded-2xl border border-violet-300/[0.10] bg-[#151021]">
          <div className="bg-grid opacity-40 absolute inset-0" aria-hidden="true" />
          <div
            className="absolute -right-24 -top-28 w-96 h-96 rounded-full blur-3xl"
            style={{ background: "radial-gradient(circle, rgba(168,85,247,0.16), transparent 70%)" }}
            aria-hidden="true"
          />
          <div className="relative px-6 sm:px-8 py-7 flex items-center gap-5">
            <div className="text-violet-300 flex-shrink-0">
              <ScanIcon size={34} />
            </div>
            <div className="min-w-0">
              <h2 className="text-xl font-bold text-white tracking-tight leading-tight">
                Audit a contract with the Third-Eye council.
              </h2>
              <p className="text-[13px] text-violet-200/60 mt-1.5 max-w-2xl leading-relaxed">
                Eight model-diverse specialists examine your Solidity live. When they finish,
                <span className="text-violet-200/90"> Raven </span>
                delivers a single, defensible verdict.
              </p>
            </div>
          </div>
        </header>

        {/* Three ways to provide a contract */}
        <div className="grid sm:grid-cols-3 gap-3">
          <ProvideCard
            icon={<ScanIcon size={16} />}
            title="Paste source"
            body="Drop a Solidity contract into the editor below."
            onClick={focusEditor}
          />
          <ProvideCard
            icon={<UploadIcon size={16} />}
            title="Upload .sol"
            body="Load a file straight from your machine."
            onClick={() => fileRef.current?.click()}
          />
          <ProvideCard
            icon={<EyeIcon size={16} />}
            title="Try a sample"
            body="No contract handy? Pick one from below."
            onClick={() =>
              document.getElementById("samples")?.scrollIntoView({ behavior: "smooth", block: "start" })
            }
          />
        </div>

        {/* Code editor */}
        <section
          ref={editorRef}
          className="rounded-xl border border-violet-300/[0.10] bg-[#151021] overflow-hidden focus-within:border-violet-400/40 transition-colors scroll-mt-4"
        >
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-violet-300/[0.08]">
            <span className="text-[10px] uppercase tracking-[0.16em] text-violet-300/55">Solidity Source</span>
            {activeSample && <Pill tone="accent">sample loaded</Pill>}
            <input ref={fileRef} type="file" className="hidden" accept=".sol,.vy,.txt" onChange={handleFile} />
            <div className="ml-auto flex items-center gap-3">
              {code && (
                <button
                  type="button"
                  onClick={() => {
                    setCode("");
                    setActiveSample(null);
                  }}
                  className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
                >
                  Clear
                </button>
              )}
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="text-[10px] text-violet-300/70 hover:text-violet-200 transition-colors flex items-center gap-1"
              >
                <UploadIcon size={12} /> Upload .sol
              </button>
            </div>
          </div>
          <textarea
            ref={textareaRef}
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              setActiveSample(null);
            }}
            disabled={running}
            spellCheck={false}
            rows={12}
            placeholder={"// Paste your Solidity contract here\npragma solidity ^0.8.0;\n\ncontract MyContract {\n  ...\n}"}
            className="w-full bg-transparent outline-none resize-y text-[12px] font-mono leading-relaxed text-slate-300 placeholder:text-slate-600 px-4 py-3 min-h-[220px]"
          />
          <div className="flex items-center gap-3 px-4 py-3 border-t border-violet-300/[0.08]">
            <span className="text-[10px] font-mono text-slate-500">{code.length} chars</span>
            {tier && <Pill tone="accent">{tier} tier</Pill>}
            {running ? (
              <button
                onClick={cancel}
                className="ml-auto inline-flex items-center gap-2 px-4 py-2 rounded-lg text-[12px] font-semibold border border-white/[0.12] text-slate-300 hover:bg-white/[0.04] transition-colors"
              >
                <Spinner size={13} /> Cancel
              </button>
            ) : (
              <button
                onClick={() => run()}
                disabled={code.trim().length < 10}
                className="ml-auto inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-[12.5px] font-semibold bg-gradient-to-b from-violet-500 to-violet-600 hover:from-violet-400 hover:to-violet-500 text-white shadow-[0_8px_24px_-10px_rgba(168,85,247,0.8)] transition-colors disabled:opacity-25 disabled:cursor-not-allowed disabled:shadow-none"
              >
                <BoltIcon size={14} />
                Run Third-Eye
              </button>
            )}
          </div>
        </section>

        {error && (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/[0.08] px-4 py-3 text-[12px] text-rose-200">
            {error}
          </div>
        )}

        {/* Live progress */}
        {(running || phase === "done") && (
          <div className="rounded-xl border border-violet-300/[0.10] bg-[#151021] px-5 py-4 animate-fade-in">
            <div className="flex items-center gap-3">
              <span
                className={`w-2 h-2 rounded-full ${running ? "bg-violet-400 animate-pulse-glow" : "bg-emerald-400"}`}
              />
              <span className="text-[13px] font-medium text-slate-200">
                {running ? "Council in session — specialists examining attack surfaces…" : "Council adjourned."}
              </span>
              <span className="ml-auto text-[11px] font-mono text-slate-400 tabular-nums">
                {doneCount} / {order.length}
              </span>
            </div>
            <div className="mt-3 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-violet-400 to-fuchsia-400 rounded-full transition-all duration-500"
                style={{ width: `${(doneCount / order.length) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Specialist grid */}
        {(running || phase === "done") && (
          <section aria-label="Specialist council">
            <SectionLabel count={order.length}>The Council</SectionLabel>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {list.map((s, i) => (
                <SpecialistCard key={s.role} s={s} index={i} />
              ))}
            </div>
          </section>
        )}

        {/* Final result */}
        {phase === "done" && result && (
          <div className="space-y-5 animate-fade-in pt-1">
            <VerdictBanner result={result} />
            {result.stats && <StatsStrip stats={result.stats} />}
            <VulnList vulnerabilities={result.vulnerabilities ?? []} />
            <PrecedentPanel exploits={result.similar_exploits} />
            {result.summary && (
              <section className="rounded-xl border border-violet-300/[0.10] bg-[#151021] px-5 py-4">
                <SectionLabel>Summary</SectionLabel>
                <p className="text-[13px] text-slate-400 leading-relaxed">{result.summary}</p>
              </section>
            )}
          </div>
        )}

        {/* Sample contracts */}
        <section id="samples" className="scroll-mt-4 pt-1">
          <SectionLabel count={samples.length || undefined}>Sample contracts — try it instantly</SectionLabel>
          {samplesErr ? (
            <div className="rounded-xl border border-violet-300/[0.08] bg-white/[0.01] px-5 py-6 text-center text-[12px] text-slate-500">
              Couldn't load samples right now — paste or upload a contract above to get started.
            </div>
          ) : samples.length === 0 ? (
            <div className="rounded-xl border border-violet-300/[0.08] bg-white/[0.01] px-5 py-6 text-center text-[12px] text-slate-500">
              <Spinner /> <span className="ml-2 align-middle">Loading samples…</span>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {samples.map((s) => (
                <SampleCard
                  key={s.id}
                  s={s}
                  active={activeSample === s.id}
                  disabled={running}
                  onLoad={() => loadSample(s)}
                  onRun={() => {
                    setActiveSample(s.id);
                    setCode(s.code);
                    focusEditor();
                    run(s.code);
                  }}
                />
              ))}
            </div>
          )}
        </section>

        {/* Idle explainer (only before first run) */}
        {phase === "idle" && (
          <div className="rounded-xl border border-violet-300/[0.08] bg-white/[0.01] px-6 py-8 text-center">
            <div className="inline-flex w-12 h-12 rounded-2xl bg-violet-500/12 ring-1 ring-violet-400/20 items-center justify-center text-violet-300/80 mb-3">
              <EyeIcon size={22} />
            </div>
            <p className="text-[13px] text-slate-300 mb-1">Eight specialists, each pinned to a different base model.</p>
            <p className="text-[12px] text-slate-500 max-w-md mx-auto">
              You'll watch every verdict land live as it arrives — then Raven sums it up.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-1.5 mt-4">
              {SPECIALIST_ROLES.map((r) => (
                <span
                  key={r}
                  className="inline-flex items-center gap-1 text-[9px] font-mono text-violet-300/55 bg-violet-500/[0.06] px-2 py-1 rounded"
                >
                  <EyeIcon size={9} />
                  {r.replace(/_/g, " ")}
                </span>
              ))}
            </div>
            {onNavigate && (
              <div className="flex flex-wrap items-center justify-center gap-2 mt-5">
                <button
                  onClick={() => onNavigate("how")}
                  className="inline-flex items-center gap-1.5 text-[11px] text-violet-300/80 hover:text-violet-200 transition-colors"
                >
                  <FlowIcon size={13} /> How it works
                </button>
                <span className="text-slate-700">·</span>
                <button
                  onClick={() => onNavigate("benchmarks")}
                  className="inline-flex items-center gap-1.5 text-[11px] text-violet-300/80 hover:text-violet-200 transition-colors"
                >
                  <ChartIcon size={13} /> Benchmarks
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ProvideCard({
  icon,
  title,
  body,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group flex items-start gap-3 rounded-xl border border-violet-300/[0.10] bg-[#151021] px-4 py-3.5 text-left hover:border-violet-400/35 hover:bg-violet-500/[0.05] transition-colors"
    >
      <span className="mt-0.5 w-8 h-8 rounded-lg bg-violet-500/12 ring-1 ring-violet-400/20 flex items-center justify-center text-violet-300 flex-shrink-0 transition-colors">
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-[12.5px] font-semibold text-slate-200">{title}</div>
        <div className="text-[10.5px] text-slate-500 leading-snug mt-0.5">{body}</div>
      </div>
    </button>
  );
}

function SampleCard({
  s,
  active,
  disabled,
  onLoad,
  onRun,
}: {
  s: SampleContract;
  active: boolean;
  disabled: boolean;
  onLoad: () => void;
  onRun: () => void;
}) {
  const noGo = s.expected === "NO-GO";
  return (
    <article
      className={`flex flex-col rounded-xl border px-4 py-3.5 transition-colors ${
        active ? "border-violet-400/45 bg-violet-500/[0.07]" : "border-violet-300/[0.10] bg-[#151021] hover:border-violet-400/25"
      }`}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold text-slate-100 truncate">{s.name}</div>
          <div className="text-[9.5px] uppercase tracking-[0.14em] text-violet-300/50 mt-0.5">{s.category}</div>
        </div>
        <span
          className={`flex-shrink-0 text-[9px] font-mono font-bold uppercase tracking-wide px-2 py-0.5 rounded-md ring-1 ${
            noGo
              ? "text-rose-200 bg-rose-500/15 ring-rose-400/30"
              : "text-emerald-200 bg-emerald-500/12 ring-emerald-400/25"
          }`}
          title={`Expected verdict: ${s.expected}`}
        >
          {s.expected}
        </span>
      </div>
      <p className="text-[11px] text-slate-500 leading-relaxed mt-2 flex-1">{s.blurb}</p>
      <div className="flex items-center gap-2 mt-3">
        <button
          onClick={onRun}
          disabled={disabled}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-violet-500/90 hover:bg-violet-400 text-white transition-colors disabled:opacity-30"
        >
          <BoltIcon size={12} /> Analyze
        </button>
        <button
          onClick={onLoad}
          disabled={disabled}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-violet-300/80 hover:text-violet-200 hover:bg-white/[0.04] transition-colors disabled:opacity-30"
        >
          Load <ArrowRightIcon size={12} />
        </button>
      </div>
    </article>
  );
}
