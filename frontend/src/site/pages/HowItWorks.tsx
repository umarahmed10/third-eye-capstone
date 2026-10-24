import { C, F, S } from "../design";
import { Badge, Card, Caveat, Grid, P, Section, Table } from "../ui";
import { SPECIALISTS } from "../facts";

const STAGES = [
  {
    n: "01",
    name: "Static pre-pass",
    what: "Slither runs if it is installed, and a lightweight feature extractor always does — payable functions, low-level calls, delegatecall, loops over dynamic arrays, assembly blocks.",
    why: "Its job is not to find the bug. It is to tell the router what kind of contract this is, cheaply, before any model is loaded.",
  },
  {
    n: "02",
    name: "Router",
    what: "Selects which of the 8 specialists to run, from the static signals and code features. A contract with no external call does not get the reentrancy specialist.",
    why: "Firing all 8 at every contract made safe code fail: each specialist is an independent chance to raise a flag, so the false-alarm rate compounds. This is the single biggest lever on precision — see the findings page.",
  },
  {
    n: "03",
    name: "Model-diverse council",
    what: "Each selected specialist is a separate prompt to a model chosen for that role, across three distinct model families running locally on Ollama.",
    why: "Different families fail differently. One model asked eight questions correlates its own mistakes; three families asked one question each do not.",
  },
  {
    n: "04",
    name: "Evidence gate",
    what: "A finding survives only if the specialist set found = true, returned a confidence of at least 0.6, AND quoted a line that appears verbatim in the submitted source.",
    why: "This is the anti-hallucination step. A model that invents a vulnerable line cannot produce a quote that matches the file, so the claim is dropped before it reaches you.",
  },
  {
    n: "05",
    name: "Risk pooling",
    what: "Surviving findings are combined with a noisy-OR: risk = 1 − Π(1 − confidence). The verdict is NO-GO when risk ≥ τ = 0.925.",
    why: "A single medium-confidence finding should not block a deploy, and five should. τ was re-selected identically in 8 of 10 random dev splits, so it is an operating point rather than one lucky partition.",
  },
  {
    n: "06",
    name: "Verdict",
    what: "GO, NO-GO, or INCONCLUSIVE — with the quotes, the per-specialist health, and the reason attached.",
    why: "INCONCLUSIVE exists so a broken run cannot masquerade as a clean one. If more than half the specialists that ran errored, you get INCONCLUSIVE, never a green GO.",
  },
];

export function HowItWorks() {
  return (
    <div style={S.page}>
      <div style={{ paddingTop: 44 }}>
        <div style={S.eyebrow}>How it works</div>
        <h1 style={S.h1}>Six stages, and one rule that matters</h1>
        <P>
          ThirdEye is not a model with a security prompt. It is a pipeline whose
          design is mostly about <em>not</em> raising findings: a router that
          declines to ask irrelevant questions, a gate that throws away any claim
          without a verbatim quote, and a verdict rule that needs more than one
          weak signal before it blocks a deploy.
        </P>
      </div>

      <Section title="The pipeline">
        <div style={{ display: "grid", gap: 12 }}>
          {STAGES.map((s) => (
            <Card key={s.n}>
              <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                <div
                  style={{
                    fontFamily: F.mono,
                    fontSize: 13,
                    color: C.accent,
                    paddingTop: 2,
                    flexShrink: 0,
                  }}
                >
                  {s.n}
                </div>
                <div>
                  <div style={S.h3}>{s.name}</div>
                  <P style={{ margin: "0 0 10px", fontSize: 14.5 }}>{s.what}</P>
                  <div
                    style={{
                      borderLeft: `2px solid ${C.lineHi}`,
                      paddingLeft: 12,
                      fontFamily: F.sans,
                      fontSize: 13.5,
                      lineHeight: 1.6,
                      color: C.inkDim,
                      maxWidth: "64ch",
                    }}
                  >
                    {s.why}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </Section>

      <Section title="The eight specialists">
        <P>
          Each covers one DASP-10 class and is asked exactly one question. The
          model assignment is by role, not by convenience — the code-reading
          roles go to a code-tuned model, the judgement roles to a general
          reasoner.
        </P>
        <Table
          head={["Specialist", "Model family", "Local model"]}
          rows={SPECIALISTS.map((s) => [
            s.label,
            s.model.startsWith("qwen")
              ? "qwen (code)"
              : s.model.startsWith("llama")
                ? "llama (general)"
                : "gemma (general)",
            <code style={{ fontFamily: F.mono, fontSize: 12.5 }}>{s.model}</code>,
          ])}
        />
        <Caveat title="On model diversity">
          Three families, not three model names. Running the same model under
          three aliases would give the appearance of a council and none of the
          benefit, because correlated models make correlated mistakes and the
          aggregation assumes they do not.
        </Caveat>
      </Section>

      <Section title="Why it runs on your machine">
        <Grid min={260}>
          <Card>
            <div style={S.h3}>The source never leaves</div>
            <P style={{ fontSize: 14, margin: 0 }}>
              You are handing an auditor unreleased, often proprietary code. A
              security tool that ships that to a third-party inference API by
              default has the wrong default, independent of cost.
            </P>
          </Card>
          <Card>
            <div style={S.h3}>No key, no quota, no bill</div>
            <P style={{ fontSize: 14, margin: 0 }}>
              Ollama, three small models, zero configuration beyond pulling
              them. A scan costs electricity.
            </P>
          </Card>
          <Card>
            <div style={S.h3}>Reproducible by anyone</div>
            <P style={{ fontSize: 14, margin: 0 }}>
              Hosted models change under you without a version bump. Pinned
              local models are the only way the numbers on this site can be
              re-derived next year.
            </P>
          </Card>
        </Grid>
        <div style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Badge>local-only by default</Badge>
          <Badge>cloud providers gated behind an explicit flag</Badge>
          <Badge>arbitration off by default</Badge>
        </div>
      </Section>

      <Section title="What the verdict does not mean">
        <Caveat title="GO is not a safety certificate">
          A GO means no specialist that ran could quote a line supporting a
          finding above the confidence bar. On the benchmark the tool misses
          roughly 11% of genuinely vulnerable contracts at the shipped setting.
          It is a filter that catches most things cheaply and locally — not a
          replacement for an audit.
        </Caveat>
        <Caveat title="NO-GO is not proof of a bug">
          At the shipped setting it raises a false alarm on 45.9% of safe
          contracts. Every finding is shown with the quote it rests on
          specifically so you can dismiss it in seconds when it is wrong.
        </Caveat>
      </Section>
    </div>
  );
}
