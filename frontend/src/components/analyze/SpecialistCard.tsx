import { humanizeRole, providerColor } from "../../lib/theme";
import { EyeIcon, CheckIcon, AlertIcon } from "../ui/icons";
import { ModelChip, ConfidenceMeter } from "../ui/primitives";

export type SpecialistState = {
  role: string;
  provider?: string;
  model?: string;
  status: "queued" | "analyzing" | "done";
  found?: boolean;
  confidence?: number;
  severity?: string;
  evidence_quote?: string;
  llm_error?: boolean;
};

export function SpecialistCard({ s, index }: { s: SpecialistState; index: number }) {
  const { status } = s;
  const color = s.provider ? providerColor(s.provider) : "#22d3ee";

  // Border/background per state.
  const shell =
    status === "done"
      ? s.llm_error
        ? "border-amber-500/25 bg-amber-500/[0.04]"
        : s.found
        ? "border-rose-500/25 bg-rose-500/[0.05]"
        : "border-emerald-500/20 bg-emerald-500/[0.03]"
      : status === "analyzing"
      ? "border-cyan-400/30 bg-cyan-500/[0.04]"
      : "border-white/[0.07] bg-white/[0.012]";

  return (
    <article
      className={`relative overflow-hidden rounded-xl border px-3.5 py-3 flex flex-col gap-2.5 transition-colors duration-500 ${shell}`}
      style={{ animationDelay: `${index * 60}ms` }}
      aria-busy={status !== "done"}
    >
      {/* analyzing scan-sweep */}
      {status === "analyzing" && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
          <div className="scan-sweep absolute left-0 right-0 h-10 bg-gradient-to-b from-transparent via-cyan-400/[0.10] to-transparent" />
        </div>
      )}

      {/* Header */}
      <div className="relative flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={
              status === "done"
                ? s.found
                  ? "text-rose-400/80"
                  : "text-emerald-400/70"
                : status === "analyzing"
                ? "text-cyan-300"
                : "text-slate-600"
            }
          >
            <EyeIcon size={14} />
          </span>
          <span className="text-[12.5px] font-semibold text-white/85 leading-tight truncate">
            {humanizeRole(s.role)}
          </span>
        </div>
        <StatusBadge s={s} />
      </div>

      {/* Provider/model line (or placeholder) */}
      <div className="relative min-h-[18px]">
        {s.model ? (
          <ModelChip model={s.model} provider={s.provider || ""} />
        ) : (
          <span className="inline-block h-3.5 w-24 rounded shimmer" />
        )}
      </div>

      {/* Confidence — only meaningful once done */}
      {status === "done" && !s.llm_error ? (
        <ConfidenceMeter value={s.confidence ?? 0} tone={s.found ? "danger" : "safe"} />
      ) : status === "queued" ? (
        <div className="h-1.5 w-full rounded-full bg-white/[0.05]" />
      ) : (
        <div className="h-1.5 w-full rounded-full shimmer" />
      )}

      {/* Evidence preview when a risk was found */}
      {status === "done" && s.found && s.evidence_quote && (
        <code className="relative block text-[9.5px] font-mono text-rose-200/75 bg-black/35 ring-1 ring-rose-500/10 rounded-md px-2 py-1.5 leading-relaxed whitespace-pre-wrap break-words max-h-16 overflow-hidden">
          {s.evidence_quote}
        </code>
      )}

      {/* provider accent dot */}
      <span
        className="absolute right-2 bottom-2 w-1.5 h-1.5 rounded-full"
        style={{ background: color, opacity: status === "queued" ? 0.25 : 0.8 }}
        aria-hidden="true"
      />
    </article>
  );
}

function StatusBadge({ s }: { s: SpecialistState }) {
  if (s.status === "queued") {
    return (
      <span className="text-[8.5px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md text-slate-500 bg-white/[0.04] flex-shrink-0">
        Queued
      </span>
    );
  }
  if (s.status === "analyzing") {
    return (
      <span className="flex items-center gap-1 text-[8.5px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md text-cyan-200 bg-cyan-500/15 ring-1 ring-cyan-400/25 flex-shrink-0">
        <span className="flex gap-0.5">
          {[0, 0.18, 0.36].map((d) => (
            <span
              key={d}
              className="w-1 h-1 rounded-full bg-cyan-300 animate-pulse-glow"
              style={{ animationDelay: `${d}s` }}
            />
          ))}
        </span>
        Scanning
      </span>
    );
  }
  // done
  if (s.llm_error) {
    return (
      <span className="text-[8.5px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md text-amber-300 bg-amber-500/15 ring-1 ring-amber-400/25 flex-shrink-0">
        Error
      </span>
    );
  }
  return s.found ? (
    <span className="flex items-center gap-1 text-[8.5px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md text-rose-300 bg-rose-500/15 ring-1 ring-rose-400/25 flex-shrink-0">
      <AlertIcon size={10} />
      Risk
    </span>
  ) : (
    <span className="flex items-center gap-1 text-[8.5px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md text-emerald-300/85 bg-emerald-500/12 ring-1 ring-emerald-400/20 flex-shrink-0">
      <CheckIcon size={10} />
      Clean
    </span>
  );
}
