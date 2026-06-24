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

export const SEV: Record<string, SevToken> = {
  critical: { text: "text-rose-400", bg: "bg-rose-500/10", ring: "ring-rose-500/25", dot: "bg-rose-400", hex: "#fb7185" },
  high: { text: "text-orange-400", bg: "bg-orange-500/10", ring: "ring-orange-500/25", dot: "bg-orange-400", hex: "#fb923c" },
  medium: { text: "text-amber-400", bg: "bg-amber-500/10", ring: "ring-amber-500/25", dot: "bg-amber-400", hex: "#fbbf24" },
  low: { text: "text-sky-400", bg: "bg-sky-500/10", ring: "ring-sky-500/25", dot: "bg-sky-400", hex: "#38bdf8" },
};

export function sevTokens(sev: string): SevToken {
  return SEV[(sev || "").toLowerCase()] || SEV.medium;
}

// Accent color for the design system (single confident cyan).
export const ACCENT = "#22d3ee";

// Stable color per provider for model-diversity visualizations.
const PROVIDER_HUES: Record<string, string> = {
  openai: "#34d399",
  anthropic: "#f59e0b",
  google: "#60a5fa",
  groq: "#f43f5e",
  ollama: "#a78bfa",
  mistral: "#fb923c",
  deepseek: "#22d3ee",
  together: "#e879f9",
};

export function providerColor(provider: string): string {
  return PROVIDER_HUES[(provider || "").toLowerCase()] || "#94a3b8";
}

// Chart palette (categorical).
export const CHART_COLORS = [
  "#22d3ee",
  "#34d399",
  "#fbbf24",
  "#fb7185",
  "#a78bfa",
  "#60a5fa",
  "#fb923c",
  "#e879f9",
];
