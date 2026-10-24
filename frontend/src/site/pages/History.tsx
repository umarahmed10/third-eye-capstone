import { useState } from "react";
import { C, F, S } from "../design";
import { Badge, Card, Caveat, P, Section, Stat } from "../ui";
import HISTORY from "../history.json";

type Commit = {
  sha: string;
  date: string;
  subject: string;
  kind: string;
  milestone: string | null;
};

type Month = {
  month: string;
  n: number;
  kinds: Record<string, number>;
  milestones: { sha: string; date: string; label: string }[];
};

const KIND_COLOR: Record<string, string> = {
  integrity: C.nogo,
  evaluation: C.accent,
  writing: C.inkDim,
  fix: C.sev.high,
  feature: C.go,
  testing: C.sev.medium,
  maintenance: C.lineHi,
  other: C.lineHi,
};

const MONTH_NOTE: Record<string, string> = {
  "2026-05": "Scaffold. A full-stack auditor that called one model and believed it.",
  "2026-06": "First real benchmark attempt — and the discovery that a corpus of only vulnerable contracts cannot measure precision.",
  "2026-07": "The router lands. Firing all eight specialists at every contract had made safe code fail almost universally.",
  "2026-08": "The heavy month: model diversity, the evidence gate, the arbitration stage, and the first large evaluation runs.",
  "2026-09": "Scale-up and the first honest reckoning — figures from a partial replay turn out to be optimistic.",
  "2026-10": "Integrity work. Most of this month was spent finding ways our own measurements had been lying, and fixing them.",
};

export function History() {
  const [open, setOpen] = useState<string | null>(null);
  // TypeScript infers a literal union for every month's `kinds` object from
  // the JSON, so a month that happens to lack "feature" is typed with
  // `feature?: undefined` and will not widen to Record<string, number>.
  // Casting through unknown is correct here rather than lax: the shape is
  // guaranteed by scripts/build_history.py, which is the only writer.
  const months = HISTORY.months as unknown as Month[];
  const commits = HISTORY.commits as unknown as Commit[];

  return (
    <div style={S.page}>
      <div style={{ paddingTop: 44 }}>
        <div style={S.eyebrow}>Project history</div>
        <h1 style={S.h1}>Every iteration, as it happened</h1>
        <P>
          Generated directly from the git log rather than written from memory —
          a hand-authored timeline drifts from the record, which is the exact
          failure mode this project is about. {HISTORY.total} commits, from{" "}
          {HISTORY.first_commit} to {HISTORY.last_commit}.
        </P>
      </div>

      <Section>
        <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
          <Stat value={String(HISTORY.total)} label="Commits" sub={`${HISTORY.first_commit} → ${HISTORY.last_commit}`} />
          <Stat value={String(months.length)} label="Months of work" />
          <Stat
            value={String(commits.filter((c) => c.kind === "evaluation").length)}
            label="Evaluation commits"
            sub="benchmarks, ablations, validation"
          />
          <Stat
            value={String(commits.filter((c) => c.kind === "integrity").length)}
            label="Integrity fixes"
            sub="defects in our own measurement"
            tone={C.nogo}
          />
        </div>
      </Section>

      <Section title="Turning points">
        <div style={{ display: "grid", gap: 10 }}>
          {months
            .flatMap((m) => m.milestones)
            .map((ms) => (
              <Card key={ms.sha}>
                <div style={{ display: "flex", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
                  <span style={{ fontFamily: F.mono, fontSize: 12, color: C.accent }}>
                    {ms.date}
                  </span>
                  <span style={{ fontSize: 14.5, color: C.ink }}>{ms.label}</span>
                  <code
                    style={{
                      marginLeft: "auto",
                      fontFamily: F.mono,
                      fontSize: 11.5,
                      color: C.inkDim,
                    }}
                  >
                    {ms.sha}
                  </code>
                </div>
              </Card>
            ))}
        </div>
      </Section>

      <Section title="Month by month">
        <P>
          Bar width is commit count; colour is the kind of work. Click a month
          to read every commit in it.
        </P>
        <div style={{ display: "grid", gap: 10 }}>
          {months.map((m) => {
            const isOpen = open === m.month;
            const max = Math.max(...months.map((x) => x.n));
            return (
              <div key={m.month}>
                <button
                  onClick={() => setOpen(isOpen ? null : m.month)}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    background: isOpen ? C.panelHi : C.panel,
                    border: `1px solid ${isOpen ? C.accentDim : C.line}`,
                    borderRadius: 9,
                    padding: "14px 16px",
                    cursor: "pointer",
                    color: C.ink,
                    font: "inherit",
                  }}
                >
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <span style={{ fontFamily: F.mono, fontSize: 13, color: C.ink, width: 66 }}>
                      {m.month}
                    </span>
                    <span
                      style={{
                        fontFamily: F.mono,
                        fontSize: 12,
                        color: C.inkDim,
                        width: 34,
                        textAlign: "right",
                      }}
                    >
                      {m.n}
                    </span>
                    {/* stacked bar by kind */}
                    <span
                      style={{
                        flex: 1,
                        display: "flex",
                        height: 12,
                        borderRadius: 3,
                        overflow: "hidden",
                        background: C.bgAlt,
                        maxWidth: `${(m.n / max) * 100}%`,
                      }}
                    >
                      {Object.entries(m.kinds).map(([k, n]) => (
                        <span
                          key={k}
                          title={`${k}: ${n}`}
                          style={{
                            width: `${(n / m.n) * 100}%`,
                            background: KIND_COLOR[k] || C.lineHi,
                          }}
                        />
                      ))}
                    </span>
                    <span style={{ fontFamily: F.mono, fontSize: 11, color: C.inkDim }}>
                      {isOpen ? "−" : "+"}
                    </span>
                  </div>
                  <P style={{ margin: "9px 0 0 112px", fontSize: 13.5, maxWidth: "70ch" }}>
                    {MONTH_NOTE[m.month] || ""}
                  </P>
                </button>

                {isOpen && (
                  <div
                    style={{
                      border: `1px solid ${C.line}`,
                      borderTop: "none",
                      borderRadius: "0 0 9px 9px",
                      background: C.bgAlt,
                      padding: "10px 16px",
                      display: "grid",
                      gap: 5,
                    }}
                  >
                    {commits
                      .filter((c) => c.date.startsWith(m.month))
                      .map((c) => (
                        <div
                          key={c.sha}
                          style={{ display: "flex", gap: 10, alignItems: "baseline" }}
                        >
                          <code style={{ fontFamily: F.mono, fontSize: 11, color: C.inkDim, flexShrink: 0 }}>
                            {c.date}
                          </code>
                          <span
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: 99,
                              background: KIND_COLOR[c.kind] || C.lineHi,
                              flexShrink: 0,
                            }}
                          />
                          <span
                            style={{
                              fontFamily: F.sans,
                              fontSize: 13,
                              color: C.inkMid,
                              lineHeight: 1.5,
                            }}
                          >
                            {c.subject}
                          </span>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16 }}>
          {Object.entries(KIND_COLOR).map(([k, col]) => (
            <Badge key={k} fg={col} bg={`${col}1A`}>
              {k}
            </Badge>
          ))}
        </div>
      </Section>

      <Section title="A correction about the timeline">
        <Caveat title="This project did not start in 2025">
          The first commit is {HISTORY.first_commit}. The work runs roughly six
          months, not fifteen, and this page is generated from the log precisely
          so that the span cannot be overstated by someone reconstructing it
          later — including us.
        </Caveat>
      </Section>
    </div>
  );
}
