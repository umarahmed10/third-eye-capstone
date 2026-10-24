// ─────────────────────────────────────────────────────────────────────────────
// ThirdEye site design tokens.
//
// One palette, defined once, used everywhere. The visual language is an
// INSTRUMENT, not a marketing page: this is a tool that returns a verdict on
// code someone is about to deploy, and the site's job is to make the evidence
// behind that verdict legible.
//
// LIGHT — "bone paper". The ground is a warm off-white rather than pure #FFF:
// a review room is a lit room with a projector, and flat bone survives both
// without the banding a gradient gets and without the glare a pure white field
// throws. Panels ARE pure white, so a card reads as a sheet laid on the desk —
// that one step of separation is doing the work a border would otherwise do,
// which is why the lines can stay hairline-faint and the page still reads crisp.
//
// Neutrals are warm-biased (hue pulled toward the paper, not pure grey) so the
// greys look chosen rather than defaulted. Ink is near-black at #16150F, not
// #000: full black on bone vibrates at body sizes.
//
// Verdict colours are NEVER reused for decoration. If something is green on
// this site it means a contract passed, and nothing else. All five semantic
// hues below are darkened relative to their dark-theme counterparts — a mid
// green that read cleanly on near-black drops under 3:1 on white, and these
// are the colours a reviewer has to read a verdict off.
// ─────────────────────────────────────────────────────────────────────────────

export const C = {
  // ground
  bg: "#F7F5F0",
  bgAlt: "#EFECE3",
  panel: "#FFFFFF",
  panelHi: "#F4F1E9",
  line: "rgba(22,21,15,0.11)",
  lineHi: "rgba(22,21,15,0.24)",

  // ink
  ink: "#16150F",
  inkMid: "#4C483F",
  inkDim: "#726C60",

  // the one accent — ThirdEye's "signal". Carried over from the exhibit's
  // validated data blue: #2C4A6B failed the palette validator twice (outside
  // the lightness band, under the chroma floor — it rendered as grey, not as
  // a hue), and this is its passing replacement.
  accent: "#1F6FB2",
  accentDim: "#7FA8CE",
  accentGhost: "rgba(31,111,178,0.09)",

  // semantic, verdicts ONLY
  go: "#1C7A3C",
  goGhost: "rgba(28,122,60,0.10)",
  nogo: "#B4231D",
  nogoGhost: "rgba(180,35,29,0.09)",
  inconc: "#6E6A60",
  inconcGhost: "rgba(110,106,96,0.10)",

  // severity ramp (sequential, warm single-hue family, darkened for white)
  sev: {
    critical: "#B4231D",
    high: "#A8520C",
    medium: "#7D6209",
    low: "#726C60",
  } as Record<string, string>,
} as const;

export const F = {
  sans: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif",
  mono: "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace",
  serif: "'Source Serif 4', 'Iowan Old Style', Charter, Georgia, serif",
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

  // Headings take the serif. The site is a lab report: prose and headings
  // carry the argument, sans is reserved for chrome, mono for measurements.
  h1: {
    fontFamily: F.serif,
    fontSize: "clamp(30px, 5.4vw, 40px)",
    lineHeight: 1.1,
    fontWeight: 600,
    letterSpacing: "-0.015em",
    color: C.ink,
    textWrap: "balance",
    margin: "0 0 14px",
    fontOpticalSizing: "auto",
  } as React.CSSProperties,

  h2: {
    fontFamily: F.serif,
    fontSize: "clamp(20px, 3.2vw, 24px)",
    fontWeight: 600,
    letterSpacing: "-0.01em",
    color: C.ink,
    margin: "44px 0 14px",
    fontOpticalSizing: "auto",
  } as React.CSSProperties,

  h3: {
    fontFamily: F.sans,
    fontSize: 15,
    fontWeight: 600,
    letterSpacing: "-0.005em",
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

  // A card is a white sheet on bone. One hairline plus the surface step is
  // enough; a shadow on top of both would read as a dark-theme habit.
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
    background: C.panelHi,
  } as React.CSSProperties,

  td: {
    padding: "11px 14px",
    color: C.inkMid,
    borderBottom: `1px solid ${C.line}`,
    verticalAlign: "top",
  } as React.CSSProperties,
};
