import { useState, useRef, useEffect, useCallback, type KeyboardEvent } from "react";

const API = "/api";

// ─── Types ───
type User = { user_id: number; username: string; token: string };
type Session = { id: number; title: string; created_at: string; msg_count: number };
type Vuln = { type?: string; line?: number; severity?: string; confidence?: number; final_confidence?: number; verified_by_slither?: boolean; source?: string; sources?: string[]; description?: string };
type Analysis = {
  final_verdict: "GO" | "NO-GO"; vulnerabilities: Vuln[]; summary: string; raven_note?: string;
  contract_name?: string; stats?: Record<string, number>; features_detected?: Record<string, boolean>;
};
type Msg = { id: number; role: string; content: string; created_at: string };
type DatasetContract = {
  id: string; filename: string; contract_name: string; xlsx_name: string;
  source: string; auto_label: string; vuln_types: string[];
  expected_severity: string | null; solidity_version: string;
  etherscan_address: string; analysis_result: Analysis | null;
  comparison: { match: boolean; expected_verdict: string; predicted_verdict: string; predicted_vuln_types: string[] } | null;
  analysis_timestamp: string | null;
};
type DatasetStats = {
  total: number; vulnerable: number; likely_safe: number; analyzed: number;
  run_stats: { total_processed: number; correct_verdicts: number; accuracy: number; mode: string } | null;
  last_run: string | null;
  vuln_type_distribution: Record<string, number>;
};

const SEV: Record<string, { c: string; bg: string; r: string }> = {
  critical: { c: "text-rose-400", bg: "bg-rose-500/8", r: "ring-rose-500/20" },
  high: { c: "text-orange-400", bg: "bg-orange-500/8", r: "ring-orange-500/20" },
  medium: { c: "text-amber-400", bg: "bg-amber-500/8", r: "ring-amber-500/20" },
  low: { c: "text-sky-400", bg: "bg-sky-500/8", r: "ring-sky-500/20" },
};

export default function App() {
  const [user, setUser] = useState<User | null>(() => {
    try { const s = localStorage.getItem("te_user"); return s ? JSON.parse(s) : null; } catch { return null; }
  });
  const [view, setView] = useState<"chat" | "dataset">("chat");

  if (!user) return <LoginPage onAuth={u => { localStorage.setItem("te_user", JSON.stringify(u)); setUser(u); }} />;

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ background: "#08080c" }}>
      {/* Top nav */}
      <nav className="flex-shrink-0 flex items-center gap-1 px-3 py-1.5 border-b border-white/[0.05]" style={{ background: "#0b0b10" }}>
        <div className="flex items-center gap-1.5 mr-4">
          <div className="w-5 h-5 rounded bg-emerald-500/12 flex items-center justify-center">
            <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="rgba(52,211,153,0.85)" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
            </svg>
          </div>
          <span className="text-[11px] font-semibold text-white/70">ThirdEye</span>
        </div>
        {(["chat", "dataset"] as const).map(v => (
          <button key={v} onClick={() => setView(v)}
            className={`px-3 py-1 rounded-lg text-[11px] font-medium transition-colors capitalize ${view === v ? "bg-white/[0.07] text-white/70" : "text-white/25 hover:text-white/45"}`}>
            {v === "chat" ? "Scan" : "Dataset"}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[10px] text-white/20">{user.username}</span>
          <button onClick={() => { localStorage.removeItem("te_user"); window.location.reload(); }}
            className="text-[10px] text-white/15 hover:text-rose-400/60 transition-colors">logout</button>
        </div>
      </nav>
      <div className="flex-1 min-h-0">
        {view === "chat"
          ? <ChatApp user={user} onLogout={() => { localStorage.removeItem("te_user"); window.location.reload(); }} />
          : <DatasetView />}
      </div>
    </div>
  );
}

// ═══════════════ LOGIN ═══════════════
function LoginPage({ onAuth }: { onAuth: (u: User) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const r = await fetch(`${API}/${mode}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!r.ok) { const d = await r.json(); throw new Error(d.detail || `Error ${r.status}`); }
      onAuth(await r.json());
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "#08080c" }}>
      <div className="w-full max-w-sm animate-fade-in">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/15 mb-4">
            <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="rgba(52,211,153,0.8)" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white/90 tracking-tight">ThirdEye</h1>
          <p className="text-xs text-white/25 mt-1 font-mono">powered by Raven</p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <input type="text" placeholder="Username" value={username} onChange={e => setUsername(e.target.value)}
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white/80 placeholder:text-white/20 outline-none focus:border-emerald-500/30 transition-colors" />
          </div>
          <div>
            <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)}
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white/80 placeholder:text-white/20 outline-none focus:border-emerald-500/30 transition-colors" />
          </div>
          {error && <p className="text-rose-400/80 text-xs px-1">{error}</p>}
          <button type="submit" disabled={loading || !username || !password}
            className="w-full bg-emerald-500/80 hover:bg-emerald-500 text-white font-medium py-3 rounded-xl transition-all disabled:opacity-30 disabled:cursor-not-allowed text-sm">
            {loading ? "..." : mode === "login" ? "Sign In" : "Create Account"}
          </button>
        </form>

        <p className="text-center text-xs text-white/20 mt-6">
          {mode === "login" ? "No account? " : "Have an account? "}
          <button onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}
            className="text-emerald-400/60 hover:text-emerald-400 transition-colors">
            {mode === "login" ? "Register" : "Sign in"}
          </button>
        </p>
      </div>
    </div>
  );
}

// ═══════════════ CHAT APP ═══════════════
function ChatApp({ user, onLogout: _onLogout }: { user: User; onLogout: () => void }) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSession, setActiveSession] = useState<number | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [ollamaModel, setOllamaModel] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Fetch sessions
  const refreshSessions = useCallback(() => {
    fetch(`${API}/sessions/${user.user_id}`).then(r => r.json()).then(setSessions).catch(() => {});
  }, [user.user_id]);

  useEffect(() => { refreshSessions(); }, [refreshSessions]);

  // Fetch messages when session changes
  useEffect(() => {
    if (activeSession) {
      fetch(`${API}/sessions/${activeSession}/messages`).then(r => r.json()).then(setMessages).catch(() => {});
    } else {
      setMessages([]);
    }
  }, [activeSession]);

  // Ollama status
  useEffect(() => {
    fetch(`${API}/ollama-status`).then(r => r.json()).then(d => setOllamaModel(d.active_model || "")).catch(() => {});
  }, []);

  // Auto-scroll
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, elapsed]);

  // Timer
  useEffect(() => {
    if (sending) { setElapsed(0); timerRef.current = setInterval(() => setElapsed(t => t + 1), 1000); }
    else { if (timerRef.current) clearInterval(timerRef.current); }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [sending]);

  async function newChat() {
    try {
      const r = await fetch(`${API}/sessions`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: user.user_id }),
      });
      const s = await r.json();
      setActiveSession(s.id);
      refreshSessions();
    } catch {}
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); doSubmit(); }
  }

  async function doSubmit() {
    const code = input.trim();
    if (!code || sending) return;

    // Create session if none active
    let sid = activeSession;
    if (!sid) {
      try {
        const r = await fetch(`${API}/sessions`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: user.user_id }),
        });
        const s = await r.json();
        sid = s.id;
        setActiveSession(s.id);
      } catch { return; }
    }

    setSending(true);
    // Optimistically add user message
    const userMsg: Msg = { id: Date.now(), role: "user", content: code, created_at: new Date().toISOString() };
    setMessages(m => [...m, userMsg]);
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    try {
      const r = await fetch(`${API}/analyze`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, session_id: sid, user_id: user.user_id }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      const assistMsg: Msg = { id: Date.now() + 1, role: "assistant", content: JSON.stringify(data), created_at: new Date().toISOString() };
      setMessages(m => [...m, assistMsg]);
      refreshSessions();
    } catch (e: any) {
      setMessages(m => [...m, { id: Date.now() + 1, role: "assistant", content: JSON.stringify({ error: e.message }), created_at: "" }]);
    } finally {
      setSending(false);
    }
  }

  async function downloadReport(code: string, result: Analysis) {
    try {
      const r = await fetch(`${API}/report`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, result }),
      });
      if (!r.ok) throw new Error("Report failed");
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = "ThirdEye_Audit.pdf"; a.click();
      URL.revokeObjectURL(url);
    } catch { alert("PDF generation failed"); }
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" && setInput(reader.result);
    reader.readAsText(file);
  }

  return (
    <div className="h-full flex overflow-hidden" style={{ background: "#08080c" }}>
      {/* ─── SIDEBAR ─── */}
      <aside className={`${sidebarOpen ? "w-[260px]" : "w-0"} flex-shrink-0 border-r border-white/[0.05] flex flex-col overflow-hidden transition-all duration-300`} style={{ background: "#0b0b10" }}>
        {/* Brand */}
        <div className="px-4 py-4 border-b border-white/[0.05] flex items-center gap-2.5 min-w-[260px]">
          <div className="w-7 h-7 rounded-lg bg-emerald-500/12 flex items-center justify-center flex-shrink-0">
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="rgba(52,211,153,0.85)" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
            </svg>
          </div>
          <div>
            <div className="text-[13px] font-semibold text-white/85">ThirdEye</div>
            <div className="text-[9px] font-mono text-white/20">{ollamaModel || "connecting..."}</div>
          </div>
        </div>

        {/* New chat */}
        <div className="p-3 min-w-[260px]">
          <button onClick={newChat}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-white/[0.07] hover:bg-white/[0.04] transition-colors text-[12px] text-white/50 hover:text-white/70">
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            New scan
          </button>
        </div>

        {/* Sessions */}
        <div className="flex-1 overflow-y-auto px-2 space-y-0.5 min-w-[260px]">
          {sessions.map(s => (
            <button key={s.id} onClick={() => setActiveSession(s.id)}
              className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors text-[12px] truncate ${
                activeSession === s.id ? "bg-white/[0.06] text-white/70" : "text-white/30 hover:bg-white/[0.03] hover:text-white/50"
              }`}>
              {s.title}
            </button>
          ))}
        </div>

        {/* User footer */}
        <div className="p-3 border-t border-white/[0.05] min-w-[260px]">
          <span className="text-[11px] text-white/25 truncate">{user.username}</span>
        </div>
      </aside>

      {/* ─── MAIN ─── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="flex items-center gap-2 px-3 py-2.5 border-b border-white/[0.05] flex-shrink-0">
          <button onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1.5 rounded-lg hover:bg-white/[0.05] text-white/30 transition-colors">
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              {sidebarOpen
                ? <path strokeLinecap="round" d="M3 6h18M3 12h18M3 18h18" />
                : <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" />
              }
            </svg>
          </button>
          <span className="text-[12px] text-white/25">
            {sessions.find(s => s.id === activeSession)?.title || "ThirdEye · Raven"}
          </span>
        </header>

        {/* Messages */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
            {messages.length === 0 && <WelcomeScreen />}

            {messages.map(msg => (
              <div key={msg.id} className="animate-slide-up">
                {msg.role === "user" ? (
                  <div className="flex justify-end">
                    <div className="max-w-[75%] bg-white/[0.04] border border-white/[0.06] rounded-2xl px-4 py-3 text-[11px] font-mono text-white/50 whitespace-pre-wrap max-h-28 overflow-y-auto leading-relaxed">
                      {msg.content.length > 400 ? msg.content.slice(0, 400) + "..." : msg.content}
                    </div>
                  </div>
                ) : (
                  <RavenResponse content={msg.content} onDownload={downloadReport} allMessages={messages} />
                )}
              </div>
            ))}

            {sending && (
              <div className="animate-slide-up">
                <div className="flex items-start gap-3">
                  <RavenAvatar />
                  <div className="bg-white/[0.02] border border-white/[0.05] rounded-2xl px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex gap-1">
                        {[0, .2, .4].map((d, i) => <div key={i} className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse-glow" style={{ animationDelay: `${d}s` }} />)}
                      </div>
                      <span className="text-[11px] text-white/25">Raven is analyzing...</span>
                      <span className="text-[10px] font-mono text-white/15">{elapsed}s</span>
                    </div>
                    {elapsed > 3 && (
                      <div className="mt-2 w-44 h-1 rounded-full bg-white/[0.03] overflow-hidden">
                        <div className="h-full bg-emerald-500/25 rounded-full transition-all duration-1000" style={{ width: `${Math.min(92, elapsed * 1.5)}%` }} />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </main>

        {/* Input */}
        <div className="flex-shrink-0 border-t border-white/[0.05] px-4 pb-4 pt-3" style={{ background: "#08080c" }}>
          <div className="max-w-3xl mx-auto">
            <input ref={fileRef} type="file" className="hidden" accept=".sol,.vy,.txt" onChange={handleFile} />
            <div className="bg-white/[0.025] border border-white/[0.06] rounded-2xl px-3 py-2 flex items-end gap-2 focus-within:border-emerald-500/20 transition-colors">
              <button type="button" onClick={() => fileRef.current?.click()}
                className="mb-1 h-8 w-8 flex-shrink-0 flex items-center justify-center rounded-lg hover:bg-white/[0.04] text-white/20">
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 16V4m0 0L8 8m4-4 4 4M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
                </svg>
              </button>
              <textarea ref={textareaRef}
                className="flex-1 bg-transparent outline-none resize-none text-[12px] font-mono max-h-32 leading-relaxed placeholder:text-white/12 text-white/65"
                placeholder="Paste Solidity code · Enter to scan · Shift+Enter for newline"
                value={input} onChange={e => { setInput(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 128) + "px"; }}
                onKeyDown={onKeyDown} rows={1} disabled={sending} />
              <button onClick={doSubmit} disabled={sending || !input.trim()}
                className="mb-1 h-8 w-8 flex-shrink-0 flex items-center justify-center rounded-lg bg-emerald-500/70 text-white disabled:opacity-10 hover:bg-emerald-500 transition-all">
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </button>
            </div>
            <p className="text-[9px] text-white/8 mt-1 px-1 text-right">ThirdEye does not replace a professional audit</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Welcome ───
function WelcomeScreen() {
  return (
    <div className="flex flex-col items-center justify-center mt-16 gap-6 animate-fade-in">
      <RavenAvatar large />
      <div className="text-center space-y-3 max-w-md">
        <p className="text-[15px] text-white/60 leading-relaxed">
          Hey, I'm <span className="text-emerald-400 font-medium">Raven</span> — ThirdEye's security analyst.
        </p>
        <p className="text-[13px] text-white/30 leading-relaxed">
          Paste me a Solidity contract and I'll tear it apart. I run pattern detection, LLM analysis, and a consensus engine to find what others miss.
        </p>
        <div className="flex items-center justify-center gap-4 pt-2">
          {["Reentrancy", "Access control", "Logic flaws", "Edge cases"].map(t => (
            <span key={t} className="text-[9px] font-mono text-white/15 bg-white/[0.03] px-2 py-1 rounded">{t}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Raven Avatar ───
function RavenAvatar({ large }: { large?: boolean }) {
  const sz = large ? "w-12 h-12" : "w-7 h-7";
  const icon = large ? 22 : 12;
  return (
    <div className={`${sz} rounded-xl bg-emerald-500/10 border border-emerald-500/15 flex items-center justify-center flex-shrink-0`}>
      <svg width={icon} height={icon} fill="none" viewBox="0 0 24 24" stroke="rgba(52,211,153,0.8)" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
      </svg>
    </div>
  );
}

// ─── Raven's Response ───
function RavenResponse({ content, onDownload, allMessages }: { content: string; onDownload: (code: string, r: Analysis) => void; allMessages: Msg[] }) {
  const [showRaw, setShowRaw] = useState(false);

  let analysis: Analysis | null = null;
  let errorMsg = "";
  try {
    const parsed = JSON.parse(content);
    if (parsed.error) errorMsg = parsed.error;
    else analysis = parsed;
  } catch { errorMsg = content; }

  if (errorMsg) {
    return (
      <div className="flex items-start gap-3">
        <RavenAvatar />
        <div className="bg-rose-500/5 border border-rose-500/10 rounded-2xl px-4 py-3 text-[12px] text-rose-400/70">
          Something went wrong: {errorMsg}
        </div>
      </div>
    );
  }
  if (!analysis) return null;

  const isGo = analysis.final_verdict === "GO";
  const vulns = analysis.vulnerabilities || [];

  // Find the code from the previous user message
  const lastUserMsg = [...allMessages].reverse().find(m => m.role === "user");
  const code = lastUserMsg?.content || "";

  return (
    <div className="flex items-start gap-3">
      <RavenAvatar />
      <div className="flex-1 min-w-0 space-y-3">
        {/* Raven's note */}
        {analysis.raven_note && (
          <p className="text-[13px] text-white/50 leading-relaxed">{analysis.raven_note}</p>
        )}

        {/* Verdict card */}
        <div className="rounded-2xl border overflow-hidden" style={{
          background: "rgba(255,255,255,0.015)",
          borderColor: isGo ? "rgba(52,211,153,0.12)" : "rgba(244,63,94,0.12)",
        }}>
          {/* Verdict header */}
          <div className="px-4 py-3 flex items-center gap-3" style={{
            background: isGo ? "rgba(52,211,153,0.04)" : "rgba(244,63,94,0.04)",
          }}>
            <div className={`w-2.5 h-2.5 rounded-full ${isGo ? "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.5)]" : "bg-rose-400 shadow-[0_0_10px_rgba(244,63,94,0.5)]"}`} />
            <span className={`text-lg font-bold ${isGo ? "text-emerald-400" : "text-rose-400"}`}>
              {analysis.final_verdict}
            </span>
            {analysis.contract_name && (
              <span className="text-[10px] font-mono text-white/20">{analysis.contract_name}</span>
            )}
            <div className="ml-auto flex gap-1.5">
              <Pill text={`${vulns.length} vuln${vulns.length !== 1 ? "s" : ""}`} />
              {analysis.stats?.slither_findings !== undefined && <Pill text={`slither: ${analysis.stats.slither_findings}`} />}
            </div>
          </div>

          <div className="px-4 py-4 space-y-4">
            {/* Vulns */}
            {vulns.length === 0 ? (
              <p className="text-emerald-400/50 text-[12px]">No vulnerabilities detected</p>
            ) : (
              <div className="space-y-2">
                {vulns.map((v, i) => <VulnCard key={i} v={v} />)}
              </div>
            )}

            {/* Summary */}
            {analysis.summary && (
              <div>
                <Lbl>What this contract does</Lbl>
                <p className="text-[12px] text-white/40 leading-relaxed">{analysis.summary}</p>
              </div>
            )}

            {/* Features detected */}
            {analysis.features_detected && Object.keys(analysis.features_detected).length > 0 && (
              <div>
                <Lbl>Patterns detected in code</Lbl>
                <div className="flex flex-wrap gap-1.5">
                  {Object.keys(analysis.features_detected).map(k => (
                    <span key={k} className="text-[9px] font-mono text-white/25 bg-white/[0.03] px-2 py-0.5 rounded">
                      {k.replace("has_", "").replace(/_/g, " ")}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-2 border-t border-white/[0.04] pt-3">
              <div className="flex gap-1.5 text-[9px] font-mono text-white/15">
                {analysis.stats && <>
                  <span>raw:{analysis.stats.raw_llm_findings}</span>
                  <span>·</span>
                  <span>final:{analysis.stats.final_findings}</span>
                  {(analysis.stats.similar_in_db ?? 0) > 0 && <><span>·</span><span>similar:{analysis.stats.similar_in_db}</span></>}
                </>}
              </div>
              <div className="ml-auto flex gap-2">
                <button onClick={() => setShowRaw(!showRaw)}
                  className="text-[10px] text-white/20 hover:text-white/40 transition-colors font-mono px-2 py-1 rounded hover:bg-white/[0.03]">
                  {showRaw ? "hide" : "raw"}
                </button>
                <button onClick={() => onDownload(code, analysis!)}
                  className="text-[10px] font-medium text-emerald-400/60 hover:text-emerald-400 transition-colors px-3 py-1.5 rounded-lg bg-emerald-500/8 hover:bg-emerald-500/12 flex items-center gap-1.5">
                  <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v12m0 0l-4-4m4 4l4-4M4 18h16" />
                  </svg>
                  PDF Report
                </button>
              </div>
            </div>

            {showRaw && (
              <pre className="text-[9px] font-mono text-white/15 bg-white/[0.02] rounded-lg p-3 max-h-40 overflow-auto whitespace-pre-wrap animate-fade-in">
                {JSON.stringify(analysis, null, 2)}
              </pre>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Small components ───
function VulnCard({ v }: { v: Vuln }) {
  const s = SEV[v.severity || ""] || SEV.medium;
  const conf = v.final_confidence ?? v.confidence ?? 0;
  return (
    <div className={`rounded-xl ${s.bg} ring-1 ${s.r} px-3.5 py-2.5`}>
      <div className="flex items-center gap-2 mb-1">
        <span className={`text-[12px] font-semibold capitalize ${s.c}`}>{(v.type || "?").replace(/-/g, " ")}</span>
        {v.line && <span className="text-[9px] text-white/15 font-mono">ln {v.line}</span>}
        <div className="ml-auto flex items-center gap-1.5">
          {v.verified_by_slither && <span className="text-[8px] font-mono text-emerald-400/50 bg-emerald-500/8 px-1.5 py-0.5 rounded">slither</span>}
          <span className={`text-[9px] font-mono font-bold uppercase ${s.c}`}>{v.severity}</span>
        </div>
      </div>
      {v.description && <p className="text-[10px] text-white/25 leading-relaxed mb-1.5">{v.description}</p>}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-0.5 rounded-full bg-white/[0.04] overflow-hidden">
          <div className="h-full rounded-full bg-white/15 transition-all" style={{ width: `${Math.round(conf * 100)}%` }} />
        </div>
        <span className="text-[9px] text-white/15 font-mono">{Math.round(conf * 100)}%</span>
      </div>
    </div>
  );
}

function Lbl({ children }: { children: React.ReactNode }) {
  return <div className="text-[9px] uppercase tracking-[0.15em] text-white/18 font-medium mb-1.5">{children}</div>;
}

function Pill({ text }: { text: string }) {
  return <span className="text-[8px] font-mono text-white/20 bg-white/[0.03] px-1.5 py-0.5 rounded">{text}</span>;
}

// ═══════════════ DATASET VIEW ═══════════════
function DatasetView() {
  const [stats, setStats] = useState<DatasetStats | null>(null);
  const [contracts, setContracts] = useState<DatasetContract[]>([]);
  const [runStatus, setRunStatus] = useState<{ running: boolean; progress: number; total: number; message: string } | null>(null);
  const [filter, setFilter] = useState<"all" | "vulnerable" | "likely_safe">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchData = useCallback(async () => {
    try {
      const [sRes, iRes] = await Promise.all([
        fetch(`${API}/dataset/stats`),
        fetch(`${API}/dataset/index`),
      ]);
      if (!sRes.ok || !iRes.ok) throw new Error("Failed to fetch dataset");
      const s = await sRes.json();
      const idx = await iRes.json();
      setStats(s);
      setContracts(idx.contracts || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function triggerRun(staticOnly = true) {
    await fetch(`${API}/dataset/run?static_only=${staticOnly}`, { method: "POST" });
    pollStatus();
  }

  function pollStatus() {
    const iv = setInterval(async () => {
      const r = await fetch(`${API}/dataset/run-status`);
      const s = await r.json();
      setRunStatus(s);
      if (!s.running) {
        clearInterval(iv);
        fetchData();
      }
    }, 1500);
  }

  const filtered = contracts.filter(c => filter === "all" || c.auto_label === filter);

  if (loading) return (
    <div className="h-full flex items-center justify-center">
      <span className="text-[12px] text-white/25 animate-pulse">Loading dataset...</span>
    </div>
  );

  if (error) return (
    <div className="h-full flex items-center justify-center">
      <span className="text-[12px] text-rose-400/60">{error}</span>
    </div>
  );

  return (
    <div className="h-full overflow-y-auto px-6 py-6" style={{ background: "#08080c" }}>
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-[16px] font-semibold text-white/75">Dataset Evaluation</h2>
            <p className="text-[11px] text-white/25 mt-0.5">
              Etherscan-verified contracts · {stats?.total ?? 0} contracts · auto-labeled via ThirdEye static analysis
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => triggerRun(true)}
              disabled={runStatus?.running}
              className="px-3 py-1.5 rounded-lg text-[10px] font-medium bg-emerald-500/15 text-emerald-400/80 hover:bg-emerald-500/25 transition-colors disabled:opacity-30">
              {runStatus?.running ? `${runStatus.progress}/${runStatus.total}` : "Run Static Analysis"}
            </button>
          </div>
        </div>

        {runStatus?.message && (
          <div className="text-[10px] font-mono text-white/30 bg-white/[0.02] border border-white/[0.05] rounded-lg px-3 py-2">
            {runStatus.message}
          </div>
        )}

        {/* Stats cards */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Total Contracts" value={stats.total} />
            <StatCard label="Vulnerable" value={stats.vulnerable} color="text-rose-400" />
            <StatCard label="Likely Safe" value={stats.likely_safe} color="text-emerald-400" />
            <StatCard label="Analyzed" value={stats.analyzed} />
          </div>
        )}

        {/* Run stats */}
        {stats?.run_stats && (
          <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-4 flex flex-wrap gap-6">
            <div>
              <div className="text-[9px] uppercase tracking-widest text-white/20 mb-1">Accuracy</div>
              <div className="text-[20px] font-bold text-emerald-400">{Math.round(stats.run_stats.accuracy * 100)}%</div>
            </div>
            <div>
              <div className="text-[9px] uppercase tracking-widest text-white/20 mb-1">Correct</div>
              <div className="text-[20px] font-bold text-white/60">{stats.run_stats.correct_verdicts}/{stats.run_stats.total_processed}</div>
            </div>
            <div>
              <div className="text-[9px] uppercase tracking-widest text-white/20 mb-1">Mode</div>
              <div className="text-[11px] font-mono text-white/40 mt-1">{stats.run_stats.mode}</div>
            </div>
            {stats.last_run && (
              <div>
                <div className="text-[9px] uppercase tracking-widest text-white/20 mb-1">Last Run</div>
                <div className="text-[10px] font-mono text-white/30 mt-1">{stats.last_run.slice(0, 16).replace("T", " ")} UTC</div>
              </div>
            )}
            {Object.keys(stats.vuln_type_distribution).length > 0 && (
              <div>
                <div className="text-[9px] uppercase tracking-widest text-white/20 mb-1">Vuln Types</div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {Object.entries(stats.vuln_type_distribution).map(([t, n]) => (
                    <span key={t} className="text-[8px] font-mono text-white/30 bg-white/[0.04] px-1.5 py-0.5 rounded">
                      {t.replace(/_/g, " ")}: {n}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Filter */}
        <div className="flex gap-1.5">
          {(["all", "vulnerable", "likely_safe"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded-lg text-[10px] font-medium transition-colors ${filter === f ? "bg-white/[0.07] text-white/60" : "text-white/20 hover:text-white/40"}`}>
              {f === "all" ? `All (${contracts.length})` : f === "vulnerable" ? `Vulnerable (${contracts.filter(c => c.auto_label === "vulnerable").length})` : `Likely Safe (${contracts.filter(c => c.auto_label === "likely_safe").length})`}
            </button>
          ))}
        </div>

        {/* Contract table */}
        <div className="rounded-xl border border-white/[0.06] overflow-hidden">
          <table className="w-full text-[10px]">
            <thead>
              <tr className="border-b border-white/[0.05]" style={{ background: "rgba(255,255,255,0.02)" }}>
                <th className="text-left px-3 py-2 text-white/25 font-medium">ID</th>
                <th className="text-left px-3 py-2 text-white/25 font-medium">Contract</th>
                <th className="text-left px-3 py-2 text-white/25 font-medium">Label</th>
                <th className="text-left px-3 py-2 text-white/25 font-medium">Vuln Types</th>
                <th className="text-left px-3 py-2 text-white/25 font-medium">Predicted</th>
                <th className="text-left px-3 py-2 text-white/25 font-medium">Match</th>
                <th className="text-left px-3 py-2 text-white/25 font-medium">Ver</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c, i) => {
                const cmp = c.comparison;
                const isVuln = c.auto_label === "vulnerable";
                return (
                  <tr key={c.id} className={`border-b border-white/[0.03] transition-colors hover:bg-white/[0.02] ${i % 2 === 0 ? "" : ""}`}>
                    <td className="px-3 py-2 font-mono text-white/30">{c.id}</td>
                    <td className="px-3 py-2">
                      <div className="text-white/55 font-medium truncate max-w-[140px]">{c.contract_name || c.xlsx_name}</div>
                      {c.etherscan_address && (
                        <div className="text-white/15 font-mono text-[8px] truncate max-w-[140px]">{c.etherscan_address.slice(0,10)}...</div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`font-mono text-[8px] px-1.5 py-0.5 rounded ${isVuln ? "bg-rose-500/10 text-rose-400/70" : "bg-emerald-500/8 text-emerald-400/50"}`}>
                        {isVuln ? "vulnerable" : "safe"}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {c.vuln_types.map(vt => (
                          <span key={vt} className="text-[7px] font-mono text-amber-400/50 bg-amber-500/8 px-1 py-0.5 rounded">
                            {vt.replace(/_/g, " ")}
                          </span>
                        ))}
                        {c.vuln_types.length === 0 && <span className="text-white/12">—</span>}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      {cmp ? (
                        <span className={`font-mono text-[8px] px-1.5 py-0.5 rounded ${cmp.predicted_verdict === "NO-GO" ? "bg-rose-500/10 text-rose-400/60" : "bg-emerald-500/8 text-emerald-400/50"}`}>
                          {cmp.predicted_verdict}
                        </span>
                      ) : <span className="text-white/12">—</span>}
                    </td>
                    <td className="px-3 py-2">
                      {cmp != null ? (
                        <span className={cmp.match ? "text-emerald-400/60" : "text-rose-400/60"}>
                          {cmp.match ? "✓" : "✗"}
                        </span>
                      ) : <span className="text-white/12">—</span>}
                    </td>
                    <td className="px-3 py-2 font-mono text-white/20">{c.solidity_version || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

      </div>
    </div>
  );
}

function StatCard({ label, value, color = "text-white/70" }: { label: string; value: number; color?: string }) {
  return (
    <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-4">
      <div className="text-[9px] uppercase tracking-widest text-white/20 mb-1">{label}</div>
      <div className={`text-[22px] font-bold ${color}`}>{value}</div>
    </div>
  );
}
