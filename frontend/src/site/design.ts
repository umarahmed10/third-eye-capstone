// ─────────────────────────────────────────────────────────────────────────────
// ThirdEye site design tokens.
//
// One palette, defined once, used everywhere. The visual language is an
// INSTRUMENT, not a marketing page: this is a tool that returns a verdict on
// code someone is about to deploy, and the site's job is to make the evidence
// behind that verdict legible. Hence the dark technical ground, the single
// cyan accent, and semantic colours reserved strictly for verdicts.
//
// Verdict colours are NEVER reused for decoration. If something is green on
// this site it means a contract passed, and nothing else.
// ─────────────────────────────────────────────────────────────────────────────

export const C = {
  // ground
  bg: "#0B0E14",
  bgAlt: "#10141C",
  panel: "#151A24",
  panelHi: "#1B2230",
  line: "#242C3A",
  lineHi: "#33405A",

  // ink
  ink: "#E8ECF4",
  inkMid: "#A8B2C4",
  inkDim: "#6B7689",

  // the one accent — ThirdEye's "signal"
  accent: "#3DD8D0",
  accentDim: "#1E8E89",
  accentGhost: "rgba(61,216,208,0.10)",

  // semantic, verdicts ONLY
  go: "#3FB950",
  goGhost: "rgba(63,185,80,0.12)",
  nogo: "#F0535F",
  nogoGhost: "rgba(240,83,95,0.12)",
  inconc: "#8B94A6",
  inconcGhost: "rgba(139,148,166,0.12)",

  // severity ramp (sequential, single hue family)
  sev: {
    critical: "#F0535F",
    high: "#FF8A4C",
    medium: "#E3B341",
    low: "#6B7689",
  } as Record<string, string>,
} as const;

export const F = {
  sans: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif",
  mono: "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace",
  serif: "'Source Serif 4', Georgia, serif",
} as const;

export function sevColor(severity?: string | null): string {
  return C.sev[(severity || "low").toLowerCase()] || C.sev.low;
}

export function verdictColor(v?: string | null) {
  if (v === "GO") return { fg: C.go, bg: C.goGhost };
  if (v === "NO-GO") return { fg: C.nogo, bg: C.nogoGhost };
  return { fg: C.inconc, bg: C.inconcGhost };
}

// Shared inline-style fragments. Inline styles rather than utility classes so
// every page is readable on its own without cross-referencing a config.
export const S = {
  page: {
    maxWidth: 1120,
    margin: "0 auto",
    padding: "0 28px 96px",
  } as React.CSSProperties,

  h1: {
    fontFamily: F.sans,
    fontSize: 40,
    lineHeight: 1.12,
    fontWeight: 600,
    letterSpacing: "-0.02em",
    color: C.ink,
    textWrap: "balance",
    margin: "0 0 14px",
  } as React.CSSProperties,

  h2: {
    fontFamily: F.sans,
    fontSize: 23,
    fontWeight: 600,
    letterSpacing: "-0.01em",
    color: C.ink,
    margin: "44px 0 14px",
  } as React.CSSProperties,

  h3: {
    fontFamily: F.sans,
    fontSize: 15,
    fontWeight: 600,
    color: C.ink,
    margin: "0 0 8px",
  } as React.CSSProperties,

  p: {
    fontFamily: F.sans,
    fontSize: 15,
    lineHeight: 1.65,
    color: C.inkMid,
    maxWidth: "68ch",
    margin: "0 0 14px",
  } as React.CSSProperties,

  eyebrow: {
    fontFamily: F.mono,
    fontSize: 11,
    letterSpacing: "0.13em",
    textTransform: "uppercase",
    color: C.accent,
    margin: "0 0 12px",
  } as React.CSSProperties,

  card: {
    background: C.panel,
    border: `1px solid ${C.line}`,
    borderRadius: 10,
    padding: 20,
  } as React.CSSProperties,

  code: {
    fontFamily: F.mono,
    fontSize: 12.5,
    lineHeight: 1.6,
    color: C.ink,
    background: C.bgAlt,
    border: `1px solid ${C.line}`,
    borderRadius: 8,
    padding: 14,
    overflowX: "auto",
  } as React.CSSProperties,

  tableWrap: {
    overflowX: "auto",
    border: `1px solid ${C.line}`,
    borderRadius: 10,
    background: C.panel,
  } as React.CSSProperties,

  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontFamily: F.sans,
    fontSize: 13.5,
    fontVariantNumeric: "tabular-nums",
  } as React.CSSProperties,

  th: {
    textAlign: "left",
    padding: "11px 14px",
    color: C.inkDim,
    fontWeight: 600,
    fontSize: 11.5,
    letterSpacing: "0.07em",
    textTransform: "uppercase",
    borderBottom: `1px solid ${C.line}`,
    whiteSpace: "nowrap",
  } as React.CSSProperties,

  td: {
    padding: "11px 14px",
    color: C.inkMid,
    borderBottom: `1px solid ${C.line}`,
    verticalAlign: "top",
  } as React.CSSProperties,
};
