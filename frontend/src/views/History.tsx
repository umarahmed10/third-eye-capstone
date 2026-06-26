import { useEffect, useState } from "react";
import {
  listSessions,
  getMessages,
  type Session,
  type Message,
  type CouncilResult,
  type User,
} from "../lib/api";
import { SectionLabel, Spinner, Pill } from "../components/ui/primitives";
import { HistoryIcon, ShieldCheckIcon, AlertIcon } from "../components/ui/icons";
import { VerdictBanner, StatsStrip, VulnList } from "../components/analyze/ResultPanel";

export function History({ user }: { user: User }) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);

  useEffect(() => {
    let alive = true;
    listSessions(user.user_id)
      .then((s) => alive && setSessions(s))
      .catch(() => {})
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [user.user_id]);

  useEffect(() => {
    if (active == null) {
      setMessages([]);
      return;
    }
    setLoadingMsgs(true);
    getMessages(active)
      .then(setMessages)
      .catch(() => setMessages([]))
      .finally(() => setLoadingMsgs(false));
  }, [active]);

  // Parse assistant messages into council results (most recent first).
  const analyses = messages
    .filter((m) => m.role === "assistant")
    .map((m) => {
      try {
        return JSON.parse(m.content) as CouncilResult;
      } catch {
        return null;
      }
    })
    .filter((r): r is CouncilResult => !!r && !!r.final_verdict)
    .reverse();

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center gap-2 text-slate-500 text-[13px]">
        <Spinner /> Loading history…
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 py-6">
      <div className="max-w-6xl mx-auto grid lg:grid-cols-[280px_1fr] gap-5">
        {/* Sessions list */}
        <aside>
          <SectionLabel count={sessions.length}>Sessions</SectionLabel>
          <div className="rounded-xl border border-white/[0.07] bg-[#151021] divide-y divide-white/[0.04] max-h-[calc(100vh-160px)] overflow-y-auto">
            {sessions.length === 0 ? (
              <div className="px-4 py-8 text-center text-[12px] text-slate-500">No sessions yet.</div>
            ) : (
              sessions.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setActive(s.id)}
                  aria-current={active === s.id}
                  className={`w-full flex items-center gap-2.5 px-4 py-3 text-left transition-colors ${
                    active === s.id ? "bg-violet-500/[0.08]" : "hover:bg-white/[0.02]"
                  }`}
                >
                  <span
                    className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      active === s.id ? "bg-violet-500/15 text-violet-300" : "bg-white/[0.04] text-slate-500"
                    }`}
                  >
                    <HistoryIcon size={14} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className={`text-[12px] font-medium truncate ${active === s.id ? "text-violet-200" : "text-slate-200"}`}>
                      {s.title || `Session ${s.id}`}
                    </div>
                    <div className="text-[9px] font-mono text-slate-500">{fmtDate(s.created_at)}</div>
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>

        {/* Detail */}
        <section className="min-w-0">
          <SectionLabel>Analyses</SectionLabel>
          {active == null ? (
            <Empty text="Select a session to view its analyses." />
          ) : loadingMsgs ? (
            <div className="flex items-center gap-2 text-slate-500 text-[13px] py-8">
              <Spinner /> Loading…
            </div>
          ) : analyses.length === 0 ? (
            <Empty text="No completed analyses in this session." />
          ) : (
            <div className="space-y-5">
              {analyses.map((r, i) => (
                <div key={i} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className={r.final_verdict === "GO" ? "text-emerald-400" : "text-rose-400"}>
                      {r.final_verdict === "GO" ? <ShieldCheckIcon size={15} /> : <AlertIcon size={15} />}
                    </span>
                    <span className="text-[12px] font-semibold text-slate-200">
                      {r.contract_name || "Contract"}
                    </span>
                    {r.mode && <Pill>{r.mode}</Pill>}
                  </div>
                  <VerdictBanner result={r} />
                  {r.stats && <StatsStrip stats={r.stats} />}
                  <VulnList vulnerabilities={r.vulnerabilities || []} />
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.01] px-6 py-12 text-center text-[13px] text-slate-500">
      {text}
    </div>
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
