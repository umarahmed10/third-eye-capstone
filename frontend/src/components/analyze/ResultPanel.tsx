import type { CouncilResult, CouncilVuln, CouncilStats, SimilarExploit } from "../../lib/api";
import { sevTokens, humanizeRole } from "../../lib/theme";
import { ShieldCheckIcon, AlertIcon, CheckIcon } from "../ui/icons";
import { ModelChip, ConfidenceMeter, SectionLabel, Eyebrow } from "../ui/primitives";

// ─── Verdict banner ───
export function VerdictBanner({ result }: { result: CouncilResult }) {
  const isGo = result.final_verdict === "GO";
  return (
    <section
      className="animate-scale-in relative overflow-hidden rounded-2xl border"
      style={{
        background: isGo
          ? "linear-gradient(135deg, rgba(16,185,129,0.12), rgba(14,10,20,0.35))"
          : "linear-gradient(135deg, rgba(244,63,94,0.13), rgba(14,10,20,0.35))",
        borderColor: isGo ? "rgba(16,185,129,0.28)" : "rgba(244,63,94,0.3)",
        boxShadow: isGo ? "0 0 60px -28px rgba(16,185,129,0.4)" : "0 0 60px -28px rgba(244,63,94,0.45)",
      }}
      aria-label={`Verdict ${result.final_verdict}`}
    >
      <div className="bg-grid opacity-40 absolute inset-0" aria-hidden="true" />
      <div className="relative flex flex-col sm:flex-row sm:items-center gap-5 px-6 py-5">
        <div
          className={`flex items-center gap-3 px-5 py-3 rounded-xl ring-1 flex-shrink-0 ${
            isGo ? "bg-emerald-500/12 ring-emerald-400/30" : "bg-rose-500/12 ring-rose-400/30"
          }`}
        >
          <span className={isGo ? "text-emerald-400" : "text-rose-400"}>
            {isGo ? <ShieldCheckIcon size={28} /> : <AlertIcon size={28} />}
          </span>
          <div>
            <div className={`text-2xl font-bold tracking-tight leading-none ${isGo ? "text-emerald-400" : "text-rose-400"}`}>
              {result.final_verdict}
            </div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400 mt-1">
              {isGo ? "Cleared by Council" : "Deployment Blocked"}
            </div>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          {result.contract_name && (
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Contract</span>
              <span className="text-sm font-mono font-semibold text-slate-200 truncate">{result.contract_name}</span>
            </div>
          )}
          {result.raven_note && (
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 flex-shrink-0 text-[9px] font-mono font-bold uppercase tracking-[0.14em] text-violet-200 bg-violet-500/15 ring-1 ring-violet-400/25 px-2 py-1 rounded-md">
                Raven's read
              </span>
              <p className="text-[13px] text-slate-300 leading-relaxed">{result.raven_note}</p>
            </div>
          )}
        </div>
      </div>
      <div
        className="h-1 w-full"
        style={{
          background: isGo
            ? "linear-gradient(90deg, rgba(16,185,129,0.55), transparent)"
            : "linear-gradient(90deg, rgba(244,63,94,0.65), transparent)",
        }}
      />
    </section>
  );
}

// ─── Stats strip ───
export function StatsStrip({ stats }: { stats: CouncilStats }) {
  return (
    <section aria-label="Council statistics" className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <Stat label="Models Run" value={stats.models_run} sub={stats.tier ? `${stats.tier} tier` : undefined} />
      <Stat label="Specialists" value={stats.specialists_run} sub="invoked" />
      <Stat label="Findings" value={stats.specialists_found} sub="flagged a risk" tone="danger" />
      <Stat label="Confirmed" value={stats.specialists_confirmed} sub="exploitable" tone="danger" />
    </section>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: number | string;
  sub?: string;
  tone?: "danger";
}) {
  return (
    <div className="rounded-xl bg-[#151021] border border-white/[0.07] px-4 py-3">
      <div className="text-[9px] uppercase tracking-[0.14em] text-slate-500 mb-1">{label}</div>
      <div className={`text-xl font-bold tabular-nums leading-none ${tone === "danger" && Number(value) > 0 ? "text-rose-400" : "text-white/90"}`}>
        {value}
      </div>
      {sub && <div className="text-[9px] font-mono text-slate-500 mt-1">{sub}</div>}
    </div>
  );
}

// ─── Confirmed vulnerabilities ───
function DynamicStatusBadge({ status }: { status: string }) {
  if (status === "CONFIRMED-EXPLOITABLE") {
    return (
      <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide text-rose-200 bg-rose-500/20 ring-1 ring-rose-400/40 px-2 py-0.5 rounded-md">
        <CheckIcon size={10} /> Confirmed Exploitable
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide text-amber-300 bg-amber-500/15 ring-1 ring-amber-400/30 px-2 py-0.5 rounded-md">
      Suspected
    </span>
  );
}

function VulnRow({ v }: { v: CouncilVuln }) {
  const s = sevTokens(v.severity);
  return (
    <article className={`rounded-xl ring-1 ${s.ring} ${s.bg} px-4 py-3.5 space-y-3`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${s.dot}`} aria-hidden="true" />
        <span className="text-[14px] font-semibold text-white/90 capitalize">{humanizeRole(v.type)}</span>
        <span className={`text-[9px] font-mono font-bold uppercase ${s.text}`}>{v.severity}</span>
        <div className="ml-auto">
          <DynamicStatusBadge status={v.dynamic_status} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <ModelChip model={v.model} provider={v.provider} />
        {v.source && (
          <span className="text-[9px] font-mono text-slate-400 bg-white/[0.05] px-1.5 py-0.5 rounded">via {v.source}</span>
        )}
        <div className="flex-1 min-w-[120px]">
          <ConfidenceMeter value={v.confidence} tone="danger" />
        </div>
      </div>
      {v.description && <p className="text-[12px] text-slate-400 leading-relaxed">{v.description}</p>}
      {v.evidence_quote && (
        <div>
          <Eyebrow>Evidence</Eyebrow>
          <pre className="text-[10px] font-mono text-rose-200/80 bg-black/40 ring-1 ring-rose-500/10 rounded-lg px-3 py-2 leading-relaxed whitespace-pre-wrap break-words max-h-44 overflow-auto">
            {v.evidence_quote}
          </pre>
        </div>
      )}
      {v.proposed_property && (
        <div>
          <Eyebrow>Proposed Invariant</Eyebrow>
          <p className="text-[11px] font-mono text-violet-200/75 bg-violet-500/[0.06] ring-1 ring-violet-400/12 rounded-lg px-3 py-2 leading-relaxed">
            {v.proposed_property}
          </p>
        </div>
      )}
    </article>
  );
}

export function VulnList({ vulnerabilities }: { vulnerabilities: CouncilVuln[] }) {
  if (!vulnerabilities || vulnerabilities.length === 0) {
    return (
      <section aria-label="Confirmed vulnerabilities">
        <SectionLabel count={0}>Confirmed Vulnerabilities</SectionLabel>
        <div className="rounded-xl border border-emerald-500/15 bg-emerald-500/[0.03] px-4 py-6 text-center">
          <p className="text-[13px] text-emerald-300/80">No vulnerabilities confirmed by the council.</p>
        </div>
      </section>
    );
  }
  const order = ["critical", "high", "medium", "low"];
  const sorted = [...vulnerabilities].sort(
    (a, b) => order.indexOf((a.severity || "").toLowerCase()) - order.indexOf((b.severity || "").toLowerCase())
  );
  return (
    <section aria-label="Confirmed vulnerabilities">
      <SectionLabel count={sorted.length}>Confirmed Vulnerabilities</SectionLabel>
      <div className="space-y-3">
        {sorted.map((v, i) => (
          <VulnRow key={`${v.type}-${i}`} v={v} />
        ))}
      </div>
    </section>
  );
}

// ─── Similar known exploits ───
export function PrecedentPanel({ exploits }: { exploits?: SimilarExploit[] }) {
  if (!exploits || exploits.length === 0) return null;
  return (
    <section aria-label="Similar known exploits">
      <SectionLabel count={exploits.length}>Similar Known Exploits</SectionLabel>
      <div className="grid gap-3 sm:grid-cols-2">
        {exploits.map((e, i) => {
          const s = e.severity ? sevTokens(e.severity) : null;
          return (
            <article key={i} className="rounded-xl border border-white/[0.07] bg-[#151021] px-4 py-3.5 space-y-2">
              <div className="flex items-center gap-2">
                {e.category && (
                  <span className="text-[12px] font-semibold text-slate-200 capitalize">
                    {e.category.replace(/_/g, " ")}
                  </span>
                )}
                {e.severity && s && (
                  <span className={`ml-auto text-[9px] font-mono font-bold uppercase ${s.text}`}>{e.severity}</span>
                )}
              </div>
              {e.snippet && (
                <pre className="text-[10px] font-mono text-slate-400 bg-black/35 ring-1 ring-white/[0.05] rounded-lg px-3 py-2 leading-relaxed whitespace-pre-wrap break-words max-h-36 overflow-auto">
                  {e.snippet}
                </pre>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
