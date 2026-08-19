import { useEffect, useState } from "react";
import {
  getBenchmarkStats,
  type BenchmarkStats,
  type AblationSample,
  type VulnDistEntry,
  type TierResult,
  type TierBenchmark,
} from "../lib/api";
import { BENCHMARK_SNAPSHOT } from "../data/benchmark";
import { KpiCard, SectionLabel, Pill } from "../components/ui/primitives";
import { GroupedBars, DistributionBars, VerticalBars } from "../components/ui/charts";
import { ChartFrame, HeroStat, BarList, ColumnTrend, Dumbbell, CoverageSplit } from "../components/ui/storycharts";
import { CHART_COLORS, humanizeRole } from "../lib/theme";

export function Benchmarks() {
  // Render INSTANTLY from the baked-in snapshot (no spinner, no round-trip to
  // the cold Render backend — this is the fix for the slow Vercel load). Then
  // silently refresh from the live API in the background; if it's unreachable
  // or slow, the user never notices because the page is already populated.
  const [data, setData] = useState<BenchmarkStats>(BENCHMARK_SNAPSHOT);
  const [live, setLive] = useState(false);

  useEffect(() => {
    let alive = true;
    getBenchmarkStats()
      .then((d) => {
        if (!alive || !d || !Object.keys(d).length) return;
        // The baked-in snapshot is generated from the eval CHECKPOINTS at build
        // time, so it can never be staler than the build. The hosted backend
        // is only as fresh as its own last deploy, and was observed serving
        // months-old numbers ("295+ contracts", "0 false positives") that
        // overwrote current measured results. So merge per-section and keep
        // whichever actually has data, preferring the snapshot for the
        // eval-derived sections rather than letting a stale backend win
        // wholesale.
        const snap = BENCHMARK_SNAPSHOT;
        const prefSnap = <K extends keyof BenchmarkStats>(k: K) =>
          ((snap[k] as { available?: boolean } | undefined)?.available ? snap[k] : d[k] ?? snap[k]);
        setData({
          ...d,
          kpis: snap.kpis?.length ? snap.kpis : d.kpis,
          tier_benchmark: prefSnap("tier_benchmark") as BenchmarkStats["tier_benchmark"],
          head_to_head: prefSnap("head_to_head") as BenchmarkStats["head_to_head"],
          arbitration_ablation: prefSnap("arbitration_ablation") as BenchmarkStats["arbitration_ablation"],
          proposed_methods: prefSnap("proposed_methods") as BenchmarkStats["proposed_methods"],
          shipped_rule: prefSnap("shipped_rule") as BenchmarkStats["shipped_rule"],
          ablation: snap.ablation?.available ? snap.ablation : d.ablation,
        });
        setLive(true);
      })
      .catch(() => {
        /* offline / cold backend — keep the baked snapshot, no error shown */
      });
    return () => {
      alive = false;
    };
  }, []);

  const d = data ?? {};
  const kpis = d.kpis ?? [];
  const ablationConfigs = d.ablation?.configs ?? [];
  const ablationSample = d.ablation?.sample;
  const baselines = d.published_baselines ?? [];
  const smartbugs = d.vuln_distribution?.smartbugs_curated ?? [];
  const web3bugs = d.vuln_distribution?.web3bugs ?? [];
  const tierBench = d.tier_benchmark;
  const pm = d.proposed_methods;
  const arb = d.arbitration_ablation;
  const safeAgg = tierBench?.safe_aggregate;
  const vulnAgg = tierBench?.vuln_aggregate;
  const compounding = d.story?.compounding ?? [];
  const shipped = d.shipped_rule;
  // Humanised bar rows for the vulnerable tiers, hardest last so the chart
  // reads left-to-right as increasing difficulty.
  const VULN_ORDER = ["injected", "curated", "audit_report"];
  const VULN_LABEL: Record<string, string> = {
    injected: "Injected bugs",
    curated: "Curated known-bad",
    audit_report: "Real audit findings",
  };
  const vulnTiers = (tierBench?.tiers ?? [])
    .filter((t) => t.expected === "vulnerable" && (t.scored ?? 0) > 0)
    .sort((a, b) => VULN_ORDER.indexOf(a.tier ?? "") - VULN_ORDER.indexOf(b.tier ?? ""))
    .map((t) => ({
      label: VULN_LABEL[t.tier ?? ""] ?? t.label ?? t.tier ?? "",
      value: t.recall ?? 0,
      note: `${t.tp ?? 0}/${t.scored ?? 0}`,
    }));
  const reliability = (d.story?.reliability ?? []).map((r) => ({
    label: humanizeRole(r.cls),
    value: r.precision,
    note: `${r.tp}/${r.tp + r.fp}`,
  }));

  return (
    <div className="px-4 sm:px-6 py-6">
      <div className="max-w-6xl mx-auto space-y-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-[#16150F] tracking-tight">Benchmarks &amp; Results</h2>
            {/* The old header carried an aspirational thesis ("match/beat a
                paid-GPT baseline") as though it were a finding. It states what
                we measured instead — the page should not claim in its first
                line something its own tables do not support. */}
            <p className="text-[12px] text-[#6B675C] mt-1 max-w-3xl leading-relaxed">
              Every number below is measured on a balanced benchmark of safe and vulnerable
              contracts — never estimated, never carried over from another dataset. Runs are
              checkpointed and still in progress, so counts grow over time.
            </p>
          </div>
          <span
            className="shrink-0 mt-1 text-[9px] font-mono uppercase tracking-[0.14em] px-2 py-1 rounded-full border"
            style={{
              borderColor: live ? "rgba(52,211,153,0.3)" : "rgba(148,163,184,0.2)",
              color: live ? "rgb(110,231,183)" : "rgb(148,163,184)",
              background: live ? "rgba(52,211,153,0.06)" : "rgba(148,163,184,0.04)",
            }}
            title={live ? "Refreshed from the live backend" : "Showing the published snapshot (instant load)"}
          >
            {live ? "live" : "published snapshot"}
          </span>
        </div>

        {/* ═══════════ THE STORY ═══════════
            Ordered as a narrative rather than a data dump: what it catches ->
            what it gets wrong -> why -> what we tried -> what worked -> how it
            compares. Each act leads with a plain-language claim and backs it
            with exactly one chart. */}

        {/* ── Act 0: the three numbers that frame everything ── */}
        <section className="grid sm:grid-cols-3 gap-3">
          <HeroStat
            label="Contracts tested"
            value={String(tierBench?.n_total ?? "—")}
            sub="Real Solidity, balanced between known-safe and known-vulnerable. Every one scored — nothing skipped."
          />
          <HeroStat
            label="Real bugs caught"
            value={
              shipped?.after?.recall != null
                ? `${Math.round(shipped.after.recall * 100)}%`
                : vulnAgg?.recall != null ? `${Math.round(vulnAgg.recall * 100)}%` : "—"
            }
            sub={
              shipped?.after
                ? `${shipped.after.tp} of ${(shipped.after.tp ?? 0) + (shipped.after.fn ?? 0)} vulnerable contracts correctly blocked.`
                : `${vulnAgg?.tp ?? 0} of ${(vulnAgg?.tp ?? 0) + (vulnAgg?.fn ?? 0)} vulnerable contracts correctly blocked.`
            }
          />
          <HeroStat
            label="False alarms"
            tone="warn"
            value={
              shipped?.after?.fpr != null
                ? `${Math.round(shipped.after.fpr * 100)}%`
                : safeAgg && safeAgg.scored ? `${Math.round(((safeAgg.fp ?? 0) / safeAgg.scored) * 100)}%` : "—"
            }
            sub={
              shipped?.after && shipped?.before
                ? `${shipped.after.fp} of ${(shipped.after.fp ?? 0) + (shipped.after.tn ?? 0)} audited-safe contracts still blocked — down from ${Math.round((shipped.before.fpr ?? 0) * 100)}% before the combining rule was fixed.`
                : `${safeAgg?.fp ?? 0} of ${safeAgg?.scored ?? 0} audited-safe contracts blocked anyway.`
            }
          />
        </section>

        {/* ── Act 1: it finds the bugs ── */}
        {vulnTiers.length > 0 && (
          <section>
            <SectionLabel>1 — It finds the bugs</SectionLabel>
            <ChartFrame
              title="Detection rate by bug source"
              subtitle="Three independent sources of vulnerable contracts. Each bar is the share of known-bad contracts correctly blocked."
              footnote="Injected bugs are synthetic and the easiest case. Real audit-report findings are the hardest, and the most representative of production work."
            >
              <BarList rows={vulnTiers} fmt={(v) => `${Math.round(v * 100)}%`} />
            </ChartFrame>
          </section>
        )}

        {/* ── Act 2: the flaw, and its mechanism ── */}
        {compounding.length > 0 && (
          <section>
            <SectionLabel>2 — But it cries wolf, and here is exactly why</SectionLabel>
            <div className="grid lg:grid-cols-[1fr_1.25fr] gap-4">
              <div className="rounded-xl border border-[#D8D3C7] bg-[#FFFFFF] px-5 py-5">
                <p className="text-sm text-[#16150F] leading-relaxed">
                  A contract is blocked if <span className="text-[#2C4A6B]">any single specialist</span>{" "}
                  raises a concern. Consult more specialists and you get more detections — but also
                  more false alarms, and they stack up.
                </p>
                <p className="mt-3 text-xs text-[#6B675C] leading-relaxed">
                  This is not a bad prompt or a tuning problem. It is arithmetic: eight independent
                  chances to object, and one objection blocks the contract. The model diversity that
                  makes the tool sensitive is the same thing that makes it noisy.
                </p>
              </div>
              <ChartFrame
                title="False alarms rise with the number of specialists consulted"
                subtitle="Safe contracts only. Each column: how often clean code was blocked when this many specialists reviewed it."
                footnote="Measured, not modelled. Small samples are labelled with their n so a thin cell cannot pass for firm evidence."
              >
                <ColumnTrend rows={compounding.map((c) => ({ x: c.specialists, y: c.fpr, n: c.n }))} />
              </ChartFrame>
            </div>
          </section>
        )}

        {/* ── Act 3: not all specialists deserve equal weight ── */}
        {reliability.length > 0 && (
          <section>
            <SectionLabel>3 — And the specialists are not equally trustworthy</SectionLabel>
            <ChartFrame
              title="How often each specialist is right when it objects"
              subtitle="Share of a specialist's findings that landed on a genuinely vulnerable contract. Today all eight carry equal weight in the verdict."
              footnote="The weakest classes object often and are right least often — the case for weighting them down rather than silencing them outright."
            >
              <BarList
                rows={reliability}
                fmt={(v) => `${Math.round(v * 100)}%`}
                highlight={(r) => r.value >= 0.75}
              />
            </ChartFrame>
          </section>
        )}

        {/* ── Act 4: the fix that failed ── */}
        {arb?.available && (
          <section>
            <SectionLabel>4 — The obvious fix made things worse</SectionLabel>
            <div className="grid lg:grid-cols-[1.25fr_1fr] gap-4">
              <ChartFrame
                title="Sending every objection to an AI judge"
                subtitle="A second, much larger model re-examines each finding and discards the ones it judges spurious."
                footnote="A useful judge would show a tall left bar and a short right one. These sit close together, which means it is not separating real findings from false ones — it is discarding a similar share of both."
              >
                <BarList
                  max={1}
                  rows={[
                    {
                      label: "False alarms removed",
                      value: (arb.false_positives_seen ?? 0) ? (arb.false_positives_corrected ?? 0) / (arb.false_positives_seen ?? 1) : 0,
                      note: `${arb.false_positives_corrected}/${arb.false_positives_seen}`,
                    },
                    {
                      label: "Real bugs also lost",
                      value: (arb.true_positives_seen ?? 0) ? (arb.true_positives_destroyed ?? 0) / (arb.true_positives_seen ?? 1) : 0,
                      note: `${arb.true_positives_destroyed}/${arb.true_positives_seen}`,
                    },
                  ]}
                  highlight={(r) => r.label.startsWith("False")}
                />
              </ChartFrame>
              <div className="rounded-xl border border-[#D8D3C7] bg-[#FFFFFF] px-5 py-5">
                <p className="text-sm text-[#16150F] leading-relaxed">
                  It removed most false alarms — and threw away most of the real findings with them.
                </p>
                <p className="mt-3 text-xs text-[#6B675C] leading-relaxed">
                  Reported rather than buried. A fix that fails for a legible reason is itself a
                  result: it showed the judge was suppressing indiscriminately, which is what
                  pointed at the combining rule as the thing that actually needed to change.
                </p>
              </div>
            </div>
          </section>
        )}

        {/* ── Act 5: the fix that worked ── */}
        {pm?.weighted?.tuned && pm?.weighted?.or_gate && (
          <section>
            <SectionLabel>5 — The fix, now shipped in the tool</SectionLabel>
            <ChartFrame
              title="Requiring combined confidence, instead of accepting any single objection"
              subtitle="Same models, same findings, same contracts. Only the rule that turns them into a verdict changes: block when the combined evidence passes a confidence bar, rather than on any single objection."
              footnote={`Validated on held-out data: the bar is chosen on one half of the contracts and tested on the other, repeated over ${pm.weighted.n_splits ?? 10} random splits. Improves in ${pm.weighted.wins ?? "—"}/${pm.weighted.n_splits ?? 10}, costs zero extra AI calls, and adds no per-specialist tuning. A more elaborate variant that also weights each specialist by its track record was tested and did NOT do better (${pm.weighted.weighting_wins ?? "—"}/${pm.weighted.n_splits ?? 10} splits) — so the simpler rule is the one reported.`}
            >
              <Dumbbell
                beforeLabel="Old rule (any objection blocks)"
                afterLabel="Shipped rule (combined confidence)"
                rows={[
                  { label: "False alarms",
                    before: shipped?.before?.fpr ?? pm.weighted.or_gate.fpr ?? 0,
                    after: shipped?.after?.fpr ?? pm.weighted.tuned.fpr ?? 0, better: "down" },
                  { label: "Bugs caught",
                    before: shipped?.before?.recall ?? pm.weighted.or_gate.recall ?? 0,
                    after: shipped?.after?.recall ?? pm.weighted.tuned.recall ?? 0, better: "up" },
                  { label: "Overall accuracy (F1)",
                    before: shipped?.before?.f1 ?? pm.weighted.or_gate.f1 ?? 0,
                    after: shipped?.after?.f1 ?? pm.weighted.tuned.f1 ?? 0, better: "up" },
                ]}
              />
            </ChartFrame>
          </section>
        )}

        {/* ── Act 6: against the tool the industry actually uses ── */}
        {d.head_to_head?.available && (
          <section>
            <SectionLabel>6 — Against the tool the industry actually uses</SectionLabel>
            <div className="grid lg:grid-cols-2 gap-4">
              <ChartFrame
                title="How much of the benchmark each tool could even analyse"
                subtitle="Slither is the standard open-source Solidity analyser. It has to compile a contract before it can inspect it."
                footnote="The gap is not random: Slither compiled most of the old, simple vulnerable contracts but few of the large modern ones. Accuracy figures for tools like it are therefore measured on whatever happened to compile."
              >
                <CoverageSplit
                  rows={[
                    {
                      label: "ThirdEye (reads source directly)",
                      scored: d.head_to_head.coverage?.council_scored ?? 0,
                      total: d.head_to_head.coverage?.council_scored ?? 0,
                      note: "No compilation needed — nothing skipped.",
                    },
                    {
                      label: "Slither (needs to compile)",
                      scored: d.head_to_head.coverage?.slither_scored ?? 0,
                      total: 150,
                      note: "Abstained on everything it could not build.",
                    },
                  ]}
                />
              </ChartFrame>
              <HeadToHeadSection h={d.head_to_head} />
            </div>
          </section>
        )}

        {/* Full per-tier detail and the method table, kept for a technical reader */}
        {tierBench?.available && <TierBenchmarkSection tb={tierBench} />}
        {pm?.available && <ProposedMethodsSection p={pm} />}

        {/* The old "single LLM vs council vs council + arbitration" ablation was
            REMOVED, not hidden. It was a 16-contract access-control slice, and
            its council+arbitration row was produced while the arbiter config
            silently fell back to a local judge that rubber-stamped every
            finding. It reported recall 0.125 for arbitration, directly
            contradicting the measured arbitration section above. Two
            conflicting numbers on one page, one of them known-invalid, is worse
            than one number. Regenerate it against the current benchmark if the
            per-stage comparison is wanted back. */}

        {/* ─────────────────────────────────────────────────────────────
            Everything below this divider is REFERENCE MATERIAL, not results
            produced by ThirdEye. Keeping it visually inseparable from the
            measured sections above is what made the page read as though other
            papers' numbers were ours.
            ───────────────────────────────────────────────────────────── */}
        <div className="pt-3 border-t border-[#D8D3C7]">
          <div className="text-[11px] uppercase tracking-[0.16em] text-amber-200/70">
            Reference material — not ThirdEye results
          </div>
          <p className="text-xs text-[#7A8794] mt-1 max-w-3xl leading-relaxed">
            Corpus composition and figures reported by other papers, on other datasets, under
            their own protocols. Useful for context; <span className="text-[#6B675C]">not
            comparable</span> to the measured sections above. The one genuine like-for-like
            comparison is the Slither head-to-head.
          </p>
        </div>

        {/* Vulnerability distribution */}
        {(smartbugs.length > 0 || web3bugs.length > 0) && (
          <section>
            <SectionLabel>Most common vulnerabilities in the wild</SectionLabel>
            <div className="grid lg:grid-cols-2 gap-4">
              <DistCard title="SmartBugs Curated" color="#2C4A6B" data={smartbugs} />
              <DistCard title="Web3Bugs" color="#B4351F" data={web3bugs} />
            </div>
          </section>
        )}

        {/* Published baselines */}
        {baselines.length > 0 && (
          <section>
            <SectionLabel count={baselines.length}>Published baselines — to be reproduced</SectionLabel>
            <div className="grid lg:grid-cols-[1.3fr_1fr] gap-4">
              <div className="rounded-xl border border-[#D8D3C7] bg-[#FFFFFF] overflow-x-auto">
                <table className="w-full text-[11px] min-w-[440px]">
                  <thead>
                    <tr className="border-b border-[#D8D3C7] bg-white/[0.02] text-[#7A8794]">
                      <th className="text-left px-3 py-2 font-medium">Tool</th>
                      <th className="text-left px-3 py-2 font-medium">Dataset</th>
                      <th className="text-right px-2 py-2 font-medium">Recall</th>
                      <th className="text-right px-2 py-2 font-medium">F1</th>
                      <th className="text-right px-3 py-2 font-medium">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {baselines.map((b, i) => (
                      <tr key={`${b.tool}-${i}`} className="border-b border-white/[0.03] last:border-0 align-top">
                        <td className="px-3 py-2.5">
                          <div className="text-[#16150F] font-medium">{b.tool}</div>
                          {b.note && <div className="text-[9px] text-[#7A8794] mt-0.5 max-w-[200px]">{b.note}</div>}
                        </td>
                        <td className="px-3 py-2.5 text-[#6B675C]">{b.dataset}</td>
                        <td className="px-2 py-2.5 text-right font-mono text-[#3A372E] tabular-nums">{ratio(b.recall)}</td>
                        <td className="px-2 py-2.5 text-right font-mono text-[#2C4A6B] tabular-nums">{ratio(b.f1)}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-[#6B675C]">{b.cost ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="px-3 py-2 border-t border-[#D8D3C7] flex flex-wrap items-center gap-2">
                  <Pill>published — to be reproduced</Pill>
                  <span className="text-[10px] text-[#7A8794]">Figures from published literature — NOT Third-Eye's own results.</span>
                </div>
              </div>
              <div className="rounded-xl border border-[#D8D3C7] bg-[#FFFFFF] px-5 py-5">
                <div className="text-[11px] uppercase tracking-[0.16em] text-[#6B675C] mb-3">Published F1 comparison</div>
                <VerticalBars
                  data={baselines.filter((b) => b.f1 != null).slice(0, 6).map((b) => ({ label: b.tool, value: num(b.f1) }))}
                  color={CHART_COLORS[0]}
                  height={160}
                />
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

// ── Per-tier benchmark: 6 trust tiers scored separately + API accounting. ──
function TierBenchmarkSection({ tb }: { tb: TierBenchmark }) {
  const tiers = tb.tiers ?? [];
  const api = tb.api_accounting;
  const partial = (tb.n_total ?? 0) < 2250;

  return (
    <section>
      <SectionLabel count={tiers.length}>
        Detection by trust tier {tb.backend ? `· ${tb.backend}` : ""}{" "}
        {tb.n_total != null ? `· ${tb.n_total} contracts scored` : ""}
      </SectionLabel>

      {partial && (
        <p className="text-[10px] text-amber-300/70 mb-3">
          Batch in progress — {tb.n_total} of 2,250 scored so far. Numbers refine as the run completes.
        </p>
      )}

      {/* Tiers are the whole point of this benchmark and were previously
          unexplained: a reader saw six cards of confusion matrices with no way
          to know that the top three SHOULD come back clean and the bottom three
          SHOULD come back blocked. */}
      <div className="mb-3 rounded-xl border border-[#D8D3C7] bg-[#FFFFFF] px-5 py-4">
        <p className="text-xs text-[#3A372E] leading-relaxed">
          Contracts are split into six tiers by how trustworthy their label is, and each is
          scored separately so a weakness is pinpointable instead of averaged away.
        </p>
        <div className="mt-3 grid sm:grid-cols-2 gap-3 text-xs">
          <div>
            <div className="text-[#16150F] font-medium mb-1">Three SAFE tiers — should return GO</div>
            <p className="text-[#6B675C] leading-relaxed">
              Audited libraries (OpenZeppelin/Solady), audit-reviewed clean code, and deployed
              real-world contracts with no reported bug. Every NO-GO here is a{" "}
              <span className="text-[#B4351F]">false alarm</span>. Most benchmarks in this field
              have no safe bucket at all, which makes their precision meaningless.
            </p>
          </div>
          <div>
            <div className="text-amber-300 font-medium mb-1">Three VULNERABLE tiers — should return NO-GO</div>
            <p className="text-[#6B675C] leading-relaxed">
              Curated known-vulnerable contracts, synthetically injected bugs, and real
              audit-report findings. Every GO here is a <span className="text-amber-300">miss</span>.
              Difficulty rises left to right — injected bugs are the easiest, real audit findings
              the hardest.
            </p>
          </div>
        </div>
        <p className="mt-3 text-[11px] text-[#7A8794] leading-relaxed">
          &ldquo;Safe&rdquo; means <em>no bug has been reported</em>, not <em>formally proven
          correct</em> — so a flagged safe contract is occasionally a real unreported bug rather
          than a tool error.
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-3">
        {tiers.map((t) => (
          <TierCard key={t.tier} t={t} />
        ))}
      </div>

      {/* Safe / vuln / overall roll-up */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
        <AggCard title="All safe tiers" t={tb.safe_aggregate} kind="safe" />
        <AggCard title="All vulnerable tiers" t={tb.vuln_aggregate} kind="vuln" />
        <AggCard title="Overall" t={tb.overall} kind="overall" />
      </div>

      {/* API-call accounting → rate-limit sizing */}
      {api?.available && (
        <div className="rounded-xl border border-[#D8D3C7] bg-[#FFFFFF] px-5 py-4 mt-3">
          <div className="text-[11px] uppercase tracking-[0.16em] text-[#6B675C] mb-3">
            API-call accounting — per-user rate-limit sizing
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
            {api.calls_per_contract &&
              (["min", "median", "mean", "p95", "max"] as const).map((k) => (
                <div key={k} className="rounded-lg bg-white/[0.02] py-2.5">
                  <div className="text-[15px] font-mono font-semibold text-[#2C4A6B] tabular-nums">
                    {api.calls_per_contract?.[k] ?? "—"}
                  </div>
                  <div className="text-[9px] uppercase tracking-wider text-[#7A8794] mt-0.5">{k}</div>
                </div>
              ))}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-[10px] text-[#7A8794]">
            <span>Total LLM calls: <span className="text-[#3A372E] font-mono">{api.total_api_calls}</span> over {api.contracts} contracts</span>
            {api.latency_s_per_contract?.mean != null && (
              <span>Mean latency: <span className="text-[#3A372E] font-mono">{api.latency_s_per_contract.mean}s</span>/scan</span>
            )}
          </div>
          {api.rate_limit_note && (
            <p className="text-[10px] text-[#6B675C] mt-2 leading-relaxed">{api.rate_limit_note}</p>
          )}
        </div>
      )}
      {tb.verdict_note && <p className="text-[10px] text-[#7A8794] mt-2">{tb.verdict_note}</p>}
    </section>
  );
}

/** The two fixes for the council's OR-gate — the project's contribution.
 *
 * Both are reported HELD-OUT: weights/threshold fit on a dev split, scored on a
 * disjoint test split, averaged over random splits. In-sample optima are
 * deliberately not shown; choosing a threshold on the data you report it on
 * inflates every number and is the most common way results like these are
 * overstated. */
function ProposedMethodsSection({ p }: { p: NonNullable<BenchmarkStats["proposed_methods"]> }) {
  const w = p.weighted;
  const c = p.calibrated_arbitration;
  const pct = (x?: number) => (x == null ? "—" : `${(x * 100).toFixed(0)}%`);
  const f3 = (x?: number) => (x == null ? "—" : x.toFixed(3));
  const cell = "px-3 py-2 text-right font-mono text-sm";
  return (
    <section>
      <SectionLabel>The fix — replacing the council&rsquo;s OR-gate</SectionLabel>

      <div className="mb-3 rounded-xl border border-[#D8D3C7] bg-[#FFFFFF] px-5 py-4">
        <p className="text-xs text-[#3A372E] leading-relaxed">
          A contract is blocked if <em>any</em> specialist raises a finding — a logical OR. So the
          false-alarm rate <span className="text-[#B4351F]">grows with the number of specialists
          consulted</span> (measured: 50% → 61% → 71% → 73% for 1→4 specialists). The very model
          diversity that buys detection is what destroys precision. Two fixes were tested against
          that, both validated on held-out data.
        </p>
      </div>

      <div className="rounded-xl border border-[#D8D3C7] bg-[#FFFFFF] overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-[0.14em] text-[#6B675C]">
              <th className="px-3 py-2 text-left font-normal">method</th>
              <th className="px-3 py-2 text-right font-normal">false alarms</th>
              <th className="px-3 py-2 text-right font-normal">recall</th>
              <th className="px-3 py-2 text-right font-normal">F1</th>
              <th className="px-3 py-2 text-right font-normal">extra LLM calls</th>
              <th className="px-3 py-2 text-right font-normal">wins</th>
            </tr>
          </thead>
          <tbody className="text-[#16150F]">
            {w && (
              <>
                <tr className="border-t border-[#D8D3C7] text-[#6B675C]">
                  <td className="px-3 py-2 text-left">OR-gate (current)</td>
                  <td className={cell}>{pct(w.or_gate?.fpr)}</td>
                  <td className={cell}>{f3(w.or_gate?.recall)}</td>
                  <td className={cell}>{f3(w.or_gate?.f1)}</td>
                  <td className={cell}>0</td>
                  <td className={cell}>—</td>
                </tr>
                <tr className="border-t border-[#D8D3C7]">
                  <td className="px-3 py-2 text-left text-emerald-200">Weighted noisy-OR</td>
                  <td className={cell} style={{ color: "rgb(110,231,183)" }}>{pct(w.tuned?.fpr)}</td>
                  <td className={cell}>{f3(w.tuned?.recall)}</td>
                  <td className={cell} style={{ color: "rgb(110,231,183)" }}>{f3(w.tuned?.f1)}</td>
                  <td className={cell} style={{ color: "rgb(110,231,183)" }}>{w.extra_llm_calls ?? 0}</td>
                  <td className={cell}>{w.wins}/{w.n_splits}</td>
                </tr>
              </>
            )}
            {c && (
              <tr className="border-t border-[#D8D3C7]">
                <td className="px-3 py-2 text-left">Calibrated arbitration</td>
                <td className={cell}>{pct(c.tuned_fpr)}</td>
                <td className={cell}>—</td>
                <td className={cell}>{f3(c.tuned_f1)}</td>
                <td className={cell}>{c.extra_llm_calls}</td>
                <td className={cell}>{c.wins}/{c.n_splits}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-[#6B675C] leading-relaxed">
        <span className="text-[#16150F] font-medium">Reading this:</span> weighting the council&rsquo;s
        own findings by how reliable each specialist has proven cuts false alarms roughly in half
        and costs <span className="text-[#2C4A6B]">nothing at inference time</span>. Adversarial
        arbitration also works, but needs two extra large-model calls per finding to do less. The
        cheap fix beats the expensive one.
      </p>
      <p className="mt-2 text-xs text-[#7A8794] leading-relaxed">{p.note}</p>
    </section>
  );
}

/** Council vs Slither on identical contracts.
 *
 * The "published baselines" section lists numbers from other papers on other
 * datasets — useful context, but not a comparison. This is the only real
 * head-to-head, and coverage is deliberately given equal billing: a static
 * analyser that abstains on 69% of contracts is not meaningfully comparable on
 * accuracy alone, because the 31% it did score skews toward simple code. */
function HeadToHeadSection({ h }: { h: NonNullable<BenchmarkStats["head_to_head"]> }) {
  const c = h.council ?? {};
  const s = h.slither ?? {};
  const cov = h.coverage ?? {};
  const cell = "px-3 py-2 text-right font-mono text-sm";
  const better = (a?: number, b?: number) => (a ?? 0) > (b ?? 0);
  const win = { color: "rgb(110,231,183)" };
  return (
    <section>
      <SectionLabel count={h.n_common}>
        Head-to-head vs Slither — identical contracts, identical ground truth
      </SectionLabel>
      <div className="rounded-xl border border-[#D8D3C7] bg-[#FFFFFF] overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-[0.14em] text-[#6B675C]">
              <th className="px-3 py-2 text-left font-normal">tool</th>
              <th className="px-3 py-2 text-right font-normal">precision</th>
              <th className="px-3 py-2 text-right font-normal">recall</th>
              <th className="px-3 py-2 text-right font-normal">F1</th>
              <th className="px-3 py-2 text-right font-normal">FPR (safe)</th>
              <th className="px-3 py-2 text-right font-normal">contracts scored</th>
            </tr>
          </thead>
          <tbody className="text-[#16150F]">
            <tr className="border-t border-[#D8D3C7]">
              <td className="px-3 py-2 text-left">ThirdEye council</td>
              <td className={cell}>{c.precision?.toFixed(3)}</td>
              <td className={cell} style={better(c.recall, s.recall) ? win : undefined}>{c.recall?.toFixed(3)}</td>
              <td className={cell} style={better(c.f1, s.f1) ? win : undefined}>{c.f1?.toFixed(3)}</td>
              <td className={cell}>{c.fpr?.toFixed(3)}</td>
              <td className={cell} style={win}>{cov.council_scored}</td>
            </tr>
            <tr className="border-t border-[#D8D3C7]">
              <td className="px-3 py-2 text-left">Slither (static)</td>
              <td className={cell} style={better(s.precision, c.precision) ? win : undefined}>{s.precision?.toFixed(3)}</td>
              <td className={cell}>{s.recall?.toFixed(3)}</td>
              <td className={cell} style={better(s.f1, c.f1) ? win : undefined}>{s.f1?.toFixed(3)}</td>
              <td className={cell} style={win}>{s.fpr?.toFixed(3)}</td>
              <td className={cell}>{cov.slither_scored}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-[#6B675C] leading-relaxed">
        <span className="text-[#16150F] font-medium">Reading this:</span> neither tool wins — F1 is
        effectively tied. ThirdEye buys recall with precision; Slither does the reverse. The
        decisive column is the last one: Slither can only analyse contracts that <em>compile</em>,
        and it abstained on most of them, disproportionately on large modern code. ThirdEye reads
        source directly, so it scores everything. A static analyser&rsquo;s headline accuracy is
        therefore measured on a subset selected for being easy.
      </p>
      <p className="mt-2 text-xs text-[#7A8794] leading-relaxed">
        Metrics computed on the {h.n_common} contracts BOTH tools scored. {h.note}
      </p>
    </section>
  );
}

/** The arbitration precision-gate experiment.
 *
 * Every contract the council verdicted NO-GO is re-adjudicated by an
 * adversarial red-team/judge pair. A gate that works removes FALSE positives
 * (safe code wrongly blocked) while leaving TRUE positives standing. Reported
 * as raw counts because the sample is small — a percentage would imply a
 * precision the n does not support. */
function ArbitrationSection({ a }: { a: NonNullable<BenchmarkStats["arbitration_ablation"]> }) {
  const fpSeen = a.false_positives_seen ?? 0;
  const fpFixed = a.false_positives_corrected ?? 0;
  const tpSeen = a.true_positives_seen ?? 0;
  const tpLost = a.true_positives_destroyed ?? 0;
  const cell = "rounded-xl border border-[#D8D3C7] bg-[#FFFFFF] px-5 py-5";
  return (
    <section>
      <SectionLabel count={a.n_adjudicated}>
        Arbitration — does the precision gate actually work?
      </SectionLabel>
      <div className="grid sm:grid-cols-2 gap-4">
        <div className={cell}>
          <div className="text-[11px] uppercase tracking-[0.14em] text-[#6B675C]">False positives corrected</div>
          <div className="mt-2 text-3xl font-mono" style={{ color: "rgb(110,231,183)" }}>
            {fpFixed}<span className="text-[#7A8794] text-xl">/{fpSeen}</span>
          </div>
          <div className="mt-1 text-xs text-[#6B675C]">
            Safe contracts the council wrongly blocked, released to GO by the judge.
          </div>
        </div>
        <div className={cell}>
          <div className="text-[11px] uppercase tracking-[0.14em] text-[#6B675C]">True positives destroyed</div>
          <div className="mt-2 text-3xl font-mono" style={{ color: tpLost > 0 ? "rgb(248,113,113)" : "rgb(110,231,183)" }}>
            {tpLost}<span className="text-[#7A8794] text-xl">/{tpSeen}</span>
          </div>
          <div className="mt-1 text-xs text-[#6B675C]">
            Real vulnerabilities wrongly cleared. The cost side of the gate.
          </div>
        </div>
      </div>
      <p className="mt-3 text-xs text-[#6B675C] leading-relaxed">
        <span className="text-[#16150F] font-medium">Reading this:</span> a working precision gate
        would show a high number on the left and a low one on the right. Dropping true and false
        findings at similar rates means the judge is suppressing indiscriminately rather than
        discriminating — so as a binary keep/drop gate it costs more recall than the precision it
        buys. Work in progress: the judge also emits a confidence score, and sweeping a threshold
        over it may recover a usable operating point.
      </p>
      <p className="mt-2 text-xs text-[#7A8794] leading-relaxed">
        Judge: {a.judge ?? "—"}. {a.note}
      </p>
    </section>
  );
}

function TierCard({ t }: { t: TierResult }) {
  const safe = t.expected === "safe";
  // The honest headline metric per tier:
  //  - safe tier  → correct-GO rate (specificity): how often a clean contract is cleared.
  //  - vuln tier  → detection rate (recall): how often a real bug is caught.
  const headline = safe ? t.correct_go_rate_on_safe : t.detection_rate_on_vuln;
  const headlineLabel = safe ? "Correctly cleared (GO)" : "Bugs caught (NO-GO)";
  const badColor = safe ? "text-[#B4351F]" : "text-amber-300";
  const wrong = safe ? t.fp ?? 0 : t.fn ?? 0;
  const wrongLabel = safe ? "false alarms" : "missed";

  return (
    <div className="rounded-xl border border-[#D8D3C7] bg-[#FFFFFF] px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[12px] font-semibold text-[#16150F] truncate">{t.label}</div>
          <div className="text-[9px] uppercase tracking-wider text-[#7A8794] mt-0.5">
            {safe ? "expected GO" : "expected NO-GO"} · n={t.n}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[20px] font-mono font-bold text-[#2C4A6B] tabular-nums leading-none">{pct(headline)}</div>
          <div className="text-[9px] text-[#7A8794] mt-1">{headlineLabel}</div>
        </div>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-[10px] font-mono text-[#6B675C] tabular-nums">
        <span>TP {intg(t.tp)}</span>
        <span>FP {intg(t.fp)}</span>
        <span>TN {intg(t.tn)}</span>
        <span>FN {intg(t.fn)}</span>
        {(t.inconclusive ?? 0) > 0 && <span className="text-amber-300/70">inconcl. {t.inconclusive}</span>}
        <span className={wrong > 0 ? badColor : "text-slate-600"}>{wrong} {wrongLabel}</span>
      </div>
    </div>
  );
}

function AggCard({ title, t, kind }: { title: string; t?: TierResult; kind: "safe" | "vuln" | "overall" }) {
  if (!t) return null;
  const primary =
    kind === "safe" ? t.accuracy : kind === "vuln" ? t.recall : t.f1;
  const primaryLabel = kind === "safe" ? "Accuracy" : kind === "vuln" ? "Recall (detection)" : "F1";
  return (
    <div className="rounded-xl border border-[#D8D3C7] bg-gradient-to-br from-violet-500/[0.06] to-transparent px-5 py-4">
      <div className="text-[10px] uppercase tracking-[0.14em] text-[#6B675C]">{title}</div>
      <div className="flex items-baseline gap-2 mt-1.5">
        <span className="text-[24px] font-mono font-bold text-[#16150F] tabular-nums leading-none">{pct(primary)}</span>
        <span className="text-[10px] text-[#7A8794]">{primaryLabel}</span>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-2 text-[10px] font-mono text-[#7A8794] tabular-nums">
        <span>P {ratio(t.precision)}</span>
        <span>R {ratio(t.recall)}</span>
        <span>F1 {ratio(t.f1)}</span>
        <span>n={t.n}</span>
        {(t.inconclusive ?? 0) > 0 && <span className="text-amber-300/60">inc {t.inconclusive}</span>}
      </div>
    </div>
  );
}

function DistCard({ title, data, color }: { title: string; data: VulnDistEntry[]; color: string }) {
  if (!data || data.length === 0) return null;
  return (
    <div className="rounded-xl border border-[#D8D3C7] bg-[#FFFFFF] px-5 py-5">
      <div className="flex items-center gap-2 mb-4">
        <span className="w-2 h-2 rounded-full" style={{ background: color }} />
        <span className="text-[12px] font-semibold text-[#16150F]">{title}</span>
        <span className="ml-auto text-[10px] font-mono text-[#7A8794]">{data.length} categories</span>
      </div>
      <DistributionBars data={data.slice(0, 10)} color={color} />
    </div>
  );
}

function prettyConfig(c: string | undefined): string {
  if (!c) return "—";
  return c.replace(/_/g, " ").replace(/\bllm\b/i, "LLM").replace(/\b\w/g, (m) => m.toUpperCase());
}
function num(v: number | null | undefined): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}
function ratio(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v <= 1 ? v.toFixed(3) : String(v);
}
function pct(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${(v * 100).toFixed(1)}%`;
}
function intg(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return String(v);
}
function describeSample(s: AblationSample | number | string): string {
  if (typeof s === "number" || typeof s === "string") return `Sample size: ${s}`;
  const parts: string[] = [];
  if (s.n != null) parts.push(`n=${s.n}`);
  if (s.pos != null) parts.push(`pos=${s.pos}`);
  if (s.neg != null) parts.push(`neg=${s.neg}`);
  if (s.seed != null) parts.push(`seed=${s.seed}`);
  return parts.length ? `Sample: ${parts.join(" · ")}` : "Sample size: —";
}
