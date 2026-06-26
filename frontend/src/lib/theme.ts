// ─── Severity + role tokens (shared across views) ───

export const SPECIALIST_ROLES = [
  "reentrancy",
  "access_control",
  "arithmetic",
  "business_logic",
  "oracle_price_manipulation",
  "flashloan_mev",
  "dos_gas",
  "proxy_upgradeability",
] as const;

const ROLE_LABELS: Record<string, string> = {
  reentrancy: "Reentrancy",
  access_control: "Access Control",
  arithmetic: "Arithmetic",
  business_logic: "Business Logic",
  oracle_price_manipulation: "Oracle / Price",
  flashloan_mev: "Flash-loan / MEV",
  dos_gas: "DoS / Gas",
  proxy_upgradeability: "Proxy / Upgrade",
};

export function humanizeRole(role: string): string {
  return (
    ROLE_LABELS[role] ||
    role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

export type SevToken = {
  text: string;
  bg: string;
  ring: string;
  dot: string;
  hex: string;
};

// Severity colors — kept semantically readable but tuned warmer to sit on plum.
export const SEV: Record<string, SevToken> = {
  critical: { text: "text-rose-300", bg: "bg-rose-500/12", ring: "ring-rose-500/30", dot: "bg-rose-400", hex: "#fb7185" },
  high: { text: "text-orange-300", bg: "bg-orange-500/12", ring: "ring-orange-500/30", dot: "bg-orange-400", hex: "#fb923c" },
  medium: { text: "text-amber-300", bg: "bg-amber-500/12", ring: "ring-amber-500/30", dot: "bg-amber-400", hex: "#fbbf24" },
  low: { text: "text-violet-300", bg: "bg-violet-500/12", ring: "ring-violet-500/30", dot: "bg-violet-400", hex: "#c4b5fd" },
};

export function sevTokens(sev: string): SevToken {
  return SEV[(sev || "").toLowerCase()] || SEV.medium;
}

// Accent colors for the design system — refined violet + soft lilac, gold highlight.
export const ACCENT = "#a855f7";
export const ACCENT_SOFT = "#c4b5fd";
export const GOLD = "#e8c468";

// Stable color per provider for model-diversity visualizations (purple-leaning palette).
const PROVIDER_HUES: Record<string, string> = {
  openai: "#34d399",
  anthropic: "#e8c468",
  google: "#7dd3fc",
  groq: "#f472b6",
  ollama: "#c4b5fd",
  cerebras: "#f59e0b",
  mistral: "#fb923c",
  deepseek: "#a855f7",
  together: "#e879f9",
};

export function providerColor(provider: string): string {
  return PROVIDER_HUES[(provider || "").toLowerCase()] || "#a78bfa";
}

// Chart palette (categorical) — violet-forward.
export const CHART_COLORS = [
  "#a855f7",
  "#c4b5fd",
  "#e8c468",
  "#f472b6",
  "#7dd3fc",
  "#34d399",
  "#fb923c",
  "#e879f9",
];
