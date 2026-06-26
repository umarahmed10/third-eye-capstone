import { useEffect, useState } from "react";
import {
  getBenchmarkStats,
  type BenchmarkStats,
  type AblationSample,
  type VulnDistEntry,
} from "../lib/api";
import { KpiCard, SectionLabel, Spinner, Pill } from "../components/ui/primitives";
import { GroupedBars, DistributionBars, VerticalBars } from "../components/ui/charts";
import { CHART_COLORS } from "../lib/theme";

export function Benchmarks() {
  const [data, setData] = useState<BenchmarkStats | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    getBenchmarkStats()
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center gap-2 text-slate-500 text-[13px]">
        <Spinner /> Loading benchmark data…
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-4 sm:px-6 py-10">
        <div className="max-w-md mx-auto rounded-xl border border-rose-500/25 bg-rose-500/[0.07] px-5 py-6 text-center">
          <p className="text-[13px] text-rose-200 font-medium">Couldn't load benchmarks</p>
          <p className="text-[11px] text-rose-300/70 mt-1.5">{error}</p>
          <p className="text-[11px] text-slate-500 mt-3">
            The benchmark endpoint may be offline. Try again shortly.
          </p>
        </div>
      </div>
    );
  }

  // ── Defensive extraction — every field may be missing. ──
  const d = data ?? {};
  const kpis = d.kpis ?? [];
  const ablationConfigs = d.ablation?.configs ?? [];
  const ablationSample = d.ablation?.sample;
  const baselines = d.published_baselines ?? [];
  const smartbugs = d.vuln_distribution?.smartbugs_curated ?? [];
  const web3bugs = d.vuln_distribution?.web3bugs ?? [];

  const hasAnything =
    kpis.length > 0 ||
    ablationConfigs.length > 0 ||
    baselines.length > 0 ||
    smartbugs.length > 0 ||
    web3bugs.length > 0 ||
    !!d.thesis;

  return (
    <div className="px-4 sm:px-6 py-6">
      <div className="max-w-6xl mx-auto space-y-7">
        <div>
          <h2 className="text-lg font-bold text-white tracking-tight">Benchmarks &amp; Results</h2>
          {d.thesis && (
            <p className="text-[12px] text-violet-200/55 mt-1 max-w-3xl leading-relaxed">{d.thesis}</p>
          )}
        </div>

        {!hasAnything && (
          <div className="rounded-xl border border-violet-300/[0.10] bg-[#151021] px-6 py-10 text-center">
            <p className="text-[13px] text-slate-300">No benchmark data available yet.</p>
            <p className="text-[12px] text-slate-500 mt-1.5">
              Results will appear here once the evaluation runs are published.
            </p>
          </div>
        )}

        {/* KPI cards */}
        {kpis.length > 0 && (
          <section>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {kpis.map((k, i) => (
                <KpiCard
                  key={`${k.label}-${i}`}
                  label={k.label}
                  value={k.value}
                  sub={k.sub}
                  delta={k.delta}
                  accent={i === 0}
                />
              ))}
            </div>
          </section>
        )}

        {/* Ablation */}
        {ablationConfigs.length > 0 && (
          <section>
            <SectionLabel count={ablationConfigs.length}>
              Ablation — single LLM vs council vs council + arbitration
            </SectionLabel>
            <div className="grid lg:grid-cols-[1fr_1fr] gap-4">
              <div className="rounded-xl border border-violet-300/[0.10] bg-[#151021] px-5 py-5">
                <GroupedBars
                  rows={ablationConfigs.map((c) => ({
                    label: prettyConfig(c.config),
                    values: {
                      precision: num(c.precision),
                      recall: num(c.recall),
                      f1: num(c.f1),
                    },
                  }))}
                  metrics={[
                    { key: "precision", label: "Precision", color: "#a855f7" },
                    { key: "recall", label: "Recall", color: "#c4b5fd" },
                    { key: "f1", label: "F1", color: "#e8c468" },
                  ]}
                />
                {ablationSample !== undefined && (
                  <p className="text-[10px] text-slate-500 mt-4">{describeSample(ablationSample)}</p>
                )}
                {d.ablation?.task && (
                  <p className="text-[10px] text-slate-500 mt-1">Task: {d.ablation.task}</p>
                )}
              </div>

              {/* Confusion matrix table */}
              <div className="rounded-xl border border-violet-300/[0.10] bg-[#151021] overflow-x-auto">
                <table className="w-full text-[11px] min-w-[420px]">
                  <thead>
                    <tr className="border-b border-violet-300/[0.08] bg-white/[0.02] text-slate-500">
                      <th className="text-left px-3 py-2 font-medium">Config</th>
                      <th className="text-right px-2 py-2 font-medium">P</th>
                      <th className="text-right px-2 py-2 font-medium">R</th>
                      <th className="text-right px-2 py-2 font-medium">TP</th>
                      <th className="text-right px-2 py-2 font-medium">FP</th>
                      <th className="text-right px-2 py-2 font-medium">TN</th>
                      <th className="text-right px-2 py-2 font-medium">FN</th>
                      <th className="text-right px-3 py-2 font-medium">F1</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ablationConfigs.map((c, i) => (
                      <tr key={`${c.config}-${i}`} className="border-b border-white/[0.03] last:border-0">
                        <td className="px-3 py-2.5 text-slate-200 font-medium">{prettyConfig(c.config)}</td>
                        <td className="px-2 py-2.5 text-right font-mono text-slate-300 tabular-nums">{ratio(c.precision)}</td>
                        <td className="px-2 py-2.5 text-right font-mono text-slate-300 tabular-nums">{ratio(c.recall)}</td>
                        <td className="px-2 py-2.5 text-right font-mono text-emerald-300 tabular-nums">{intg(c.tp)}</td>
                        <td className="px-2 py-2.5 text-right font-mono text-rose-300 tabular-nums">{intg(c.fp)}</td>
                        <td className="px-2 py-2.5 text-right font-mono text-slate-400 tabular-nums">{intg(c.tn)}</td>
                        <td className="px-2 py-2.5 text-right font-mono text-amber-300 tabular-nums">{intg(c.fn)}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-violet-200 font-semibold tabular-nums">{ratio(c.f1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {/* Vulnerability distribution */}
        {(smartbugs.length > 0 || web3bugs.length > 0) && (
          <section>
            <SectionLabel>Most common vulnerabilities in the wild</SectionLabel>
            <div className="grid lg:grid-cols-2 gap-4">
              <DistCard title="SmartBugs Curated" color="#a855f7" data={smartbugs} />
              <DistCard title="Web3Bugs" color="#e8c468" data={web3bugs} />
            </div>
          </section>
        )}

        {/* Published baselines */}
        {baselines.length > 0 && (
          <section>
            <SectionLabel count={baselines.length}>Published baselines — to be reproduced</SectionLabel>
            <div className="grid lg:grid-cols-[1.3fr_1fr] gap-4">
              <div className="rounded-xl border border-violet-300/[0.10] bg-[#151021] overflow-x-auto">
                <table className="w-full text-[11px] min-w-[440px]">
                  <thead>
                    <tr className="border-b border-violet-300/[0.08] bg-white/[0.02] text-slate-500">
                      <th className="text-left px-3 py-2 font-medium">Tool</th>
                      <th className="text-left px-3 py-2 font-medium">Dataset</th>
                      <th className="text-right px-2 py-2 font-medium">Recall</th>
                      <th className="text-right px-2 py-2 font-medium">F1</th>
                      <th className="text-right px-3 py-2 font-medium">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {baselines.map((b, i) => (
                      <tr key={`${b.tool}-${i}`} className="border-b border-white/[0.03] last:border-0 align-top">
                        <td className="px-3 py-2.5">
                          <div className="text-slate-200 font-medium">{b.tool}</div>
                          {b.note && <div className="text-[9px] text-slate-500 mt-0.5 max-w-[200px]">{b.note}</div>}
                        </td>
                        <td className="px-3 py-2.5 text-slate-400">{b.dataset}</td>
                        <td className="px-2 py-2.5 text-right font-mono text-slate-300 tabular-nums">{ratio(b.recall)}</td>
                        <td className="px-2 py-2.5 text-right font-mono text-violet-200 tabular-nums">{ratio(b.f1)}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-slate-400">{b.cost ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="px-3 py-2 border-t border-violet-300/[0.08] flex flex-wrap items-center gap-2">
                  <Pill>published — to be reproduced</Pill>
                  <span className="text-[10px] text-slate-500">
                    Figures from published literature — NOT Third-Eye's own results.
                  </span>
                </div>
              </div>

              <div className="rounded-xl border border-violet-300/[0.10] bg-[#151021] px-5 py-5">
                <div className="text-[11px] uppercase tracking-[0.16em] text-violet-300/55 mb-3">
                  Published F1 comparison
                </div>
                <VerticalBars
                  data={baselines
                    .filter((b) => b.f1 != null)
                    .slice(0, 6)
                    .map((b) => ({ label: b.tool, value: num(b.f1) }))}
                  color={CHART_COLORS[0]}
                  height={160}
                />
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function DistCard({
  title,
  data,
  color,
}: {
  title: string;
  data: VulnDistEntry[];
  color: string;
}) {
  if (!data || data.length === 0) return null;
  return (
    <div className="rounded-xl border border-violet-300/[0.10] bg-[#151021] px-5 py-5">
      <div className="flex items-center gap-2 mb-4">
        <span className="w-2 h-2 rounded-full" style={{ background: color }} />
        <span className="text-[12px] font-semibold text-slate-200">{title}</span>
        <span className="ml-auto text-[10px] font-mono text-slate-500">{data.length} categories</span>
      </div>
      <DistributionBars data={data.slice(0, 10)} color={color} />
    </div>
  );
}

function prettyConfig(c: string | undefined): string {
  if (!c) return "—";
  return c
    .replace(/_/g, " ")
    .replace(/\bllm\b/i, "LLM")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

// Coerce any unknown numeric-ish value to a finite number.
function num(v: number | null | undefined): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

// 0..1 ratio → fixed; passes through "—" when missing.
function ratio(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v <= 1 ? v.toFixed(3) : String(v);
}

function intg(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return String(v);
}

function describeSample(s: AblationSample | number | string): string {
  if (typeof s === "number" || typeof s === "string") return `Sample size: ${s}`;
  const parts: string[] = [];
  if (s.n != null) parts.push(`n=${s.n}`);
  if (s.pos != null) parts.push(`pos=${s.pos}`);
  if (s.neg != null) parts.push(`neg=${s.neg}`);
  if (s.seed != null) parts.push(`seed=${s.seed}`);
  return parts.length ? `Sample: ${parts.join(" · ")}` : "Sample size: —";
}
