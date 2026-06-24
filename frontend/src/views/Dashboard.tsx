import { useEffect, useState } from "react";
import {
  getBenchmarkStats,
  listSessions,
  type BenchmarkStats,
  type Session,
  type User,
} from "../lib/api";
import { KpiCard, SectionLabel, Pill } from "../components/ui/primitives";
import { ArgusMark, ArrowRightIcon, ScanIcon, FlowIcon, ChartIcon, HistoryIcon } from "../components/ui/icons";
import type { Tab } from "../components/Layout";

export function Dashboard({ user, onNavigate }: { user: User; onNavigate: (t: Tab) => void }) {
  const [stats, setStats] = useState<BenchmarkStats | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);

  useEffect(() => {
    getBenchmarkStats().then(setStats).catch(() => {});
    listSessions(user.user_id)
      .then((s) => setSessions(s.slice(0, 5)))
      .catch(() => {});
  }, [user.user_id]);

  const kpis = stats?.kpis ?? [];

  return (
    <div className="px-4 sm:px-6 py-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Hero */}
        <section className="relative overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0c0f15]">
          <div className="bg-grid opacity-50 absolute inset-0" aria-hidden="true" />
          <div
            className="absolute -right-20 -top-24 w-96 h-96 rounded-full blur-3xl"
            style={{ background: "radial-gradient(circle, rgba(34,211,238,0.12), transparent 70%)" }}
            aria-hidden="true"
          />
          <div className="relative px-6 sm:px-8 py-8 flex flex-col sm:flex-row sm:items-center gap-6">
            <div className="text-cyan-300 animate-spin-slow flex-shrink-0" style={{ animationDuration: "40s" }}>
              <ArgusMark size={68} />
            </div>
            <div className="min-w-0">
              <Pill tone="accent">welcome back, {user.username}</Pill>
              <h2 className="text-2xl font-bold text-white tracking-tight mt-2 leading-tight">
                Audit any contract with a council of model-diverse specialists.
              </h2>
              <p className="text-[13px] text-slate-400 mt-2 max-w-2xl leading-relaxed">
                Argus grounds eight specialists in real exploit precedent, arbitrates their findings, and
                confirms exploitability dynamically — then returns a single, defensible verdict.
              </p>
              <div className="flex flex-wrap gap-2 mt-5">
                <button
                  onClick={() => onNavigate("analyze")}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-[#06181c] text-[13px] font-semibold transition-colors"
                >
                  <ScanIcon size={15} /> New Scan <ArrowRightIcon size={15} />
                </button>
                <button
                  onClick={() => onNavigate("how")}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-white/[0.12] text-slate-200 text-[13px] font-medium hover:bg-white/[0.04] transition-colors"
                >
                  <FlowIcon size={15} /> How it works
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* KPIs */}
        {kpis.length > 0 && (
          <section>
            <SectionLabel>Headline Metrics</SectionLabel>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {kpis.slice(0, 4).map((k, i) => (
                <KpiCard key={k.label} label={k.label} value={k.value} sub={k.sub} delta={k.delta} accent={i === 0} />
              ))}
            </div>
          </section>
        )}

        <div className="grid lg:grid-cols-[1.4fr_1fr] gap-5">
          {/* Recent scans */}
          <section>
            <SectionLabel count={sessions.length}>Recent Scans</SectionLabel>
            <div className="rounded-xl border border-white/[0.07] bg-[#0c0f15] divide-y divide-white/[0.04]">
              {sessions.length === 0 ? (
                <div className="px-5 py-8 text-center">
                  <p className="text-[13px] text-slate-400">No scans yet.</p>
                  <button
                    onClick={() => onNavigate("analyze")}
                    className="mt-2 text-[12px] text-cyan-400 hover:text-cyan-300 font-medium"
                  >
                    Run your first analysis →
                  </button>
                </div>
              ) : (
                sessions.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => onNavigate("history")}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.02] transition-colors"
                  >
                    <span className="w-8 h-8 rounded-lg bg-cyan-500/10 ring-1 ring-cyan-400/15 flex items-center justify-center text-cyan-300/80 flex-shrink-0">
                      <HistoryIcon size={15} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] text-slate-200 font-medium truncate">{s.title || `Session ${s.id}`}</div>
                      <div className="text-[10px] font-mono text-slate-500">{fmtDate(s.created_at)}</div>
                    </div>
                    {s.msg_count !== undefined && <Pill>{s.msg_count} msgs</Pill>}
                  </button>
                ))
              )}
            </div>
          </section>

          {/* Quick links */}
          <section>
            <SectionLabel>Explore</SectionLabel>
            <div className="space-y-2.5">
              <QuickLink
                icon={<ChartIcon size={16} />}
                title="Benchmarks"
                body="Ablation, vuln distributions, and published baselines."
                onClick={() => onNavigate("benchmarks")}
              />
              <QuickLink
                icon={<FlowIcon size={16} />}
                title="Pipeline walkthrough"
                body="The seven-stage flow from ingest to verdict."
                onClick={() => onNavigate("how")}
              />
              <QuickLink
                icon={<HistoryIcon size={16} />}
                title="Scan history"
                body="Revisit every contract you've analyzed."
                onClick={() => onNavigate("history")}
              />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function QuickLink({
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
      className="group w-full flex items-center gap-3 rounded-xl border border-white/[0.07] bg-[#0c0f15] px-4 py-3 text-left hover:border-cyan-400/25 hover:bg-cyan-500/[0.03] transition-colors"
    >
      <span className="w-9 h-9 rounded-lg bg-white/[0.04] flex items-center justify-center text-slate-400 group-hover:text-cyan-300 flex-shrink-0 transition-colors">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold text-slate-200">{title}</div>
        <div className="text-[11px] text-slate-500 truncate">{body}</div>
      </div>
      <span className="text-slate-600 group-hover:text-cyan-300 transition-colors">
        <ArrowRightIcon size={15} />
      </span>
    </button>
  );
}

function fmtDate(s: string): string {
  if (!s) return "";
  try {
    return new Date(s).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return s.slice(0, 16).replace("T", " ");
  }
}
