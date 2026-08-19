import { useEffect, useState } from "react";
import { EX, MONO, SERIF, SANS } from "../lib/exhibit-theme";
import { ScanReplay, type Replay } from "../components/exhibit/ScanReplay";
import { LiveScan } from "../components/exhibit/LiveScan";
import { BENCHMARK_SNAPSHOT } from "../data/benchmark";
import safeReplay from "../data/replays/safe.json";
import vulnReplay from "../data/replays/vulnerable.json";

/** The exhibit: one scrolling argument, six screens, one idea per screen.
 *
 * Built for a panel that will see this page ONCE, on a projector, while
 * somebody talks over it. So: light surface (dark themes wash out in a lit
 * room), one idea per viewport, every number followed by a plain-English
 * sentence rather than a label, and the project's worst number shown rather
 * than buried — screens 4-6 only land because screen 3 admits the problem.
 */

const S = BENCHMARK_SNAPSHOT;
const shipped = S.shipped_rule;
const h2h = S.head_to_head;
const compounding = S.story?.compounding ?? [];

const pct = (x?: number) => (x == null ? "—" : `${Math.round(x * 100)}%`);

export function Exhibit({ onOpenApp }: { onOpenApp?: () => void }) {
  // The app shell paints a dark body; the exhibit owns the page while mounted
  // and hands it back on unmount, so opening the tool restores the dark theme.
  useEffect(() => {
    document.body.classList.add("exhibit-mode");
    return () => document.body.classList.remove("exhibit-mode");
  }, []);

  return (
    <div style={{ background: EX.surface, color: EX.ink, fontFamily: SANS, minHeight: "100vh" }}>
      <Masthead onOpenApp={onOpenApp} />
      <Screen1 />
      <Screen2 />
      <Screen3 />
      <Screen4 />
      <Screen5 />
      <Screen6 onOpenApp={onOpenApp} />
      <Colophon />
    </div>
  );
}

/* ─── shared furniture ─────────────────────────────────────────────── */

function Section({
  n, kicker, title, children, tint,
}: { n: string; kicker: string; title: string; children: React.ReactNode; tint?: boolean }) {
  return (
    <section
      style={{
        borderTop: `1px solid ${EX.hairline}`,
        background: tint ? EX.surfaceAlt : "transparent",
        padding: "72px 0",
      }}
    >
      <Wrap>
        <div style={{ display: "flex", gap: 20, alignItems: "baseline", marginBottom: 6 }}>
          <span style={{ fontFamily: MONO, fontSize: 12, color: EX.signal, letterSpacing: ".14em" }}>
            {n}
          </span>
          <span style={{ fontFamily: MONO, fontSize: 12, color: EX.inkMuted, letterSpacing: ".14em", textTransform: "uppercase" }}>
            {kicker}
          </span>
        </div>
        <h2 style={{ fontFamily: SERIF, fontSize: 38, lineHeight: 1.14, letterSpacing: "-0.015em", margin: "0 0 26px", maxWidth: "20ch" }}>
          {title}
        </h2>
        {children}
      </Wrap>
    </section>
  );
}

const Wrap = ({ children }: { children: React.ReactNode }) => (
  <div style={{ maxWidth: 1080, margin: "0 auto", padding: "0 28px" }}>{children}</div>
);

/** A number with a sentence under it. Never a bare metric label. */
function Figure({
  value, caption, tone = "ink", sub,
}: { value: string; caption: string; tone?: "ink" | "signal"; sub?: string }) {
  return (
    <div>
      <div style={{ fontFamily: MONO, fontSize: 62, lineHeight: 1, letterSpacing: "-0.03em", color: tone === "signal" ? EX.signal : EX.ink }}>
        {value}
      </div>
      <div style={{ marginTop: 12, fontSize: 15, lineHeight: 1.5, maxWidth: "34ch", color: EX.ink }}>{caption}</div>
      {sub && <div style={{ marginTop: 6, fontFamily: MONO, fontSize: 11.5, color: EX.slate }}>{sub}</div>}
    </div>
  );
}

/* ─── masthead ─────────────────────────────────────────────────────── */

function Masthead({ onOpenApp }: { onOpenApp?: () => void }) {
  return (
    <header style={{ borderBottom: `2px solid ${EX.ink}` }}>
      <Wrap>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 0", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
            <Aperture />
            <span style={{ fontFamily: SERIF, fontSize: 25, letterSpacing: "-0.01em" }}>ThirdEye</span>
            <span style={{ fontFamily: MONO, fontSize: 11, color: EX.inkMuted, letterSpacing: ".14em" }}>
              SMART-CONTRACT SECURITY / CAPSTONE 2026
            </span>
          </div>
          <button
            onClick={onOpenApp}
            style={{ fontFamily: MONO, fontSize: 12, letterSpacing: ".06em", padding: "8px 14px", background: "transparent", border: `1px solid ${EX.ink}`, color: EX.ink, cursor: "pointer" }}
          >
            OPEN THE TOOL →
          </button>
        </div>
      </Wrap>
    </header>
  );
}

/** An aperture/iris mark — the only ornament on the page. */
function Aperture() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
      <circle cx="13" cy="13" r="11.5" fill="none" stroke={EX.ink} strokeWidth="1.4" />
      <circle cx="13" cy="13" r="4.2" fill={EX.signal} />
      {[0, 60, 120, 180, 240, 300].map((a) => (
        <line
          key={a}
          x1={13 + 4.6 * Math.cos((a * Math.PI) / 180)}
          y1={13 + 4.6 * Math.sin((a * Math.PI) / 180)}
          x2={13 + 11 * Math.cos((a * Math.PI) / 180)}
          y2={13 + 11 * Math.sin((a * Math.PI) / 180)}
          stroke={EX.ink}
          strokeWidth="1"
        />
      ))}
    </svg>
  );
}

/* ─── 1 · the hook ─────────────────────────────────────────────────── */

function Screen1() {
  return (
    <section style={{ padding: "84px 0 72px" }}>
      <Wrap>
        <h1 style={{ fontFamily: SERIF, fontSize: 60, lineHeight: 1.06, letterSpacing: "-0.025em", margin: 0, maxWidth: "16ch" }}>
          A smart contract cannot be patched.
        </h1>
        <p style={{ fontFamily: SERIF, fontSize: 21, lineHeight: 1.55, color: EX.inkMuted, maxWidth: "56ch", marginTop: 22 }}>
          Once it is deployed it is permanent, it holds real money, and anyone in the world can read
          it looking for a flaw. A single bug is unrecoverable — billions of dollars have been lost
          this way. A professional audit costs tens of thousands and takes weeks.
        </p>
        <p style={{ fontSize: 17, lineHeight: 1.6, maxWidth: "56ch", marginTop: 22 }}>
          <strong>ThirdEye reads a contract and answers one question: is this safe to deploy?</strong>{" "}
          It asks eight AI specialists, each hunting one kind of bug, then combines their opinions
          into a single verdict. It runs free, on a laptop.
        </p>
        <div style={{ display: "flex", gap: 52, marginTop: 48, flexWrap: "wrap" }}>
          <Figure value="233" caption="real contracts tested, half known-safe and half known-vulnerable" />
          <Figure value={pct(shipped?.after?.recall)} caption="of genuinely vulnerable contracts are correctly blocked" />
          <Figure
            value={pct(shipped?.after?.fpr)}
            tone="signal"
            caption="of genuinely safe contracts are blocked anyway — the honest weakness"
            sub={`was ${pct(shipped?.before?.fpr)} before the fix in section 5`}
          />
        </div>
      </Wrap>
    </section>
  );
}

/* ─── 2 · watch it work ────────────────────────────────────────────── */

function Screen2() {
  const [which, setWhich] = useState<"safe" | "vulnerable">("vulnerable");
  const [mode, setMode] = useState<"replay" | "live">("replay");
  const replay = (which === "safe" ? safeReplay : vulnReplay) as unknown as Replay;
  return (
    <Section n="01" kicker="Watch it work" title="Eight specialists, one verdict." tint>
      <p style={{ fontSize: 16, lineHeight: 1.6, maxWidth: "62ch", marginBottom: 8 }}>
        These are recordings of <strong>real scans</strong> — the same code path the live tool uses,
        captured with true timings and replayed faster. Pick a contract whose answer we already know
        and watch the specialists resolve.
      </p>
      <p style={{ fontSize: 15, lineHeight: 1.6, maxWidth: "62ch", color: EX.inkMuted, marginBottom: 22 }}>
        Notice the difference: the safe contract wakes <strong>one</strong> specialist and clears.
        The vulnerable one wakes <strong>six</strong>, every one of them flags, and it blocks.
      </p>

      <div style={{ display: "flex", gap: 0, marginBottom: 22, border: `1px solid ${EX.ink}`, width: "fit-content" }}>
        {(["vulnerable", "safe"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setWhich(k)}
            style={{
              fontFamily: MONO, fontSize: 12, letterSpacing: ".06em", padding: "9px 18px", cursor: "pointer",
              background: which === k ? EX.ink : "transparent",
              color: which === k ? EX.surface : EX.ink,
              border: "none",
              borderRight: k === "vulnerable" ? `1px solid ${EX.ink}` : "none",
            }}
          >
            {k === "vulnerable" ? "KNOWN VULNERABLE" : "KNOWN SAFE"}
          </button>
        ))}
      </div>

      <div style={{ background: EX.surface, border: `1px solid ${EX.hairline}`, padding: "22px 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline",
                      flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
          <div style={{ fontFamily: MONO, fontSize: 11.5, color: EX.slate }}>{replay.contract_id}</div>
          {/* "Is that just a video?" is the first thing a skeptic asks. It is not,
              and this button proves it against the real backend. */}
          <div style={{ display: "flex", border: `1px solid ${EX.hairline}` }}>
            {(["replay", "live"] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)}
                style={{ fontFamily: MONO, fontSize: 11, letterSpacing: ".05em", padding: "6px 12px",
                         cursor: "pointer", border: "none",
                         background: mode === m ? EX.ink : "transparent",
                         color: mode === m ? EX.surface : EX.inkMuted }}>
                {m === "replay" ? "RECORDED" : "RUN LIVE"}
              </button>
            ))}
          </div>
        </div>
        {mode === "replay"
          ? <ScanReplay key={which} replay={replay} speed={7} />
          : <LiveScan key={which} code={replay.code} contractId={replay.contract_id} />}
      </div>
    </Section>
  );
}

/* ─── 3 · the catch ────────────────────────────────────────────────── */

function Screen3() {
  return (
    <Section n="02" kicker="The catch" title="It also cries wolf.">
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1.1fr)", gap: 56, alignItems: "start" }} className="ex-two-col">
        <div>
          <Figure
            value={pct(shipped?.before?.fpr)}
            tone="signal"
            caption="of audited, known-good contracts were blocked by the original design — including OpenZeppelin, the most-reviewed Solidity code in existence."
          />
        </div>
        <div style={{ fontSize: 16, lineHeight: 1.65 }}>
          <p style={{ marginTop: 0 }}>
            A security tool that cries wolf two times in three is worse than useless: people stop
            reading its warnings, and then it misses the real bug too.
          </p>
          <p>
            This is the number most published work in this area does not report — and cannot, because
            the standard benchmarks contain <em>only vulnerable contracts</em>. With no safe contracts
            in the test set, a tool that flags everything scores perfectly.
          </p>
          <p style={{ marginBottom: 0 }}>
            <strong>So we built a balanced benchmark — half safe, half vulnerable — and measured it.</strong>{" "}
            The rest of this page is what we found and what we did about it.
          </p>
        </div>
      </div>
    </Section>
  );
}

/* ─── 4 · diagnosis ────────────────────────────────────────────────── */

function Screen4() {
  const max = Math.max(...compounding.map((c) => c.fpr), 0.1);
  return (
    <Section n="03" kicker="Diagnosis" title="The flaw is arithmetic, not the AI." tint>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1.15fr)", gap: 56, alignItems: "start" }} className="ex-two-col">
        <div style={{ fontSize: 16, lineHeight: 1.65 }}>
          <p style={{ marginTop: 0 }}>
            The original rule blocked a contract if <strong>any one</strong> specialist objected.
            Every specialist you add is another independent chance to be wrong — so the false-alarm
            rate climbs with the size of the panel.
          </p>
          <p>
            We measured it. The more specialists consulted, the more often clean code is blocked.
          </p>
          <p style={{ marginBottom: 0, borderLeft: `2px solid ${EX.signal}`, paddingLeft: 14 }}>
            The model diversity that makes the tool sensitive is the same mechanism that makes it
            noisy. No amount of prompt-tuning fixes an aggregation rule.
          </p>
        </div>
        <div style={{ background: EX.surface, border: `1px solid ${EX.hairline}`, padding: "22px 24px" }}>
          <div style={{ fontFamily: MONO, fontSize: 11, color: EX.inkMuted, letterSpacing: ".1em", marginBottom: 18 }}>
            FALSE ALARMS vs SPECIALISTS CONSULTED — SAFE CONTRACTS ONLY
          </div>
          {compounding.map((c) => (
            <div key={c.specialists} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 9 }}>
              <span style={{ fontFamily: MONO, fontSize: 12, width: 60, color: EX.inkMuted }}>
                {c.specialists} spec
              </span>
              <div style={{ flex: 1, height: 20, background: "rgba(0,0,0,0.04)" }}>
                <div style={{ height: "100%", width: `${(c.fpr / max) * 100}%`, background: EX.data }} />
              </div>
              <span style={{ fontFamily: MONO, fontSize: 12, width: 42, textAlign: "right" }}>
                {Math.round(c.fpr * 100)}%
              </span>
              <span style={{ fontFamily: MONO, fontSize: 10.5, width: 34, color: EX.slate }}>n={c.n}</span>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}

/* ─── 5 · the fix ──────────────────────────────────────────────────── */

function Screen5() {
  const rows = [
    { label: "False alarms on safe code", before: shipped?.before?.fpr, after: shipped?.after?.fpr, down: true },
    { label: "Real bugs caught", before: shipped?.before?.recall, after: shipped?.after?.recall, down: false },
    { label: "Overall accuracy (F1)", before: shipped?.before?.f1, after: shipped?.after?.f1, down: false },
  ];
  return (
    <Section n="04" kicker="The fix" title="Stop blocking on one objection.">
      <p style={{ fontSize: 16, lineHeight: 1.65, maxWidth: "64ch" }}>
        Instead of blocking whenever a single specialist objects, we pool their confidence and block
        only when the combined evidence crosses a bar. Same models, same findings, same contracts —
        only the arithmetic that turns them into a verdict changed.
      </p>
      <div style={{ marginTop: 34, background: EX.surfaceAlt, border: `1px solid ${EX.hairline}`, padding: "26px 28px" }}>
        {rows.map((r) => (
          <div key={r.label} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 96px 30px 96px", gap: 14, alignItems: "baseline", padding: "13px 0", borderBottom: `1px solid ${EX.hairline}` }}>
            <span style={{ fontSize: 15 }}>{r.label}</span>
            <span style={{ fontFamily: MONO, fontSize: 22, color: EX.slate, textAlign: "right" }}>{pct(r.before)}</span>
            <span style={{ fontFamily: MONO, fontSize: 15, color: EX.inkMuted, textAlign: "center" }}>→</span>
            <span style={{ fontFamily: MONO, fontSize: 22, textAlign: "right", color: r.down ? EX.signal : EX.ink }}>
              {pct(r.after)}
            </span>
          </div>
        ))}
        <p style={{ fontSize: 14, lineHeight: 1.6, color: EX.inkMuted, marginTop: 18, marginBottom: 0, maxWidth: "70ch" }}>
          False alarms cut by more than half, for about nine points of recall, at{" "}
          <strong style={{ color: EX.ink }}>zero extra computing cost</strong>. The bar was chosen on
          one half of the contracts and tested on the other, over ten random splits, improving in
          nine. <strong style={{ color: EX.ink }}>This is the rule the tool runs today</strong> — not
          a proposal.
        </p>
      </div>
    </Section>
  );
}

/* ─── 6 · versus the field ─────────────────────────────────────────── */

function Screen6({ onOpenApp }: { onOpenApp?: () => void }) {
  const cov = h2h?.coverage;
  const slitherTotal = 150;
  return (
    <Section n="05" kicker="Versus the standard tool" title="Neither wins on accuracy. One can read the code at all." tint>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 56 }} className="ex-two-col">
        <div>
          <div style={{ fontFamily: MONO, fontSize: 11, color: EX.inkMuted, letterSpacing: ".1em", marginBottom: 16 }}>
            ON THE {h2h?.n_common ?? 29} CONTRACTS BOTH TOOLS COULD SCORE
          </div>
          {[
            { n: "ThirdEye", p: h2h?.council?.precision, r: h2h?.council?.recall, f: h2h?.council?.f1 },
            { n: "Slither (industry standard)", p: h2h?.slither?.precision, r: h2h?.slither?.recall, f: h2h?.slither?.f1 },
          ].map((t) => (
            <div key={t.n} style={{ borderBottom: `1px solid ${EX.hairline}`, padding: "12px 0" }}>
              <div style={{ fontSize: 15, marginBottom: 6 }}>{t.n}</div>
              <div style={{ fontFamily: MONO, fontSize: 12.5, color: EX.inkMuted, display: "flex", gap: 20 }}>
                <span>precision {t.p?.toFixed(3)}</span>
                <span>recall {t.r?.toFixed(3)}</span>
                <span style={{ color: EX.ink }}>F1 {t.f?.toFixed(3)}</span>
              </div>
            </div>
          ))}
          <p style={{ fontSize: 15, lineHeight: 1.6, marginTop: 18 }}>
            Accuracy is <strong>a tie</strong>. We buy recall with precision; Slither does the
            reverse. That is a trade-off, not a victory — and it is the honest way to report it.
          </p>
        </div>

        <div>
          <div style={{ fontFamily: MONO, fontSize: 11, color: EX.inkMuted, letterSpacing: ".1em", marginBottom: 16 }}>
            HOW MUCH OF THE BENCHMARK EACH COULD ANALYSE AT ALL
          </div>
          {[
            { n: "ThirdEye — reads the source", got: cov?.council_scored ?? 0, of: cov?.council_scored ?? 0 },
            { n: "Slither — must compile first", got: cov?.slither_scored ?? 0, of: slitherTotal },
          ].map((c, i) => (
            <div key={c.n} style={{ marginBottom: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                <span style={{ fontSize: 14 }}>{c.n}</span>
                <span style={{ fontFamily: MONO, fontSize: 12.5 }}>
                  {c.got}/{c.of} &middot; {Math.round((c.got / (c.of || 1)) * 100)}%
                </span>
              </div>
              <div style={{ height: 22, background: "rgba(0,0,0,0.04)" }}>
                <div style={{ height: "100%", width: `${(c.got / (c.of || 1)) * 100}%`, background: i === 0 ? EX.data : EX.slate }} />
              </div>
            </div>
          ))}
          <p style={{ fontSize: 15, lineHeight: 1.6 }}>
            Slither could not even compile <strong>69%</strong> of the benchmark — and the failures
            are not random. It managed most of the old, simple vulnerable contracts and few of the
            large modern ones. <strong>Published accuracy for tools like it is measured on whatever
            happened to compile.</strong>
          </p>
        </div>
      </div>

      <div style={{ marginTop: 46, borderTop: `2px solid ${EX.ink}`, paddingTop: 26, display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center" }}>
        <p style={{ fontFamily: SERIF, fontSize: 20, lineHeight: 1.5, margin: 0, flex: 1, minWidth: 280, maxWidth: "58ch" }}>
          The tool is not deployable — a 27% false-alarm rate is still too high, and we say so. What
          this project produced is a way to <em>measure</em> that honestly, and a fix for the part
          that was broken.
        </p>
        <button
          onClick={onOpenApp}
          style={{ fontFamily: MONO, fontSize: 13, letterSpacing: ".06em", padding: "13px 22px", background: EX.ink, color: EX.surface, border: "none", cursor: "pointer" }}
        >
          SCAN A CONTRACT YOURSELF →
        </button>
      </div>
    </Section>
  );
}

function Colophon() {
  return (
    <footer style={{ borderTop: `1px solid ${EX.hairline}`, padding: "34px 0 56px" }}>
      <Wrap>
        <div style={{ fontFamily: MONO, fontSize: 11.5, color: EX.slate, lineHeight: 1.9 }}>
          <div>
            CAPSTONE TEAM 2 &middot; PESU &middot; 2025—2026 &middot; UMAR, ANVITA, LAKSHITHA, TARUN
          </div>
          <div>
            Every figure on this page is measured on {shipped?.n ?? 233} contracts and reproducible
            from checkpoints in the repository. Nothing is estimated.
          </div>
        </div>
      </Wrap>
    </footer>
  );
}
