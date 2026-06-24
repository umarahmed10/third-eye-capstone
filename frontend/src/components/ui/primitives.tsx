import type { ReactNode } from "react";
import { ChipIcon, TrendUpIcon, TrendDownIcon } from "./icons";

// ─── Panel: the base card surface used everywhere ───
export function Panel({
  children,
  className = "",
  as: As = "div",
  ...rest
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "article";
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <As
      className={`rounded-xl border border-white/[0.07] bg-[#0c0f15] ${className}`}
      {...rest}
    >
      {children}
    </As>
  );
}

// ─── Section heading with rule + optional count ───
export function SectionLabel({ children, count }: { children: ReactNode; count?: number }) {
  return (
    <div className="flex items-center gap-2.5 mb-3.5">
      <h3 className="text-[11px] uppercase tracking-[0.18em] text-slate-400 font-semibold">{children}</h3>
      {count !== undefined && (
        <span className="text-[9px] font-mono text-slate-300/70 bg-white/[0.05] px-1.5 py-0.5 rounded">{count}</span>
      )}
      <div className="flex-1 h-px bg-gradient-to-r from-white/[0.08] to-transparent" />
    </div>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500 mb-1.5 font-medium">{children}</div>;
}

// ─── Model · provider chip (model-diversity story) ───
export function ModelChip({ model, provider }: { model: string; provider: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[9px] font-mono text-cyan-300/80 bg-cyan-500/[0.08] ring-1 ring-cyan-400/15 px-1.5 py-0.5 rounded-md max-w-full">
      <ChipIcon size={10} className="text-cyan-300/60 flex-shrink-0" />
      <span className="truncate">{model}</span>
      <span className="text-cyan-300/35">·</span>
      <span className="text-cyan-300/55">{provider}</span>
    </span>
  );
}

// ─── Horizontal confidence meter ───
export function ConfidenceMeter({
  value,
  tone = "neutral",
}: {
  value: number;
  tone?: "neutral" | "danger" | "safe";
}) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  const bar =
    tone === "danger" ? "bg-rose-400/70" : tone === "safe" ? "bg-emerald-400/65" : "bg-cyan-400/65";
  return (
    <div
      className="flex items-center gap-2"
      role="meter"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="confidence"
    >
      <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
        <div className={`h-full rounded-full ${bar} transition-all duration-700`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[9px] font-mono text-slate-400 tabular-nums w-8 text-right">{pct}%</span>
    </div>
  );
}

// ─── KPI card with optional up/down delta ───
export function KpiCard({
  label,
  value,
  sub,
  delta,
  accent = false,
}: {
  label: string;
  value: string | number;
  sub?: string;
  delta?: number;
  accent?: boolean;
}) {
  const up = (delta ?? 0) >= 0;
  return (
    <div
      className={`rounded-xl border px-4 py-3.5 ${
        accent
          ? "border-cyan-400/25 bg-cyan-500/[0.05]"
          : "border-white/[0.07] bg-[#0c0f15]"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500">{label}</div>
        {delta !== undefined && (
          <span
            className={`inline-flex items-center gap-0.5 text-[10px] font-mono font-semibold ${
              up ? "text-emerald-400" : "text-rose-400"
            }`}
          >
            {up ? <TrendUpIcon size={11} /> : <TrendDownIcon size={11} />}
            {up ? "+" : ""}
            {delta}
          </span>
        )}
      </div>
      <div className={`text-2xl font-bold tabular-nums leading-none mt-2 ${accent ? "text-cyan-300" : "text-white/90"}`}>
        {value}
      </div>
      {sub && <div className="text-[10px] text-slate-500 mt-1.5">{sub}</div>}
    </div>
  );
}

// ─── Empty / loading / error states ───
export function Spinner({ size = 14 }: { size?: number }) {
  return (
    <span
      className="inline-block rounded-full border-2 border-white/20 border-t-cyan-300 animate-spin"
      style={{ width: size, height: size }}
    />
  );
}

export function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "accent" }) {
  return (
    <span
      className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${
        tone === "accent"
          ? "text-cyan-300/80 bg-cyan-500/[0.08] ring-1 ring-cyan-400/15"
          : "text-slate-400 bg-white/[0.05]"
      }`}
    >
      {children}
    </span>
  );
}
