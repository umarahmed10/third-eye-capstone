import { useRef, useState, type ChangeEvent } from "react";
import {
  streamCouncil,
  analyzeStandard,
  analyzeArgus,
  createSession,
  type CouncilResult,
  type StreamEvent,
  type User,
} from "../lib/api";
import { SPECIALIST_ROLES } from "../lib/theme";
import { SpecialistCard, type SpecialistState } from "../components/analyze/SpecialistCard";
import { VerdictBanner, StatsStrip, VulnList, PrecedentPanel } from "../components/analyze/ResultPanel";
import { SectionLabel, Spinner, Pill } from "../components/ui/primitives";
import { BoltIcon, UploadIcon, EyeIcon, ScanIcon } from "../components/ui/icons";

type Mode = "live" | "argus" | "standard";
type Phase = "idle" | "running" | "done" | "error";

const SAMPLE = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Vault {
    mapping(address => uint256) public balances;

    function deposit() external payable {
        balances[msg.sender] += msg.value;
    }

    function withdraw() external {
        uint256 bal = balances[msg.sender];
        require(bal > 0, "no balance");
        (bool ok, ) = msg.sender.call{value: bal}("");
        require(ok, "transfer failed");
        balances[msg.sender] = 0;
    }
}`;

function initialStates(): Record<string, SpecialistState> {
  const m: Record<string, SpecialistState> = {};
  for (const r of SPECIALIST_ROLES) m[r] = { role: r, status: "queued" };
  return m;
}

export function Analyze({ user, onScanComplete }: { user: User; onScanComplete?: () => void }) {
  const [mode, setMode] = useState<Mode>("live");
  const [code, setCode] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");
  const [tier, setTier] = useState<string>("");
  const [specs, setSpecs] = useState<Record<string, SpecialistState>>(initialStates);
  const [result, setResult] = useState<CouncilResult | null>(null);

  // argus toggles
  const [useRetrieval, setUseRetrieval] = useState(true);
  const [useArbitration, setUseArbitration] = useState(true);
  const [useDynamic, setUseDynamic] = useState(true);

  const fileRef = useRef<HTMLInputElement>(null);
  const sessionRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const order = SPECIALIST_ROLES as readonly string[];
  const list = order.map((r) => specs[r]);
  const doneCount = list.filter((s) => s.status === "done").length;
  const running = phase === "running";

  async function ensureSession(): Promise<number> {
    if (sessionRef.current != null) return sessionRef.current;
    const s = await createSession(user.user_id);
    sessionRef.current = s.id;
    return s.id;
  }

  function reset() {
    setResult(null);
    setError("");
    setTier("");
    setSpecs(initialStates());
  }

  async function run() {
    const trimmed = code.trim();
    if (trimmed.length < 10 || running) return;
    reset();
    setPhase("running");
    try {
      const sid = await ensureSession();
      if (mode === "live") {
        await runLive(trimmed, sid);
      } else if (mode === "argus") {
        const r = await analyzeArgus(
          trimmed,
          { use_retrieval: useRetrieval, use_arbitration: useArbitration, use_dynamic: useDynamic },
          sid
        );
        applyFinal(r);
      } else {
        const r = await analyzeStandard(trimmed, sid, user.user_id);
        applyFinal(r);
      }
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
    // Hydrate specialist cards from council_detail when present.
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

  async function runLive(trimmed: string, sid: number) {
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
            // mark every known specialist as analyzing + attach model meta
            for (const sp of start.specialists) {
              next[sp.role] = {
                ...(next[sp.role] || { role: sp.role }),
                role: sp.role,
                provider: sp.provider,
                model: sp.model,
                status: "analyzing",
              };
            }
            // any role without meta still goes analyzing
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
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" && setCode(reader.result);
    reader.readAsText(file);
  }

  return (
    <div className="px-4 sm:px-6 py-6">
      <div className="max-w-6xl mx-auto space-y-5">
        {/* Header + mode */}
        <div className="flex flex-col sm:flex-row sm:items-end gap-3">
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight">New Analysis</h2>
            <p className="text-[12px] text-slate-500 mt-0.5">
              Paste a Solidity contract and watch the council resolve in real time.
            </p>
          </div>
          <div className="sm:ml-auto inline-flex rounded-lg bg-white/[0.03] border border-white/[0.07] p-0.5">
            {(
              [
                ["live", "Live Council"],
                ["argus", "Full Pipeline"],
                ["standard", "Standard"],
              ] as const
            ).map(([m, label]) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                disabled={running}
                className={`px-3 py-1.5 rounded-md text-[11px] font-medium transition-colors disabled:opacity-40 ${
                  mode === m ? "bg-cyan-500/20 text-cyan-200 ring-1 ring-cyan-400/25" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Argus toggles */}
        {mode === "argus" && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-white/[0.07] bg-[#0c0f15] px-3 py-2.5">
            <span className="text-[10px] uppercase tracking-[0.14em] text-slate-500 mr-1">Pipeline stages</span>
            <Toggle label="Retrieval grounding" on={useRetrieval} set={setUseRetrieval} disabled={running} />
            <Toggle label="Arbitration" on={useArbitration} set={setUseArbitration} disabled={running} />
            <Toggle label="Dynamic confirmation" on={useDynamic} set={setUseDynamic} disabled={running} />
          </div>
        )}

        {/* Code editor */}
        <section className="rounded-xl border border-white/[0.07] bg-[#0c0f15] overflow-hidden focus-within:border-cyan-400/30 transition-colors">
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/[0.06]">
            <span className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Solidity Source</span>
            <input ref={fileRef} type="file" className="hidden" accept=".sol,.vy,.txt" onChange={handleFile} />
            <div className="ml-auto flex items-center gap-3">
              <button
                type="button"
                onClick={() => setCode(SAMPLE)}
                className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
              >
                Load sample
              </button>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors flex items-center gap-1"
              >
                <UploadIcon size={12} /> Upload
              </button>
            </div>
          </div>
          <textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            disabled={running}
            spellCheck={false}
            rows={12}
            placeholder={"// Paste your Solidity contract here\npragma solidity ^0.8.0;\n\ncontract MyContract {\n  ...\n}"}
            className="w-full bg-transparent outline-none resize-y text-[12px] font-mono leading-relaxed text-slate-300 placeholder:text-slate-600 px-4 py-3 min-h-[220px]"
          />
          <div className="flex items-center gap-3 px-4 py-3 border-t border-white/[0.06]">
            <span className="text-[10px] font-mono text-slate-500">{code.length} chars</span>
            {tier && <Pill tone="accent">{tier} tier</Pill>}
            {running ? (
              <button
                onClick={cancel}
                className="ml-auto inline-flex items-center gap-2 px-4 py-2 rounded-lg text-[12px] font-semibold border border-white/[0.1] text-slate-300 hover:bg-white/[0.04] transition-colors"
              >
                <Spinner size={13} /> Cancel
              </button>
            ) : (
              <button
                onClick={run}
                disabled={code.trim().length < 10}
                className="ml-auto inline-flex items-center gap-2 px-4 py-2 rounded-lg text-[12px] font-semibold bg-cyan-500 hover:bg-cyan-400 text-[#06181c] transition-colors disabled:opacity-25 disabled:cursor-not-allowed"
              >
                <BoltIcon size={13} />
                {mode === "live" ? "Run Live Council" : mode === "argus" ? "Run Full Pipeline" : "Run Standard Scan"}
              </button>
            )}
          </div>
        </section>

        {error && (
          <div className="rounded-lg border border-rose-500/25 bg-rose-500/[0.07] px-4 py-3 text-[12px] text-rose-300">
            {error}
          </div>
        )}

        {/* Live progress bar (only for live council) */}
        {(running || phase === "done") && mode !== "standard" && (
          <div className="rounded-xl border border-white/[0.07] bg-[#0c0f15] px-5 py-4 animate-fade-in">
            <div className="flex items-center gap-3">
              <span
                className={`w-2 h-2 rounded-full ${running ? "bg-cyan-400 animate-pulse-glow" : "bg-emerald-400"}`}
              />
              <span className="text-[13px] font-medium text-slate-200">
                {running ? "Council in session — specialists examining attack surfaces…" : "Council adjourned."}
              </span>
              <span className="ml-auto text-[11px] font-mono text-slate-400 tabular-nums">{doneCount} / {order.length}</span>
            </div>
            <div className="mt-3 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
              <div
                className="h-full bg-cyan-400/70 rounded-full transition-all duration-500"
                style={{ width: `${(doneCount / order.length) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Specialist grid — shown while running OR for live/argus results */}
        {(running || (phase === "done" && mode !== "standard")) && (
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
            <VulnList vulnerabilities={result.vulnerabilities || []} />
            <PrecedentPanel exploits={result.similar_exploits} />
            {result.summary && (
              <section className="rounded-xl border border-white/[0.07] bg-[#0c0f15] px-5 py-4">
                <SectionLabel>Summary</SectionLabel>
                <p className="text-[13px] text-slate-400 leading-relaxed">{result.summary}</p>
              </section>
            )}
          </div>
        )}

        {/* Idle empty state */}
        {phase === "idle" && (
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.01] px-6 py-12 text-center">
            <div className="inline-flex w-14 h-14 rounded-2xl bg-cyan-500/10 ring-1 ring-cyan-400/15 items-center justify-center text-cyan-300/80 mb-4">
              <ScanIcon size={26} />
            </div>
            <p className="text-[14px] text-slate-300 mb-1">Paste a contract to convene the council.</p>
            <p className="text-[12px] text-slate-500 max-w-md mx-auto">
              Eight specialists, each pinned to a different base model, examine your code live — you'll
              watch each verdict land as it arrives.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-1.5 mt-5">
              {SPECIALIST_ROLES.map((r) => (
                <span key={r} className="inline-flex items-center gap-1 text-[9px] font-mono text-slate-500 bg-white/[0.03] px-2 py-1 rounded">
                  <EyeIcon size={9} />
                  {r.replace(/_/g, " ")}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Toggle({
  label,
  on,
  set,
  disabled,
}: {
  label: string;
  on: boolean;
  set: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => set(!on)}
      className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors disabled:opacity-40 ${
        on ? "bg-cyan-500/15 text-cyan-200 ring-1 ring-cyan-400/25" : "bg-white/[0.04] text-slate-400"
      }`}
    >
      <span className={`w-2 h-2 rounded-full ${on ? "bg-cyan-300" : "bg-slate-600"}`} />
      {label}
    </button>
  );
}
