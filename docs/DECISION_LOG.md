# ThirdEye — research decision log

Chronological record of what was tried, what it measured, and why the approach
changed or stayed. Written for the supervisor review and as the raw material for
the paper's methodology section.

Rule followed throughout: **a result is only kept if the pipeline that produced
it can be shown to have been healthy.** Several early results failed that test
and were discarded — those discards are recorded here, not hidden, because the
reason for each is itself a finding.

---

## Phase 0 — Inherited state (pre-2026-08-04)

Prior sessions had produced a 1,152-contract local benchmark run reporting
~98% accuracy on safe tiers. It looked like a strong result.

**Decision: discarded entirely.** Diagnosis: the council pins `business_logic`
to `llama3.1:8b`, which was not installed. The router *always* selects
`business_logic`, so every contract had a guaranteed-erroring specialist. Where
only 2 specialists were selected, exactly 50% errored — which does **not** trip
the `>50%` fail-closed rule, so a half-dead council recorded a clean GO.
Tell-tale: median latency ~1s (instant model-not-found errors, not analysis).

**Why this mattered more than the lost run:** it established the project's
central methodological risk — LLM pipelines fail *silently and asymmetrically*.
A dead specialist can only fail to raise a flag, never raise a false one, so
every silent failure biases toward GO (i.e. toward "safe"). Archived, not
deleted, under `eval/checkpoints/_invalid_2026-08-04_missing_models/`.

---

## Phase 1 — Making the harness trustworthy (2026-08-04 → 08-05)

Seven distinct defects were found, each of which produced *plausible* numbers.
Full table in `PAPER_DRAFT.md` §5. The ones that changed the design:

| # | Defect | Why it mattered | Decision |
|---|---|---|---|
| 1 | Missing pinned model (above) | half-dead council → clean GO | install models; archive run |
| 2 | Partial-council results treated as terminal | 32/198 rows had errored specialists — **100% of them GO** | terminal only if the whole council ran |
| 3 | Provider quota drain → INCONCLUSIVE checkpointed as terminal | bakes a transient outage permanently into recall | transient results quarantined in `_transient/`, retried |
| 4 | Arbitration silently defaulted to hosted whenever a key existed | a run invoked as "local" was making hosted 120B calls | arbitration follows the run's backend |
| 5 | Arbiter config keyed on names the caller never passes | hosted runs adjudicated by a **local 8B judge**; nothing in the output said so | explicit mapping; fail loudly on unknown key |
| 6 | Subsampling by `items[:N]` | filename order clusters by project — the "sample" was 263 consecutive OpenZeppelin files | seeded **nested** stratified sampling |
| 7 | Health probe timeout (60s) < cold model load (90–230s) | aborted a healthy backend | probe timeout derived from measured cold start |

**Sampling decision (defect 6) is worth calling out.** Replaced first-N with
shuffle-once-then-prefix, so N=10 ⊂ N=25 ⊂ N=50. Consequence: a small run
extends into a larger one reusing every checkpoint, and the population never
silently changes. This is what made "run small now, extend overnight" free.

---

## Phase 2 — Hardware feasibility (2026-08-05)

**Question:** can a model-diverse council run locally, as the "free tier"
selling point claims?

**Measured on RTX 3050 (4GB VRAM / 15.7GB RAM):**
- Only ONE model is GPU-resident; every other runs CPU-only at 224–270s/call
  **regardless of size** — the 2.0GB model was slower than the 4.7GB one when
  the latter held the GPU. Residency, not parameter count, is the variable.
- Model switching costs 72–229s.
- **Decision: group specialists by model** (all of model A's roles, then B's).
  Scheduling change only — same models, prompts, seeds, aggregation, so verdicts
  are unaffected. Effect: specialist errors went 1/2, 2/3, 4/4 → **0/6, 0/4, 0/1**.
- **Decision: `llama3.1:8b` → `llama3.2:3b` for logic roles.** The 8B does not
  fit 4GB and failed under memory pressure; it sat on `business_logic`, which
  always runs, so every contract paid it. Three model families preserved.
- **Attempted and rejected: a stronger local judge.** Pulled `qwen3:8b` (newest
  8B generation). On the documented `eth-046` regression case: `llama3.1:8b`
  dropped 4/4 findings, `qwen3:8b` upheld 4/4 — neither discriminates, and
  qwen3 was 3× slower (thinking model). A 14B judge (~9GB) will not fit at all.
  **Conclusion: consumer hardware has a real ceiling for a judge.** Reported as
  a negative result rather than shipping a gate that is a no-op.

---

## Phase 3 — First trustworthy numbers (2026-08-05 → 08-06)

Local council, arbitration off, nested stratified sample.

| n | recall (vuln) | FPR (safe) |
|--:|--:|--:|
| 40 | 0.850 | 60% |
| **121** | **0.868** | **65%** |

Agreement between n=40 and n=121 established the finding as robust to sample
size. Per-tier: injected **15/15**, curated 19/22, real audit-report 12/16.
Zero abstentions.

**Decision: arbitration disabled for the main run.** Rationale at the time: it
was burning ~125s/contract retrying a drained hosted quota and achieving
nothing, and running it locally would have shipped a gate measured to be a
no-op. Recorded as a council-only ablation row rather than presented as the
full pipeline.

---

## Phase 4 — Baseline comparison (2026-08-06)

**Problem identified:** the GPTScan/GPT-4o-mini numbers being quoted are from
other papers on other datasets. That is context, not comparison, and a reviewer
would reject it. **Decision: run a real baseline on identical contracts.**

Slither, same contracts, same ground truth, same nested sample. Verdict rule
stated explicitly (NO-GO iff ≥1 High/Medium detector); compile failures treated
as abstentions, not silent passes.

| tool | precision | recall | F1 | FPR | scored |
|---|--:|--:|--:|--:|--:|
| ThirdEye council | 0.840 | **1.000** | 0.913 | 0.500 | **121** |
| Slither | **0.947** | 0.857 | 0.900 | **0.125** | 46 |

**Two findings.** (a) F1 is effectively tied — neither dominates; this is a
trade-off characterisation, not a win. (b) **Coverage bias:** Slither abstained
on 69%, and non-randomly — it compiled 36/75 vulnerable (old, simple files) but
only 10/75 safe (modern OZ/Solady needing exact solc). Static-analyser accuracy
on corpora like this is therefore measured on a subset selected for being easy
to compile. The council needs no compilation and has no such subset.

---

## Phase 5 — Arbitration: negative result, then reconsidered (2026-08-06)

**Experiment:** re-adjudicate every council NO-GO, split by ground truth.

- False positives corrected: **9/12 (75%)**
- True positives destroyed: **12/17 (71%)**

| config | FPR | precision | recall | F1 |
|---|--:|--:|--:|--:|
| council only | 60% | 0.586 | 0.850 | **0.694** |
| council + arbitration | 15% | 0.625 | 0.250 | **0.357** |

**Decision: rejected as a binary gate.** It drops real and spurious findings at
similar rates — suppression, not discrimination — halving F1.

**Decision: NOT abandoned as a mechanism.** The judge emits a
`calibrated_confidence` that the binary gate discards. Converting it to a
monotone score (`p_real = conf if "real" else 1−conf`) and sweeping a threshold
turns one bad operating point into a curve. Early evidence the score is
informative:

```
findings on SAFE contracts:       mean p_real 0.230
findings on VULNERABLE contracts: mean p_real 0.629
```

**Process note:** at n=1 vulnerable contract the separation looked negligible
(0.126 vs 0.197) and the mechanism looked dead. It was not — the ordering was
the problem (below). A conclusion was nearly drawn from a one-sample artifact.

**Decision: interleave collection order by ground truth.** Contracts were
processed in ID order, so all 44 safe (`01_*`) preceded all 46 vulnerable
(`02_*`). Under a quota-throttled multi-day run that means collecting only one
class for the entire first half, and the sweep needs both. Now alternating, so
any partial result is a balanced sample.

---

## Phase 6 — Structural analysis of the method (2026-08-06)

Two flaws found by analysing existing checkpoints — no new inference.

**Flaw A: the council is an OR-gate, so FPR compounds with ensemble size.**
A contract is NO-GO if *any* specialist yields one surviving finding — a logical
OR over k detectors, so contract-level FP ≈ 1−(1−p)^k.

| specialists run | n safe | FP rate |
|--:|--:|--:|
| 1 | 10 | 50% |
| 2 | 18 | 61% |
| 3 | 21 | 71% |
| 4 | 11 | 73% |

Model diversity is simultaneously what buys recall and what destroys precision —
the same mechanism. No prompt tuning fixes an aggregation rule.

**Flaw B: specialists differ wildly in precision but are weighted equally.**

| class | on SAFE | on VULN | precision |
|---|--:|--:|--:|
| business_logic | 18 | **0** | **0.00** |
| dos_gas | 18 | 2 | 0.10 |
| reentrancy | 2 | 2 | 0.50 |

Two of eight specialists produce 65% of false-positive findings and 18% of the
true ones — and `business_logic`, precision 0.00 here, is the class the router
*always* fires.

**Decision: replace the OR-gate with per-class calibrated noisy-OR.**

```
risk = 1 − Π_i ( 1 − w_class(i) · p_real(i) )        NO-GO iff risk ≥ τ
```

Chosen because it (a) attacks the measured failure rather than a guessed one,
(b) requires **zero new LLM calls** — a different aggregation over scores already
collected, so it is evaluated offline, and (c) reports an operating *curve*
instead of a single point.

**Prerequisite identified:** checkpoints stored only `n_findings`, so
aggregation experiments were limited to the 26 arbitrated contracts. Schema
enriched to record per-finding class and confidence for every contract, so one
run now supports many offline experiments.

---

---

## Phase 7 — The control that changed the claim (2026-08-08)

The weighted noisy-OR changes TWO things at once versus the OR-gate: it adds
per-class reliability weights AND a confidence threshold. Before claiming the
weighting as the contribution, we ran the obvious control — threshold with every
weight fixed at 1.

| rule | precision | recall | F1 | FPR |
|---|--:|--:|--:|--:|
| OR-gate (current) | 0.555 +/- 0.020 | 0.935 +/- 0.020 | 0.696 +/- 0.019 | 0.655 |
| **threshold only (no weights)** | **0.730 +/- 0.023** | 0.857 +/- 0.049 | **0.787 +/- 0.027** | **0.277** |
| weighted noisy-OR | 0.717 +/- 0.036 | 0.848 +/- 0.125 | 0.771 +/- 0.047 | 0.298 |

**The weighting does not earn its place.** Threshold-alone scores higher and has
roughly half the variance; the weighted variant wins only 4/10 splits. Weights
estimated from small per-class counts added noise, not signal.

**Decision: report the simpler rule.** The contribution is "replace the OR-gate
with a confidence-thresholded noisy-OR", not "weight the specialists". Fewer
parameters, better numbers, lower variance, and nothing to tune per deployment.

**Why this is recorded rather than quietly swapped:** the weighted version was
the headline for two days and is already written into an earlier draft. A
reviewer would have run this exact control — it is the first thing anyone asks
when a method changes two variables simultaneously. Finding it ourselves is the
difference between an ablation and a retraction.

---

---

## Phase 8 — Shipping the fix, and re-measuring the rest (2026-08-08)

An independent precision review (`ThirdEye_FPR_Reduction_Critique`) raised 33
recall-safe levers for cutting FPR. Its headline was the important one.

### The headline was correct and severe

**The fix that works was not the fix that was running.** The paper's result
(threshold-only on pooled noisy-OR risk) lived exclusively in
`eval/weighted_aggregation.py`. `council.py::_aggregate` shipped a per-finding
0.6 floor followed by `if any finding survived -> NO-GO` — which is that same
rule at tau -> 0. We were reporting 28% FPR from a rule the product did not
implement.

**Decision: ported it.** `_contract_risk()` computes `1 - PROD(1 - conf_i)`
over findings that clear the evidence gate; the verdict blocks iff
`risk >= RISK_TAU`. tau = 0.925, chosen identically in 8 of 10 dev splits.
The port is faithful by construction — it mirrors the offline `risk()` with all
weights = 1, including its treatment of a missing confidence as 1.0, so the live
verdict and the offline measurement cannot drift.

Verified by replaying all 233 checkpoints through the LIVE function:

| rule | FPR | recall | F1 | false alarms |
|---|--:|--:|--:|--:|
| OR-gate (was shipping) | 63.7% | 0.927 | 0.699 | 79 |
| risk >= 0.925 (now shipping) | 28.2% | 0.844 | 0.780 | 35 |

Per-class weights remain excluded — the earlier control disproved them.

### The other levers did NOT survive measurement

The review described structural suppression (stateless libraries, per-class
preconditions) and severity policy as "free wins, recall-safe by construction".
Measured individually on top of the threshold:

| lever | FPR | recall | F1 | verdict |
|---|--:|--:|--:|---|
| threshold only | 28.2% | 0.844 | 0.780 | the win |
| + stateless/library gate | 27.4% | 0.835 | 0.778 | ~neutral |
| + reentrancy precondition | 28.2% | 0.844 | 0.780 | no effect |
| + proxy precondition | 28.2% | 0.844 | 0.780 | no effect |
| + dos_gas precondition | 27.4% | 0.807 | 0.762 | **harmful** |
| + severity policy | 25.0% | 0.789 | 0.761 | **harmful** |

**Why the estimates were wrong: the levers overlap.** The review sized each
against the OLD 64% baseline ("12 of 79 false positives were pure libraries").
But the threshold fix already removes 44 of those 79 — including most of the
library cases — so the residual 35 is a smaller and harder population with far
less headroom than the item-by-item arithmetic suggests.

**Instructive failure.** The `dos_gas` precondition cost 4 true positives to
remove 1 false alarm. The contracts it silenced (`dvl_dirtybytes`,
`dvl_privatedata`) ARE vulnerable — but not to DoS. The finding had been scoring
as a true positive *for the wrong reason*, because scoring is contract-level
rather than class-level. Worth stating in the paper: contract-level scoring
credits right-verdict/wrong-reason findings, which flatters any per-class
analysis built on top of it.

**Decision: ship the threshold plus only the two preconditions that measured
non-harmful; drop the dos_gas precondition and the severity policy.** Final
shipped configuration, n=233:

| | FPR | recall | F1 | FP | FN |
|---|--:|--:|--:|--:|--:|
| before | 63.7% | 0.927 | 0.699 | 79 | 8 |
| **after** | **26.6%** | 0.835 | **0.781** | **33** | 18 |

Per safe tier, the residual now tracks label trust — 19% on audited libraries,
25% audit-reviewed-clean, 34% real-world-no-bug-reported — which is the ordering
expected if the weakest-labelled tier carries unreported real bugs.

---

## Standing decisions (things deliberately NOT done)

- **No larger dataset.** 2,250 labelled contracts exist; 121 have been used.
  The bottleneck is inference throughput, not data. Adding contracts adds
  nothing processable.
- **No dynamic exploit confirmation.** Auto-harness generation for arbitrary
  contracts is an open problem; the bundled reentrancy PoC is real but
  template-based. Off by default, claimed as scaffold only.
- **No retrieval-in-prompt.** Precedents are surfaced but not injected, so
  retrieval does not affect verdicts. Stated rather than implied.
- **No tuning on test data.** Thresholds are to be fit on a dev split and
  reported with curves.
