import { useState, type ReactNode } from "react";
import type { User } from "../lib/api";
import {
  ThirdEyeMark,
  ScanIcon,
  FlowIcon,
  ChartIcon,
  HistoryIcon,
  LogoutIcon,
} from "./ui/icons";

export type Tab = "analyze" | "how" | "benchmarks" | "history";

const NAV: { id: Tab; label: string; icon: (p: { size?: number }) => ReactNode }[] = [
  { id: "analyze", label: "Scan", icon: ScanIcon },
  { id: "how", label: "How It Works", icon: FlowIcon },
  { id: "benchmarks", label: "Benchmarks", icon: ChartIcon },
  { id: "history", label: "History", icon: HistoryIcon },
];

export function Layout({
  user,
  tab,
  onTab,
  onLogout,
  children,
}: {
  user: User;
  tab: Tab;
  onTab: (t: Tab) => void;
  onLogout: () => void;
  children: ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="h-screen flex overflow-hidden bg-[#0e0a14] text-slate-200">
      {/* ─── Sidebar ─── */}
      <aside
        className={`fixed lg:static z-30 h-full w-[232px] flex-shrink-0 flex flex-col border-r border-violet-300/[0.08] bg-[#120c1e]/95 backdrop-blur transition-transform duration-300 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        {/* Brand */}
        <div className="px-5 h-[60px] flex items-center gap-2.5 border-b border-violet-300/[0.08]">
          <div className="text-violet-300">
            <ThirdEyeMark size={26} />
          </div>
          <div className="leading-none">
            <div className="text-[15px] font-bold text-white tracking-tight">Third-Eye</div>
            <div className="text-[9px] uppercase tracking-[0.22em] text-violet-300/50 mt-1">
              Contract Security
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5" aria-label="Primary">
          {NAV.map((item) => {
            const active = tab === item.id;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => {
                  onTab(item.id);
                  setMobileOpen(false);
                }}
                aria-current={active ? "page" : undefined}
                className={`group w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-colors ${
                  active
                    ? "bg-violet-500/[0.14] text-violet-100 ring-1 ring-violet-400/25"
                    : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]"
                }`}
              >
                <span className={active ? "text-violet-300" : "text-slate-500 group-hover:text-slate-300"}>
                  <Icon size={17} />
                </span>
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* User footer */}
        <div className="px-3 py-3 border-t border-violet-300/[0.08]">
          <div className="flex items-center gap-2.5 px-2 py-2 rounded-lg">
            <div className="w-8 h-8 rounded-lg bg-violet-500/15 ring-1 ring-violet-400/25 flex items-center justify-center text-[12px] font-bold text-violet-200 uppercase">
              {user.username.slice(0, 2)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[12px] font-medium text-slate-200 truncate">{user.username}</div>
              <div className="text-[9px] text-violet-300/45">authenticated</div>
            </div>
            <button
              onClick={onLogout}
              title="Sign out"
              aria-label="Sign out"
              className="p-1.5 rounded-md text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
            >
              <LogoutIcon size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Backdrop for mobile drawer */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/60 lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ─── Main column ─── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="flex-shrink-0 h-[60px] flex items-center gap-3 px-4 sm:px-6 border-b border-violet-300/[0.08] bg-[#120c1e]/70 backdrop-blur">
          <button
            onClick={() => setMobileOpen(true)}
            className="lg:hidden p-1.5 rounded-md text-slate-400 hover:bg-white/[0.05]"
            aria-label="Open navigation"
          >
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
              <path strokeLinecap="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          </button>
          <h1 className="text-[14px] font-semibold text-white capitalize">
            {NAV.find((n) => n.id === tab)?.label}
          </h1>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden sm:inline-flex items-center gap-1.5 text-[10px] font-mono text-slate-500">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse-glow" />
              engine online
            </span>
          </div>
        </header>

        <main className="flex-1 min-h-0 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
