import { useEffect, useState } from "react";
import { EX, MONO, SERIF, SANS } from "../lib/exhibit-theme";
import { ScanReplay, type Replay } from "../components/exhibit/ScanReplay";
import { LiveScan } from "../components/exhibit/LiveScan";
import { BENCHMARK_SNAPSHOT } from "../data/benchmark";
import safeReplay from "../data/replays/safe.json";
import vulnReplay from "../data/replays/vulnerable.json";

/** The exhibit, framed as a PAPER rather than a product.
 *
 * The panel is assessing one thing: whether there is a publishable contribution
 * here. A product page answers "is this tool good?" — and on that framing our
 * 27% false-alarm rate is a liability to explain away. On a research framing the
 * same number is the finding: it is what a balanced benchmark exposes and what
 * the all-positive benchmarks in this field structurally cannot show.
 *
 * So the page is ordered as a paper: claim, contributions each with its evidence
 * and its novelty, what we refuse to claim, manuscript status. The working tool
 * appears once, as evidence the artifact is real — not as the headline.
 */

const S = BENCHMARK_SNAPSHOT;
const shipped = S.shipped_rule;
const h2h = S.head_to_head;
const compounding = S.story?.compounding ?? [];
const pm = S.proposed_methods;

const pct = (x?: number) => (x == null ? "—" : `${Math.round(x * 100)}%`);
const f3 = (x?: number) => (x == null ? "—" : x.toFixed(3));

export function Exhibit({ onOpenApp }: { onOpenApp?: () => void }) {
  useEffect(() => {
    document.body.classList.add("exhibit-mode");
    return () => document.body.classList.remove("exhibit-mode");
  }, []);

  return (
    <div style={{ background: EX.surface, color: EX.ink, fontFamily: SANS, minHeight: "100vh" }}>
      <Masthead onOpenApp={onOpenApp} />
      <TitleBlock />
      <Contribution1 />
      <Contribution2 />
      <Contribution3 />
      <Contribution4 />
      <Artifact onOpenApp={onOpenApp} />
      <NotClaimed />
      <Status />
      <Colophon />
    </div>
  );
}

/* ─── furniture ────────────────────────────────────────────────────── */

const Wrap = ({ children }: { children: React.ReactNode }) => (
  <div style={{ maxWidth: 1060, margin: "0 auto", padding: "0 28px" }}>{children}</div>
);

function Section({
  n, kicker, title, lede, children, tint,
}: {
  n: string; kicker: string; title: string; lede?: string;
  children: React.ReactNode; tint?: boolean;
}) {
  return (
    <section style={{ borderTop: `1px solid ${EX.hairline}`, background: tint ? EX.surfaceAlt : "transparent", padding: "68px 0" }}>
      <Wrap>
        <div style={{ display: "flex", gap: 18, alignItems: "baseline", marginBottom: 8 }}>
          <span style={{ fontFamily: MONO, fontSize: 11.5, color: EX.signal, letterSpacing: ".16em" }}>{n}</span>
          <span style={{ fontFamily: MONO, fontSize: 11.5, color: EX.inkMuted, letterSpacing: ".16em", textTransform: "uppercase" }}>{kicker}</span>
        </div>
        <h2 style={{ fontFamily: SERIF, fontSize: 34, lineHeight: 1.18, letterSpacing: "-0.015em", margin: "0 0 14px", maxWidth: "26ch" }}>{title}</h2>
        {lede && (
          <p style={{ fontFamily: SERIF, fontSize: 18, lineHeight: 1.55, color: EX.inkMuted, maxWidth: "64ch", margin: "0 0 26px" }}>{lede}</p>
        )}
        {children}
      </Wrap>
    </section>
  );
}

/** The claim, then exactly what backs it — the shape a reviewer reads in. */
function Evidence({ items }: { items: { k: string; v: string }[] }) {
  return (
    <div style={{ borderTop: `1px solid ${EX.hairline}`, marginTop: 22 }}>
      {items.map((it) => (
        <div key={it.k} style={{ display: "grid", gridTemplateColumns: "150px 1fr", gap: 18, padding: "10px 0", borderBottom: `1px solid ${EX.hairline}` }}>
          <span style={{ fontFamily: MONO, fontSize: 11, color: EX.slate, letterSpacing: ".1em", textTransform: "uppercase", paddingTop: 2 }}>{it.k}</span>
          <span style={{ fontSize: 14.5, lineHeight: 1.55 }}>{it.v}</span>
        </div>
      ))}
    </div>
  );
}

function Novelty({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ marginTop: 20, borderLeft: `2px solid ${EX.signal}`, paddingLeft: 14, fontSize: 15, lineHeight: 1.6, maxWidth: "66ch" }}>
      <strong style={{ fontFamily: MONO, fontSize: 11, letterSpacing: ".1em", color: EX.signal, display: "block", marginBottom: 5 }}>
        WHY IT IS NEW
      </strong>
      {children}
    </p>
  );
}

/* ─── masthead + title ─────────────────────────────────────────────── */

function Masthead({ onOpenApp }: { onOpenApp?: () => void }) {
  return (
    <header style={{ borderBottom: `2px solid ${EX.ink}` }}>
      <Wrap>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 0", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 13 }}>
            <Aperture />
            <span style={{ fontFamily: SERIF, fontSize: 23 }}>ThirdEye</span>
            <span style={{ fontFamily: MONO, fontSize: 10.5, color: EX.inkMuted, letterSpacing: ".14em" }}>
              RESEARCH EXHIBIT · CAPSTONE TEAM 2 · PESU
            </span>
          </div>
          <button onClick={onOpenApp}
            style={{ fontFamily: MONO, fontSize: 11.5, letterSpacing: ".06em", padding: "7px 13px", background: "transparent", border: `1px solid ${EX.ink}`, color: EX.ink, cursor: "pointer" }}>
            OPEN THE ARTIFACT →
          </button>
        </div>
      </Wrap>
    </header>
  );
}

function Aperture() {
  return (
    <svg width="24" height="24" viewBox="0 0 26 26" aria-hidden="true">
      <circle cx="13" cy="13" r="11.5" fill="none" stroke={EX.ink} strokeWidth="1.4" />
      <circle cx="13" cy="13" r="4.2" fill={EX.signal} />
      {[0, 60, 120, 180, 240, 300].map((a) => (
        <line key={a}
          x1={13 + 4.6 * Math.cos((a * Math.PI) / 180)} y1={13 + 4.6 * Math.sin((a * Math.PI) / 180)}
          x2={13 + 11 * Math.cos((a * Math.PI) / 180)} y2={13 + 11 * Math.sin((a * Math.PI) / 180)}
          stroke={EX.ink} strokeWidth="1" />
      ))}
    </svg>
  );
}

function TitleBlock() {
  return (
    <section style={{ padding: "70px 0 60px" }}>
      <Wrap>
        <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: ".18em", color: EX.signal, marginBottom: 18 }}>
          MANUSCRIPT IN PREPARATION · TARGET: SE / SECURITY VENUE
        </div>
        <h1 style={{ fontFamily: SERIF, fontSize: 46, lineHeight: 1.12, letterSpacing: "-0.02em", margin: 0, maxWidth: "24ch" }}>
          Why LLM auditor ensembles cry wolf, and the one-line fix
        </h1>
        <p style={{ fontFamily: SERIF, fontSize: 19, lineHeight: 1.6, color: EX.inkMuted, maxWidth: "68ch", marginTop: 22 }}>
          Ensembles of specialist language models are a common design for automated smart-contract
          auditing, and the literature reports their recall. We show that the way those ensembles
          combine opinions makes their false-alarm rate grow with ensemble size — a defect the
          field&rsquo;s standard benchmarks cannot observe, because they contain almost no safe
          contracts. We build a balanced benchmark, measure the effect, and fix it in the
          aggregation rule at zero inference cost.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 26, marginTop: 44, borderTop: `2px solid ${EX.ink}`, paddingTop: 24 }}>
          {[
            { k: "Four contributions", v: "one empirical, one methodological, one comparative, one negative" },
            { k: "Evidence base", v: `${shipped?.n ?? 233} contracts, balanced safe : vulnerable, zero abstentions` },
            { k: "Headline effect", v: `false alarms ${pct(shipped?.before?.fpr)} → ${pct(shipped?.after?.fpr)}, held out over 10 splits` },
            { k: "Artifact", v: "code, checkpoints and decision log released in full" },
          ].map((x) => (
            <div key={x.k}>
              <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: ".12em", color: EX.slate, textTransform: "uppercase" }}>{x.k}</div>
              <div style={{ fontSize: 14.5, lineHeight: 1.5, marginTop: 7 }}>{x.v}</div>
            </div>
          ))}
        </div>
      </Wrap>
    </section>
  );
}

/* ─── C1 ───────────────────────────────────────────────────────────── */

function Contribution1() {
  const max = Math.max(...compounding.map((c) => c.fpr), 0.1);
  return (
    <Section
      n="C1" kicker="Empirical finding" tint
      title="False alarms compound with ensemble size."
      lede="A specialist council blocks a contract if any one member objects. That is a logical OR over k detectors, so the false-alarm rate rises with every specialist added — by construction, not by bad prompting."
    >
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1.05fr)", gap: 48, alignItems: "start" }}>
        <div style={{ background: EX.surface, border: `1px solid ${EX.hairline}`, padding: "20px 22px" }}>
          <div style={{ fontFamily: MONO, fontSize: 10.5, color: EX.inkMuted, letterSpacing: ".1em", marginBottom: 16 }}>
            FALSE-ALARM RATE vs SPECIALISTS CONSULTED · SAFE CONTRACTS ONLY
          </div>
          {compounding.map((c) => (
            <div key={c.specialists} style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 8 }}>
              <span style={{ fontFamily: MONO, fontSize: 11.5, width: 22, color: EX.inkMuted }}>{c.specialists}</span>
              <div style={{ flex: 1, height: 18, background: "rgba(0,0,0,0.045)" }}>
                <div style={{ height: "100%", width: `${(c.fpr / max) * 100}%`, background: EX.data }} />
              </div>
              <span style={{ fontFamily: MONO, fontSize: 11.5, width: 38, textAlign: "right" }}>{Math.round(c.fpr * 100)}%</span>
              <span style={{ fontFamily: MONO, fontSize: 10, width: 32, color: EX.slate }}>n={c.n}</span>
            </div>
          ))}
        </div>
        <div>
          <Evidence items={[
            { k: "Measurement", v: "124 audited-safe contracts, grouped by how many specialists the router engaged." },
            { k: "Effect", v: "Monotone rise from 54% at one specialist to 74% at four." },
            { k: "Mechanism", v: "Contract-level FP ≈ 1−(1−p)^k for k independent detectors. Arithmetic, not model quality." },
          ]} />
          <Novelty>
            This is invisible to the benchmarks the field uses. SmartBugs-Curated and Web3Bugs are
            almost entirely vulnerable contracts, so precision is mechanically 1.0 whenever recall
            is non-zero and a false-alarm rate cannot be computed at all. A tool that flags
            everything scores perfectly. The effect only appears once a balanced safe class exists —
            which is why it has not been reported.
          </Novelty>
        </div>
      </div>
    </Section>
  );
}

/* ─── C2 ───────────────────────────────────────────────────────────── */

function Contribution2() {
  const rows = [
    { label: "False-alarm rate (safe)", b: shipped?.before?.fpr, a: shipped?.after?.fpr },
    { label: "Recall (vulnerable)", b: shipped?.before?.recall, a: shipped?.after?.recall },
    { label: "F1", b: shipped?.before?.f1, a: shipped?.after?.f1 },
  ];
  return (
    <Section
      n="C2" kicker="Method" title="Pool the evidence instead of gating on any one objection."
      lede="Replace the OR with a noisy-OR over finding confidences and block only above a threshold. Same models, same findings, same contracts — only the arithmetic that produces a verdict changes."
    >
      <div style={{ background: EX.surfaceAlt, border: `1px solid ${EX.hairline}`, padding: "22px 26px", maxWidth: 640 }}>
        <div style={{ fontFamily: MONO, fontSize: 12.5, color: EX.inkMuted, marginBottom: 16 }}>
          risk = 1 − Π(1 − confᵢ) &nbsp;&nbsp; block iff risk ≥ τ = {shipped?.tau ?? 0.925}
        </div>
        {rows.map((r) => (
          <div key={r.label} style={{ display: "grid", gridTemplateColumns: "1fr 78px 24px 78px", alignItems: "baseline", padding: "10px 0", borderTop: `1px solid ${EX.hairline}` }}>
            <span style={{ fontSize: 14 }}>{r.label}</span>
            <span style={{ fontFamily: MONO, fontSize: 18, color: EX.slate, textAlign: "right" }}>{pct(r.b)}</span>
            <span style={{ fontFamily: MONO, fontSize: 13, color: EX.inkMuted, textAlign: "center" }}>→</span>
            <span style={{ fontFamily: MONO, fontSize: 18, textAlign: "right", color: EX.signal }}>{pct(r.a)}</span>
          </div>
        ))}
      </div>

      <Evidence items={[
        { k: "Protocol", v: `τ fitted on a dev split and scored on a disjoint test split, repeated over ${pm?.weighted?.n_splits ?? 10} random partitions; improves in ${pm?.weighted?.wins ?? 9}.` },
        { k: "Cost", v: "Zero additional inference. It is different arithmetic over findings already produced." },
        { k: "Ablation", v: `A per-class reliability-weighted variant was tested as a control and did NOT beat the plain threshold (${pm?.weighted?.weighting_wins ?? 4}/${pm?.weighted?.n_splits ?? 10} splits), so the simpler rule is reported.` },
        { k: "Deployed", v: "Shipped in the tool and verified by replaying every scored contract through the production function." },
      ]} />

      <Novelty>
        The control is the point. Changing two things at once — weights and a threshold — is how a
        method paper gets rejected. We ran the single-variable control ourselves, it disproved our
        preferred explanation, and we report the simpler rule that survived.
      </Novelty>
    </Section>
  );
}

/* ─── C3 ───────────────────────────────────────────────────────────── */

function Contribution3() {
  const cov = h2h?.coverage;
  return (
    <Section
      n="C3" kicker="Comparative" tint
      title="Static-analysis baselines abstain non-randomly."
      lede="Measured against Slither on identical contracts and identical ground truth. Accuracy ties. Coverage does not — and the gap is not random."
    >
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 48 }}>
        <div>
          <div style={{ fontFamily: MONO, fontSize: 10.5, color: EX.inkMuted, letterSpacing: ".1em", marginBottom: 14 }}>
            ON THE {h2h?.n_common ?? 29} CONTRACTS BOTH TOOLS SCORED
          </div>
          {[
            { n: "ThirdEye", d: h2h?.council },
            { n: "Slither", d: h2h?.slither },
          ].map((t) => (
            <div key={t.n} style={{ borderBottom: `1px solid ${EX.hairline}`, padding: "11px 0" }}>
              <div style={{ fontSize: 14.5, marginBottom: 5 }}>{t.n}</div>
              <div style={{ fontFamily: MONO, fontSize: 12, color: EX.inkMuted, display: "flex", gap: 16, flexWrap: "wrap" }}>
                <span>P {f3(t.d?.precision)}</span>
                <span>R {f3(t.d?.recall)}</span>
                <span style={{ color: EX.ink }}>F1 {f3(t.d?.f1)}</span>
              </div>
            </div>
          ))}
          <p style={{ fontSize: 14.5, lineHeight: 1.6, marginTop: 16 }}>
            F1 is effectively tied. We trade precision for recall; Slither trades the reverse. A
            trade-off characterisation, not a victory — and more useful to a practitioner than a
            contested win.
          </p>
        </div>
        <div>
          <div style={{ fontFamily: MONO, fontSize: 10.5, color: EX.inkMuted, letterSpacing: ".1em", marginBottom: 14 }}>
            HOW MUCH OF THE BENCHMARK EACH COULD ANALYSE
          </div>
          {[
            { n: "ThirdEye — reads source", got: cov?.council_scored ?? 233, of: cov?.council_scored ?? 233 },
            { n: "Slither — must compile", got: cov?.slither_scored ?? 46, of: 150 },
          ].map((c, i) => (
            <div key={c.n} style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                <span style={{ fontSize: 14 }}>{c.n}</span>
                <span style={{ fontFamily: MONO, fontSize: 12 }}>{Math.round((c.got / (c.of || 1)) * 100)}%</span>
              </div>
              <div style={{ height: 18, background: "rgba(0,0,0,0.045)" }}>
                <div style={{ height: "100%", width: `${(c.got / (c.of || 1)) * 100}%`, background: i === 0 ? EX.data : EX.slate }} />
              </div>
            </div>
          ))}
          <Novelty>
            Slither compiled most of the old, simple vulnerable contracts and few of the large
            modern ones. Any accuracy figure published for a static analyser on a corpus like this
            is therefore computed on a subset selected for being easy to compile. We have not seen
            this bias stated in comparable evaluations.
          </Novelty>
        </div>
      </div>
    </Section>
  );
}

/* ─── C4 ───────────────────────────────────────────────────────────── */

const FAILURES: [string, string][] = [
  ["Pinned model absent", "A half-dead council recorded clean passes; 1,152 contracts of results discarded"],
  ["Partial council treated as terminal", "32/198 rows had errored specialists — 100% of them GO"],
  ["Provider quota drain checkpointed", "A transient outage baked permanently into recall"],
  ["Arbitration silently used a hosted model", "A run labelled local was calling a 120B model"],
  ["Arbiter config fell back on an unknown key", "Hosted runs judged by a weak local model; looked like a real precision collapse"],
  ["Sampling by first-N", "The “sample” was 263 consecutive files from one library"],
  ["Health probe shorter than cold start", "Aborted a healthy backend"],
  ["Measured rule ≠ shipped rule", "The paper quoted a threshold the product did not implement"],
];

function Contribution4() {
  return (
    <Section
      n="C4" kicker="Methodological" title="Eight ways an LLM evaluation lies to you."
      lede="Every one produced plausible metrics from a broken pipeline. Nothing crashed; no error appeared; the dashboard filled in. And every one biased the result in the same direction — toward calling code safe."
    >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: "0 44px" }}>
        {FAILURES.map(([t, d], i) => (
          <div key={t} style={{ display: "flex", gap: 13, padding: "12px 0", borderBottom: `1px solid ${EX.hairline}` }}>
            <span style={{ fontFamily: MONO, fontSize: 11, color: EX.signal, paddingTop: 3 }}>
              {String(i + 1).padStart(2, "0")}
            </span>
            <div>
              <div style={{ fontSize: 14.5, lineHeight: 1.4 }}>{t}</div>
              <div style={{ fontSize: 13, color: EX.inkMuted, lineHeight: 1.5, marginTop: 3 }}>{d}</div>
            </div>
          </div>
        ))}
      </div>
      <Novelty>
        The asymmetry is the contribution. A dead specialist can only fail to raise a flag, never
        raise a false one — so silent failures in this class systematically make a security tool
        look safer than it is. We give the invariants that convert each into a loud failure, and we
        publish the decision log recording every reversal, including two of our own.
      </Novelty>
    </Section>
  );
}

/* ─── artifact ─────────────────────────────────────────────────────── */

function Artifact({ onOpenApp }: { onOpenApp?: () => void }) {
  const [which, setWhich] = useState<"safe" | "vulnerable">("vulnerable");
  const [mode, setMode] = useState<"replay" | "live">("replay");
  const replay = (which === "safe" ? safeReplay : vulnReplay) as unknown as Replay;
  return (
    <Section
      n="A" kicker="Artifact" tint
      title="The system is real, and so is the evidence."
      lede="Reproducibility is a reviewer's first question. Below is a recording of an actual scan — same code path, true timings — and a button to run one live against the backend."
    >
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
        <div style={{ display: "flex", border: `1px solid ${EX.ink}` }}>
          {(["vulnerable", "safe"] as const).map((k) => (
            <button key={k} onClick={() => setWhich(k)}
              style={{ fontFamily: MONO, fontSize: 11, letterSpacing: ".05em", padding: "7px 14px", cursor: "pointer", border: "none",
                       background: which === k ? EX.ink : "transparent", color: which === k ? EX.surface : EX.ink }}>
              {k === "vulnerable" ? "KNOWN VULNERABLE" : "KNOWN SAFE"}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", border: `1px solid ${EX.hairline}` }}>
          {(["replay", "live"] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)}
              style={{ fontFamily: MONO, fontSize: 11, letterSpacing: ".05em", padding: "7px 14px", cursor: "pointer", border: "none",
                       background: mode === m ? EX.ink : "transparent", color: mode === m ? EX.surface : EX.inkMuted }}>
              {m === "replay" ? "RECORDED" : "RUN LIVE"}
            </button>
          ))}
        </div>
      </div>

      <div style={{ background: EX.surface, border: `1px solid ${EX.hairline}`, padding: "20px 22px" }}>
        <div style={{ fontFamily: MONO, fontSize: 11, color: EX.slate, marginBottom: 14 }}>{replay.contract_id}</div>
        {mode === "replay"
          ? <ScanReplay key={which} replay={replay} speed={7} />
          : <LiveScan key={which} code={replay.code} contractId={replay.contract_id} />}
      </div>

      <Evidence items={[
        { k: "Benchmark", v: "2,250 labelled contracts from 11 pinned sources, balanced 1,125 safe : 1,125 vulnerable, across six trust tiers." },
        { k: "Released", v: "Code, per-contract checkpoints, seeds, and a decision log recording every reversal." },
        { k: "Sampling", v: "Seeded and nested, so a larger run is a strict superset of a smaller one and the population never silently changes." },
      ]} />

      <div style={{ marginTop: 22 }}>
        <button onClick={onOpenApp}
          style={{ fontFamily: MONO, fontSize: 12, letterSpacing: ".06em", padding: "11px 18px", background: EX.ink, color: EX.surface, border: "none", cursor: "pointer" }}>
          OPEN THE WORKING TOOL →
        </button>
      </div>
    </Section>
  );
}

/* ─── limitations ──────────────────────────────────────────────────── */

function NotClaimed() {
  const items: [string, string][] = [
    ["We do not claim to beat GPTScan.", "Different dataset, no head-to-head run. GPTScan reports on its own evaluated subset; until that subset is pinned, our recall is not comparable to theirs."],
    ["We do not claim the tool is deployable.", `A ${pct(shipped?.after?.fpr)} false-alarm rate is too high for production use, and the paper says so.`],
    ["We do not claim exploit confirmation works.", "The dynamic stage is scaffold. General auto-exploitation of arbitrary contracts is an open problem."],
    ["We do not claim retrieval improves verdicts.", "Precedents are surfaced but never reach the model's prompt, so they cannot affect a result."],
  ];
  return (
    <Section n="L" kicker="Limitations" title="What this paper does not claim."
      lede="Stating the boundary is not a weakness in review — it is the difference between a result and an overreach, and a reviewer will find the boundary anyway.">
      {items.map(([t, d]) => (
        <div key={t} style={{ padding: "13px 0", borderBottom: `1px solid ${EX.hairline}` }}>
          <div style={{ fontSize: 15.5, fontFamily: SERIF }}>{t}</div>
          <div style={{ fontSize: 14, color: EX.inkMuted, lineHeight: 1.55, marginTop: 4, maxWidth: "72ch" }}>{d}</div>
        </div>
      ))}
      <p style={{ fontSize: 14, color: EX.inkMuted, lineHeight: 1.6, marginTop: 18, maxWidth: "72ch" }}>
        Threats to validity are stated in full in the manuscript: single dataset, single
        model-sampling seed, a head-to-head resting on {h2h?.n_common ?? 29} commonly-scored
        contracts, and label noise in the safe class — a manual review of 20 blocked safe contracts
        found roughly 70% to be genuine tool errors and a small tail that may be real unreported
        bugs, making our false-alarm rate an upper bound.
      </p>
    </Section>
  );
}

/* ─── status ───────────────────────────────────────────────────────── */

function Status() {
  const done = [
    "Abstract, introduction, method",
    "Evaluation §4.1–4.10 at n=233",
    "Threats to validity and limitations",
    "Reproduction instructions and released artifact",
  ];
  const open: [string, string][] = [
    ["Related work", "Nine surveyed papers from the Oct 2025 literature review need positioning against each contribution. The one blocking item."],
    ["Multi-seed", "Data-split variance is covered by 10 partitions; model-sampling variance across seeds is partially complete."],
    ["Bucket 04 (Web3Bugs)", "Real Code4rena audit contests — the semantic-bug set. Running now; full coverage is a multi-day job."],
  ];
  return (
    <Section n="S" kicker="Manuscript status" tint title="Where the paper stands.">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 44 }}>
        <div>
          <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: ".12em", color: EX.inkMuted, marginBottom: 12 }}>WRITTEN</div>
          {done.map((d) => (
            <div key={d} style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: `1px solid ${EX.hairline}`, fontSize: 14.5 }}>
              <span style={{ fontFamily: MONO, color: EX.ink }}>■</span>{d}
            </div>
          ))}
        </div>
        <div>
          <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: ".12em", color: EX.signal, marginBottom: 12 }}>OUTSTANDING</div>
          {open.map(([t, d]) => (
            <div key={t} style={{ padding: "8px 0", borderBottom: `1px solid ${EX.hairline}` }}>
              <div style={{ display: "flex", gap: 10, fontSize: 14.5 }}>
                <span style={{ fontFamily: MONO, color: EX.signal }}>□</span>{t}
              </div>
              <div style={{ fontSize: 13, color: EX.inkMuted, lineHeight: 1.5, marginTop: 3, marginLeft: 22 }}>{d}</div>
            </div>
          ))}
        </div>
      </div>
      <p style={{ fontFamily: SERIF, fontSize: 17, lineHeight: 1.6, marginTop: 30, maxWidth: "70ch" }}>
        The evidence base is complete and reproducible. What remains is the related-work survey and
        a final pass, after which the manuscript is submission-ready. Acceptance is a review cycle
        measured in months and outside anyone&rsquo;s control, so we describe this as{" "}
        <em>submission-ready</em>, never as published.
      </p>
    </Section>
  );
}

function Colophon() {
  return (
    <footer style={{ borderTop: `1px solid ${EX.hairline}`, padding: "30px 0 54px" }}>
      <Wrap>
        <div style={{ fontFamily: MONO, fontSize: 11, color: EX.slate, lineHeight: 1.9 }}>
          <div>CAPSTONE TEAM 2 · PESU · 2025—2026 · UMAR, ANVITA, LAKSHITHA, TARUN</div>
          <div>
            Every figure is measured on {shipped?.n ?? 233} contracts and reproducible from
            checkpoints in the repository. Nothing is estimated.
          </div>
        </div>
      </Wrap>
    </footer>
  );
}
