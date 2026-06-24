import { useEffect, useState } from "react";
import { SectionLabel, Pill } from "../components/ui/primitives";

type Stage = {
  id: string;
  title: string;
  short: string;
  detail: string;
  models?: string[];
  tag: string;
};

const STAGES: Stage[] = [
  {
    id: "ingest",
    title: "Ingest",
    short: "Parse & normalize",
    tag: "input",
    detail:
      "The contract source is parsed, normalized, and split into analyzable units. Pragma, contract name, and structural features are extracted so downstream stages share one canonical view of the code.",
  },
  {
    id: "static",
    title: "Static / Slither",
    short: "Pattern detection",
    tag: "static",
    detail:
      "Slither and rule-based detectors run first — a cheap, deterministic pass that flags well-known patterns (reentrancy shapes, unchecked calls, tx.origin auth) and feeds the council concrete anchors to reason about.",
  },
  {
    id: "retrieval",
    title: "Retrieval Grounding",
    short: "Exploit corpus",
    tag: "rag",
    detail:
      "The contract is embedded and matched against a corpus of real historical exploits. Relevant precedents are injected into each specialist's context so the council reasons from documented attacks, not just priors.",
  },
  {
    id: "council",
    title: "Model-Diverse Council",
    short: "8 specialists",
    tag: "council",
    models: ["GPT-class", "Claude-class", "Gemini-class", "Llama-class", "Mistral-class", "+ more"],
    detail:
      "Eight specialists — each pinned to a different base model and a single vulnerability class (reentrancy, access control, arithmetic, business logic, oracle, flash-loan/MEV, DoS/gas, proxy) — examine the contract in parallel. Architectural diversity means a blind spot in one model is covered by another.",
  },
  {
    id: "arbitration",
    title: "Evidence-Anchored Arbitration",
    short: "Red-team / judge",
    tag: "judge",
    detail:
      "A judge stage cross-examines every claim against the source. Findings without a verbatim evidence quote are discarded; surviving findings are de-duplicated and assigned a calibrated severity and confidence. This is what kills hallucinated bugs.",
  },
  {
    id: "dynamic",
    title: "Dynamic Confirmation",
    short: "Foundry PoC",
    tag: "exploit",
    detail:
      "Suspected high-severity issues are escalated to dynamic execution: a Foundry proof-of-concept attempts the exploit against a forked instance. Only those that actually fire are labelled CONFIRMED-EXPLOITABLE — the rest stay SUSPECTED.",
  },
  {
    id: "report",
    title: "Report",
    short: "SARIF / CLI",
    tag: "output",
    detail:
      "A GO / NO-GO verdict is emitted alongside per-finding evidence, proposed invariants, and dynamic status. Output ships as a structured report (SARIF, CLI, PDF) ready to drop into CI or a review.",
  },
];

export function HowItWorks() {
  const [active, setActive] = useState(0); // looping highlight
  const [selected, setSelected] = useState<string | null>("council");
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => setActive((a) => (a + 1) % STAGES.length), 1400);
    return () => clearInterval(t);
  }, [paused]);

  const sel = STAGES.find((s) => s.id === selected) ?? STAGES[active];

  return (
    <div className="px-4 sm:px-6 py-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h2 className="text-lg font-bold text-white tracking-tight">How Argus Works</h2>
          <p className="text-[12px] text-slate-500 mt-0.5">
            Seven stages, from raw source to a confirmed verdict. Click a stage to inspect it.
          </p>
        </div>

        {/* Flowchart */}
        <div
          className="relative rounded-2xl border border-white/[0.07] bg-[#0c0f15] overflow-hidden"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          <div className="bg-grid opacity-50 absolute inset-0" aria-hidden="true" />
          <div className="relative px-5 py-7 overflow-x-auto">
            <div className="flex items-stretch gap-0 min-w-[860px]">
              {STAGES.map((s, i) => {
                const isActive = active === i;
                const isSelected = selected === s.id;
                const lit = isActive || isSelected;
                return (
                  <div key={s.id} className="flex items-center">
                    <button
                      onClick={() => setSelected(s.id)}
                      aria-pressed={isSelected}
                      className={`group relative w-[112px] rounded-xl border px-2.5 py-3 text-center transition-all duration-300 ${
                        isSelected
                          ? "border-cyan-400/50 bg-cyan-500/[0.10]"
                          : lit
                          ? "border-cyan-400/30 bg-cyan-500/[0.05]"
                          : "border-white/[0.08] bg-white/[0.015] hover:border-white/20"
                      }`}
                    >
                      <span
                        className={`mx-auto mb-2 flex w-9 h-9 items-center justify-center rounded-lg text-[10px] font-bold transition-colors ${
                          lit ? "bg-cyan-500/20 text-cyan-200 ring-1 ring-cyan-400/30" : "bg-white/[0.05] text-slate-400"
                        }`}
                        style={lit ? { boxShadow: "0 0 16px -4px rgba(34,211,238,0.5)" } : undefined}
                      >
                        {i + 1}
                      </span>
                      <div className={`text-[11px] font-semibold leading-tight ${lit ? "text-white" : "text-slate-300"}`}>
                        {s.title}
                      </div>
                      <div className="text-[9px] text-slate-500 mt-0.5">{s.short}</div>
                    </button>

                    {/* Connector with travelling token */}
                    {i < STAGES.length - 1 && (
                      <svg width="34" height="14" viewBox="0 0 34 14" className="flex-shrink-0" aria-hidden="true">
                        <line x1="0" y1="7" x2="34" y2="7" stroke="rgba(148,163,184,0.18)" strokeWidth="1.5" />
                        <line
                          x1="0"
                          y1="7"
                          x2="34"
                          y2="7"
                          stroke="#22d3ee"
                          strokeWidth="1.8"
                          strokeDasharray="5 27"
                          className="flow-dash"
                          style={{ opacity: active >= i ? 0.9 : 0.25 }}
                        />
                        <polygon points="30,3 34,7 30,11" fill={active >= i ? "#22d3ee" : "rgba(148,163,184,0.3)"} />
                      </svg>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="relative h-1 w-full">
            <div
              className="h-full bg-gradient-to-r from-cyan-400/70 to-transparent transition-all duration-700"
              style={{ width: `${((active + 1) / STAGES.length) * 100}%` }}
            />
          </div>
        </div>

        {/* Selected stage detail */}
        <div className="grid lg:grid-cols-[1.4fr_1fr] gap-4">
          <section className="rounded-xl border border-cyan-400/20 bg-cyan-500/[0.04] px-5 py-5 animate-fade-in" key={sel.id}>
            <div className="flex items-center gap-2.5 mb-2.5">
              <span className="w-8 h-8 rounded-lg bg-cyan-500/20 ring-1 ring-cyan-400/30 flex items-center justify-center text-[11px] font-bold text-cyan-200">
                {STAGES.findIndex((x) => x.id === sel.id) + 1}
              </span>
              <h3 className="text-[15px] font-bold text-white">{sel.title}</h3>
              <Pill tone="accent">{sel.tag}</Pill>
            </div>
            <p className="text-[13px] text-slate-300 leading-relaxed">{sel.detail}</p>
            {sel.models && (
              <div className="mt-4">
                <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500 mb-2">Model diversity</div>
                <div className="flex flex-wrap gap-1.5">
                  {sel.models.map((m) => (
                    <span
                      key={m}
                      className="text-[10px] font-mono text-cyan-300/80 bg-cyan-500/[0.08] ring-1 ring-cyan-400/15 px-2 py-0.5 rounded"
                    >
                      {m}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* The 8 specialists map (only meaningful but always informative) */}
          <section className="rounded-xl border border-white/[0.07] bg-[#0c0f15] px-5 py-5">
            <SectionLabel>The 8 Specialists</SectionLabel>
            <div className="grid grid-cols-2 gap-2">
              {[
                "Reentrancy",
                "Access Control",
                "Arithmetic",
                "Business Logic",
                "Oracle / Price",
                "Flash-loan / MEV",
                "DoS / Gas",
                "Proxy / Upgrade",
              ].map((r, i) => (
                <div
                  key={r}
                  className="flex items-center gap-2 text-[11px] text-slate-300 bg-white/[0.02] rounded-lg px-2.5 py-2"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400/70" style={{ animationDelay: `${i * 0.2}s` }} />
                  {r}
                </div>
              ))}
            </div>
            <p className="text-[10px] text-slate-500 mt-3 leading-relaxed">
              Each pinned to a different base model — diversity by construction.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
