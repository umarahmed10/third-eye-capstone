import { useEffect, useState } from "react";
import { getBenchmarkStats, type BenchmarkStats } from "../lib/api";
import { KpiCard, SectionLabel, Spinner, Pill } from "../components/ui/primitives";
import { GroupedBars, DistributionBars, VerticalBars } from "../components/ui/charts";
import { CHART_COLORS } from "../lib/theme";

export function Benchmarks() {
  const [data, setData] = useState<BenchmarkStats | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
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
      <div className="px-6 py-10">
        <div className="max-w-md mx-auto rounded-lg border border-rose-500/25 bg-rose-500/[0.07] px-4 py-3 text-[12px] text-rose-300">
          {error}
        </div>
      </div>
    );
  }
  if (!data) return null;

  const ablation = data.ablation?.configs ?? [];
  const baselines = data.published_baselines ?? [];

  return (
    <div className="px-4 sm:px-6 py-6">
      <div className="max-w-6xl mx-auto space-y-7">
        <div>
          <h2 className="text-lg font-bold text-white tracking-tight">Benchmarks & Results</h2>
          {data.thesis && <p className="text-[12px] text-slate-500 mt-1 max-w-3xl leading-relaxed">{data.thesis}</p>}
        </div>

        {/* KPI cards */}
        {data.kpis && data.kpis.length > 0 && (
          <section>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {data.kpis.map((k, i) => (
                <KpiCard
                  key={k.label}
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
        {ablation.length > 0 && (
          <section>
            <SectionLabel count={ablation.length}>
              Ablation — single LLM vs council vs council + arbitration
            </SectionLabel>
            <div className="grid lg:grid-cols-[1fr_1fr] gap-4">
              <div className="rounded-xl border border-white/[0.07] bg-[#0c0f15] px-5 py-5">
                <GroupedBars
                  rows={ablation.map((c) => ({
                    label: prettyConfig(c.config),
                    values: { precision: c.precision, recall: c.recall, f1: c.f1 },
                  }))}
                  metrics={[
                    { key: "precision", label: "Precision", color: "#22d3ee" },
                    { key: "recall", label: "Recall", color: "#34d399" },
                    { key: "f1", label: "F1", color: "#a78bfa" },
                  ]}
                />
                {data.ablation?.sample !== undefined && (
                  <p className="text-[10px] text-slate-500 mt-4">Sample size: {String(data.ablation.sample)}</p>
                )}
              </div>

              {/* Confusion matrix table */}
              <div className="rounded-xl border border-white/[0.07] bg-[#0c0f15] overflow-hidden">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="border-b border-white/[0.06] bg-white/[0.02] text-slate-500">
                      <th className="text-left px-3 py-2 font-medium">Config</th>
                      <th className="text-right px-2 py-2 font-medium">TP</th>
                      <th className="text-right px-2 py-2 font-medium">FP</th>
                      <th className="text-right px-2 py-2 font-medium">TN</th>
                      <th className="text-right px-2 py-2 font-medium">FN</th>
                      <th className="text-right px-3 py-2 font-medium">F1</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ablation.map((c) => (
                      <tr key={c.config} className="border-b border-white/[0.03] last:border-0">
                        <td className="px-3 py-2.5 text-slate-200 font-medium">{prettyConfig(c.config)}</td>
                        <td className="px-2 py-2.5 text-right font-mono text-emerald-400 tabular-nums">{c.tp}</td>
                        <td className="px-2 py-2.5 text-right font-mono text-rose-400 tabular-nums">{c.fp}</td>
                        <td className="px-2 py-2.5 text-right font-mono text-slate-400 tabular-nums">{c.tn}</td>
                        <td className="px-2 py-2.5 text-right font-mono text-amber-400 tabular-nums">{c.fn}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-cyan-300 font-semibold tabular-nums">
                          {c.f1.toFixed(3)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {/* Vulnerability distribution */}
        {data.vuln_distribution && (
          <section>
            <SectionLabel>Most common vulnerabilities in the wild</SectionLabel>
            <div className="grid lg:grid-cols-2 gap-4">
              <DistCard
                title="SmartBugs Curated"
                color="#fb7185"
                data={data.vuln_distribution.smartbugs_curated}
              />
              <DistCard title="Web3Bugs" color="#a78bfa" data={data.vuln_distribution.web3bugs} />
            </div>
          </section>
        )}

        {/* Baselines */}
        {baselines.length > 0 && (
          <section>
            <SectionLabel count={baselines.length}>Baselines we compare against</SectionLabel>
            <div className="grid lg:grid-cols-[1.3fr_1fr] gap-4">
              <div className="rounded-xl border border-white/[0.07] bg-[#0c0f15] overflow-hidden">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="border-b border-white/[0.06] bg-white/[0.02] text-slate-500">
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
                          {b.note && <div className="text-[9px] text-slate-500 mt-0.5 max-w-[180px]">{b.note}</div>}
                        </td>
                        <td className="px-3 py-2.5 text-slate-400">{b.dataset}</td>
                        <td className="px-2 py-2.5 text-right font-mono text-slate-300 tabular-nums">
                          {fmt(b.recall)}
                        </td>
                        <td className="px-2 py-2.5 text-right font-mono text-cyan-300 tabular-nums">{fmt(b.f1)}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-slate-400">{b.cost ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="px-3 py-2 border-t border-white/[0.06] flex items-center gap-2">
                  <Pill>published / to-be-reproduced</Pill>
                  <span className="text-[10px] text-slate-500">
                    Figures from published literature unless marked as Argus results.
                  </span>
                </div>
              </div>

              <div className="rounded-xl border border-white/[0.07] bg-[#0c0f15] px-5 py-5">
                <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500 mb-3">F1 comparison</div>
                <VerticalBars
                  data={baselines.slice(0, 6).map((b) => ({ label: b.tool, value: b.f1 }))}
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
  data?: { category: string; count: number; pct: number }[];
  color: string;
}) {
  if (!data || data.length === 0) return null;
  return (
    <div className="rounded-xl border border-white/[0.07] bg-[#0c0f15] px-5 py-5">
      <div className="flex items-center gap-2 mb-4">
        <span className="w-2 h-2 rounded-full" style={{ background: color }} />
        <span className="text-[12px] font-semibold text-slate-200">{title}</span>
        <span className="ml-auto text-[10px] font-mono text-slate-500">{data.length} categories</span>
      </div>
      <DistributionBars data={data.slice(0, 10)} color={color} />
    </div>
  );
}

function prettyConfig(c: string): string {
  return c
    .replace(/_/g, " ")
    .replace(/\bllm\b/i, "LLM")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function fmt(v: number | undefined): string {
  if (v == null) return "—";
  return v <= 1 ? v.toFixed(2) : String(v);
}
