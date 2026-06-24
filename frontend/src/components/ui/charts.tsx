// ─── Dependency-free inline-SVG charts ───

// Grouped horizontal bar chart — used for ablation precision/recall/F1.
export function GroupedBars({
  rows,
  metrics,
}: {
  rows: { label: string; values: Record<string, number> }[];
  metrics: { key: string; label: string; color: string }[];
}) {
  return (
    <div className="space-y-4">
      {rows.map((row) => (
        <div key={row.label}>
          <div className="text-[12px] font-medium text-white/80 mb-2">{row.label}</div>
          <div className="space-y-1.5">
            {metrics.map((m) => {
              const v = row.values[m.key] ?? 0;
              const pct = Math.round(v * 100);
              return (
                <div key={m.key} className="flex items-center gap-2.5">
                  <span className="w-16 text-[9px] uppercase tracking-wide text-slate-500 flex-shrink-0">
                    {m.label}
                  </span>
                  <div className="flex-1 h-3 rounded bg-white/[0.05] overflow-hidden">
                    <div
                      className="h-full rounded bar-grow"
                      style={{ width: `${pct}%`, background: m.color }}
                    />
                  </div>
                  <span className="w-9 text-right text-[10px] font-mono tabular-nums text-slate-300 flex-shrink-0">
                    {pct}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// Single-metric horizontal distribution (vuln categories in the wild).
export function DistributionBars({
  data,
  color = "#22d3ee",
  max,
}: {
  data: { category: string; count: number; pct: number }[];
  color?: string;
  max?: number;
}) {
  const peak = max ?? Math.max(1, ...data.map((d) => d.pct));
  return (
    <div className="space-y-2">
      {data.map((d) => (
        <div key={d.category} className="flex items-center gap-2.5">
          <span className="w-32 truncate text-[11px] text-slate-300 capitalize flex-shrink-0" title={d.category}>
            {d.category.replace(/_/g, " ")}
          </span>
          <div className="flex-1 h-4 rounded bg-white/[0.04] overflow-hidden">
            <div
              className="h-full rounded bar-grow flex items-center justify-end pr-1.5"
              style={{ width: `${Math.max(4, (d.pct / peak) * 100)}%`, background: color, opacity: 0.85 }}
            >
              <span className="text-[8px] font-mono text-black/70 font-bold">{d.pct}%</span>
            </div>
          </div>
          <span className="w-8 text-right text-[10px] font-mono tabular-nums text-slate-500 flex-shrink-0">
            {d.count}
          </span>
        </div>
      ))}
    </div>
  );
}

// Vertical comparison bars (e.g. baseline recall/F1).
export function VerticalBars({
  data,
  color = "#22d3ee",
  height = 120,
}: {
  data: { label: string; value: number }[];
  color?: string;
  height?: number;
}) {
  const peak = Math.max(0.001, ...data.map((d) => d.value));
  return (
    <div className="flex items-end gap-2" style={{ height }}>
      {data.map((d) => {
        const h = Math.round((d.value / peak) * (height - 22));
        return (
          <div key={d.label} className="flex-1 flex flex-col items-center justify-end gap-1.5 min-w-0">
            <span className="text-[9px] font-mono tabular-nums text-slate-400">{d.value.toFixed(2)}</span>
            <div
              className="w-full rounded-t"
              style={{
                height: h,
                background: color,
                transformOrigin: "bottom",
                animation: "bar-rise 0.7s cubic-bezier(0.16,1,0.3,1) both",
              }}
            />
            <span className="text-[8px] text-slate-500 truncate w-full text-center" title={d.label}>
              {d.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
