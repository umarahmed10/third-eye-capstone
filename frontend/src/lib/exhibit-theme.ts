/** ThirdEye exhibit design tokens — "field instrument / lab report".
 *
 * Deliberately LIGHT. Two reasons, one aesthetic and one practical:
 *  - every AI demo ships dark violet; this reads as a different kind of artefact
 *  - a panel review runs on a projector in a lit room, where dark themes wash
 *    out and low-contrast text is unreadable from the back
 *
 * Contrast against the bone surface is computed, not eyeballed (WCAG 2.1):
 *   ink 16.8:1 · muted 5.2:1 · signal 5.5:1 · data 8.4:1 · slate 3.4:1
 * The hairline is 1.37:1 by intent — it is a rule, never information.
 *
 * Status is never colour alone: BLOCKED/CLEARED always ship with a word and a
 * mark, so the design survives colourblindness and greyscale printing. That
 * also sidesteps the red/green trap entirely, since only one hue carries state.
 */
export const EX = {
  surface: "#F7F5F0",      // bone paper
  surfaceAlt: "#F1EEE6",   // recessed panel
  ink: "#16150F",          // body text
  inkMuted: "#6B675C",     // secondary text
  hairline: "#D8D3C7",     // rules (decorative)
  signal: "#B4351F",       // vermillion — blocked / danger
  signalWash: "#F6E7E2",   // vermillion at low weight
  data: "#2C4A6B",         // charts, single sequential hue
  dataMid: "#5C7C9E",
  slate: "#7A8794",        // de-emphasised marks
} as const;

/** Monospace for every number. Data should look measured, not typeset. */
export const MONO =
  "'Berkeley Mono','JetBrains Mono','IBM Plex Mono',ui-monospace,'SF Mono',Menlo,Consolas,monospace";
/** A serif for prose gives the page a paper/report register rather than SaaS. */
export const SERIF =
  "'Source Serif 4','Iowan Old Style','Charter',Georgia,'Times New Roman',serif";
export const SANS =
  "'Inter','Helvetica Neue',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif";
