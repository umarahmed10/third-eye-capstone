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

---

## Cross-hardware reproducibility (2026-08-21, campus NVIDIA GB10)

Campus GPU access (DGX Spark, GB10, 119 GB unified) let us ask a question the
project had never been able to ask: **does the same contract get the same
verdict on different hardware?** The shipped n=233 was measured entirely on one
4 GB laptop GPU. If it does not reproduce, every headline number is partly a
property of that laptop rather than of the method.

Method: the same 233 contract ids, the same seed, the same no-arbitration
config, replayed on the GB10. Throughput 28.8 min vs 4.8 h on the laptop (~10x).

**Two comparison traps had to be closed before the numbers meant anything.**

1. **The stored `verdict` field is the OLD OR-gate rule.** The shipped noisy-OR
   result is produced by replaying checkpoints through `stats._shipped_rule`
   (`_contract_risk` + `suppress`), not by reading `verdict`. A first pass
   compared stored-laptop against live-DGX and "found" a 0.75 agreement with all
   flips running one direction — that was measuring our own rule change. Both
   sides must be replayed through one rule. `eval/parity_rescore.py` does this by
   importing the live functions rather than reimplementing them a fourth time.

2. **`num_ctx` is never set by the application.** It inherits the Ollama server
   default: 4096 on the laptop's 0.24.0, but the model maximum (131072) on
   current builds — which would silently stop truncating long contracts. Pinned
   to 4096 on both sides. (It also inflates the KV cache to ~62 GB for a 3B
   model and evicts the rest of the council.)

Result, n=230 scored, one identical rule:

| | agreement | FPR | recall |
|---|--:|--:|--:|
| laptop (replayed) | — | 27.3% | 0.835 |
| GB10 | **0.813** (95% CI 0.763–0.863) | **40.5%** | 0.862 |

The laptop's 27.3% reproduces the shipped 26.6%, which validates the replay.
But the same code on other hardware moves the headline false-alarm rate by 13
points, and the 43 disagreements are asymmetric — 31 GO→NO-GO against 12 the
other way. That is a systematic shift, not symmetric kernel jitter.

**This is NOT yet reportable as hardware nondeterminism.** Three variables moved
together: GPU, Ollama build (0.24.0 → 0.32.15), and batch parallelism
(`OLLAMA_NUM_PARALLEL` 1 → 4, which we set). Model digests are byte-identical on
both machines (`a80c4f17acd5`, `46e0c10c039e`, `dae161e27b0e`, `a2af6cc3eb7f`),
so weights and their sampling defaults are excluded. Batching is the leading
suspect precisely because it predicts a *directional* skew: batched inference
changes GEMM shapes and reduction order, so logits shift and a fixed seed no
longer pins the sampled token.

**Open, and blocking any claim here:** a `NUM_PARALLEL=1`, one-contract-in-flight
arm reproducing the laptop's serving config exactly. If agreement jumps, the
finding is "batched serving perturbs verdicts" — narrower, more actionable, and
still novel. If it holds near 0.81, the reproducibility problem is real. Not
separable in general: Ollama 0.24.0's CUDA build has no arch for compute 12.1
and will likely not run on a GB10 at all.

### Capacity ablation (llama3.1:8b), n=24 pilot

`council.py` pins business_logic / oracle_price_manipulation / flashloan_mev to
`llama3.2:3b` solely because `llama3.1:8b` (4.9 GB) does not fit in 4 GB of
VRAM — a hardware compromise sitting on the three *semantic* roles. Restoring
the 8B is a one-variable change the GB10 makes possible.

Pilot result (n=24, 12 safe / 12 vulnerable, same seed, same rule):

| arm | misses | false alarms | accuracy |
|---|--:|--:|--:|
| llama3.2:3b | 2 | 6 | 0.667 |
| **llama3.1:8b** | **0** | **9** | 0.625 |

The 8B caught every bug it had been missing and raised three more false alarms.
All five differing verdicts moved the same direction (GO→NO-GO). Median latency
was unchanged (24.1 s vs 24.4 s).

If it holds at n=233, this is direct evidence for the paper's thesis: **more
model capability made the crying-wolf worse, not better.** It answers the
obvious reviewer objection — "why not just use a bigger model?" — with our own
data, and it argues the lever is aggregation, not capability. The n=233 arm is
~223/233 computed and resumes on next campus access.


---

## 2026-08-28 — Campus GB10 session

### The 8B capacity ablation, at full n

The n=24 pilot held. Final arm, n=233 (232 scored, 1 inconclusive):

| | DGX / llama3.1:8b | laptop / llama3.2:3b |
|---|--:|--:|
| accuracy | 0.651 | 0.625 |
| median latency | 22.6 s | 60.6 s |
| agreement with laptop | 0.767 | — |

Note the confound this arm does NOT resolve: it varies model AND hardware AND
Ollama version at once. The `NUM_PARALLEL=1` control (n=233, 227 scored) is the
lever that separates serving config from the rest.

### The GPTScan head-to-head had never run

`run_web3bugs --gptscan-set` reads `datasets/gptscan/comparison_set.json`, which
lives at the repo root. `TUESDAY_START.sh` synced only three `backend/` paths,
so the file was never on the box: the stage died with `FileNotFoundError` on
every session, and the session script logged it as `stopped at budget`. The
failure read as a clock problem for weeks. It needed **zero** new GPU time —
63 of the projects were already checkpointed.

Two further defects in the same path, both of which would have put a wrong
number in the paper:

* `--report-only` ignored `--gptscan-set` and globbed every checkpoint, so "the
  GPTScan comparison" silently reported the whole 91-contest sweep.
* Both runs wrote `web3bugs_bench.json`, so whichever finished last became "the"
  web3bugs result.

### The comparison was unfair in our favour, twice

**Wald at the boundary.** 63/63 printed as `100.0% [100.0-100.0]` — perfect
certainty claimed from a finite sample, on a project whose thesis is that rates
are published without their uncertainty. Backend and exhibit both moved to
Wilson. This also tightened the headline FPR from `[25.7, 33.2]` to
`[26.8, 32.2]`.

**Scoring GPTScan on questions it was never asked.** Collapsing their per-project
rule-check counts to "detected if tp > 0" counted 34 of 72 projects as misses.
Those have `tp = 0` AND `fn = 0`: their ten rule types had no applicable check
there at all. That single error dragged their apparent rate from ~91% to ~49%
and would have been fatal in review.

Recall is now computed only over projects where GPTScan had a positive to find:

| on 34 gradable projects | detected | |
|---|--:|---|
| ThirdEye | 33/34 | 97.1% [85.1, 99.5] |
| GPTScan | 31/34 | 91.2% [77.0, 97.0] |

**Intervals overlap — no detection difference is demonstrated.** That is the
result, and claiming a win across overlapping intervals would forfeit the
paper's own argument.

The real finding is **scope**, reported separately and never merged into recall:
29 of the 63 shared projects carry a confirmed bug outside GPTScan's rule set,
and ThirdEye returns a verdict on all 29. Coverage is not accuracy — an
any-slice flag on an all-positive set is nearly free.

Positioning that follows: **comparable detection where both tools apply, on
roughly twice the applicable projects, at a false-alarm cost we measure and they
do not have to pay** (their published precision 0.571; our FPR 29.4% on buckets
01/02 — different negative sets, never subtracted).

### `LLM_TIMEOUT` was dead code, and it was biasing the sample

`_query` does `timeout or LLM_TIMEOUT`, and `_run_specialist` passed
`timeout=240` explicitly, so the env var never governed anything on any machine.
`arbitration.py` had two more hardcoded 240s and never imported `LLM_TIMEOUT`.

This is a validity bug, not a throughput one. With N contracts in flight x 8
specialists against `OLLAMA_NUM_PARALLEL`, requests queue, and queue wait counts
against the client-side deadline. A blown deadline fails closed to INCONCLUSIVE
and quarantines the contract — and the calls that blow it are the **large,
complex** contracts. The discards are not random, so the scored sample skews
toward simpler code.

Measured on the GB10 before the fix: 9 INCONCLUSIVE in 39 contracts (23%), with
deaths clustered at 303.0 s, 303.4 s and 405.4 s — the signature of a 240 s
per-call cap plus queueing. Stage B was relaunched with the fix live and
`--retry-quarantined`.

### Operational: a pkill that killed its own launcher

`TUESDAY_START.sh` ran `pkill -f 'dgx_tue[s]day'` to clear a stale session. The
bracket stops the *pattern* matching itself, but the same command line contains
the literal path `.../dgx_tuesday.sh`, so pkill matched the shell running the
launch and killed its parent. ssh died with 255 before the launch line ran, and
the script reported success because it never checked ssh's exit code. It now
refuses to double-start and verifies the process exists rather than inferring it
from `rc=0`.

### Verifying GPTScan against the paper, not just its CSV

Checked the published paper (arxiv.org/abs/2308.03314) rather than trusting the
results file alone. The parse reproduces the published table exactly: tp 40,
fp 30, tn 154, fn 8 over 232 counts, giving 57.14% / 83.33% / 67.8%. (A search
summary claiming "recall 71.43%" for Web3Bugs is wrong; the paper's Web3Bugs row
is 83.33%, and the abstract's "over 70%" is a cross-dataset statement.)

Two things the paper settles that we had been inferring:

**The unit.** Scoring is at the function level *for each tested vulnerability
type* — "if a project tested five vulnerability types, each would contribute one
count". A count is a project x rule-check.

**The true-negative definition licenses our gradable subset.** A TN is a tested
type that lacks a corresponding ground-truth vulnerability in that project.
So `tp = 0 and fn = 0` means there was no positive of the relevant type to find.
Restricting the detection comparison to projects with `tp + fn > 0` is therefore
required by their own definition, not a choice of ours. The earlier version that
scored those 34 projects as GPTScan misses was wrong by their definition, not
merely unfair.

**A fairness correction the paper forced.** GPTScan targets ten DeFi logic types
and DELIBERATELY excludes reentrancy and integer overflow, on the premise that
pattern-based tools already cover those and that ~80% of Web3 bugs cannot be
audited by them. Its narrower project coverage is a design decision in service of
that premise. Our draft had presented "roughly twice the applicable projects" as
a differentiator; that reads as claiming credit for someone else's deliberate
scoping. It is now reported as a difference in TARGET POPULATION — our taxonomy
is broader, which is a different claim from being better at the task GPTScan set
itself.

### The context-truncation ablation (result)

Paired on contract id, 36 pairs / 20 scored in both arms, one variable (num_ctx):

| | 4,096 (shipped) | 16,384 |
|---|--:|--:|
| abstained | 44.4% [29.5, 60.4] | 0.0% [0.0, 9.6] |
| accuracy | 25.0% | 75.0% |
| recall | 12.5% | 81.2% |
| median latency | 402.9 s | 108.2 s |

McNemar on the discordant pairs: 12 vs 2, chi2 = 5.79, **p = 0.016**. Latency:
faster on **20/20**, x4.01, exact sign test p < 0.0001. 14/20 verdicts flipped,
13 of them GO -> NO-GO on genuinely vulnerable contracts.

The finding behind the finding: abstentions are excluded from scoring, so this
did not depress any published number — it deleted rows and left healthy-looking
tables. A configuration failure that hides itself in exactly the way this project
accuses the field of doing.

Bounds, stated because they matter: measured only on the overflowing 24% of the
corpus; the FPR arm rests on 4 safe contracts and is not claimed; the extreme
tail was excluded on cost grounds (decided from latency alone, before any verdict
was inspected), so everything above is a LOWER bound.

### Safe-class context ablation — PRELIMINARY, and it points the wrong way

The mixed ablation left the false-alarm question on n=4. A safe-only arm was run
to answer it. **Partial at time of collection** (21 paired; the 4,096 control was
still running on the box and will be complete on the next visit):

| | 4,096 | 16,384 |
|---|--:|--:|
| abstained | 47.6% [28.3, 67.6] | **0.0%** [0.0, 15.5] |
| FPR (paired subset) | 27.3% [9.7, 56.6] | **63.6%** [35.4, 84.8] |

The abstention intervals **separate**, replicating the vulnerable-class result on
the safe class: truncation was removing these contracts from scoring altogether
(the completed 16,384 arm abstains on 2 of 70; the control on roughly half).

The false-alarm direction is the uncomfortable one. On the paired subset it
**rises** with a correct context window, and the completed treatment arm sits at
45.6% [34.3, 57.3] over 68 scored contracts. If that holds, the contracts
truncation was hiding are disproportionately the ones the council false-alarms
on, and the reported 29.9% is an UNDER-estimate rather than a conservative one.

NOT YET A RESULT, and must not be quoted as one:
- 21 paired, 4 discordant, McNemar p = 0.13 — underpowered by our own rule.
- The 16,384 arm's 45.6% is on the OVERFLOWING safe population only (large
  contracts), which may draw more alarms regardless of window.
- It is the raw verdict, not the shipped noisy-OR rule that produces 29.9%.
  Cross-referencing the two without a shipped-rule replay would repeat exactly
  the rule-mixing error caught earlier in this session.

Next visit: let the control arm finish (it was budgeted to ~18:30 and
checkpoints), then replay both arms through the shipped rule before comparing
anything to the headline.

---

## Phase 9 — End-to-end audit of the instruments (2026-10-23)

Phase 0 discarded a 1,152-contract run because a model named in a config was not
installed, every call to it errored, and a half-dead council recorded clean GOs
at ~1s latency. This phase asked a narrower question: **is that defect still
present anywhere, and would we currently detect it?** The answer was no on the
second half, in three places, and all three were our own integrity tooling.

The common mechanism is one line of Python semantics: `row.get(k)` returns
`None` for an absent key, `None` is falsy, and so **"this was never recorded"
became indistinguishable from "this was recorded as fine."** Absence of a
record is not a record of absence.

**1. `eval/audit.py` — the contamination auditor failed open, twice.** It keyed
intactness on `specialists_errored`, so rows that never recorded council health
counted as intact. It also keyed terminality on `verdict` alone, while
`arb_sweep` stores `council_verdict`, the ablation arms store `ok`/`pred`, and
web3bugs stores `detected`/`slices_errored`. Those three trees reported
`terminal=0` — printed as a row of harmless zeros that actually meant *this tree
was never audited*. Fixed: unrecorded health is now its own tier that never
counts as intact, every tree shape is recognised, and an unparseable tree says
so loudly instead of showing zeros.

*What this surfaced once the auditor could see:* **web3bugs is 72.2%
contaminated — 65 of 90 contest rows ran with at least one errored slice**, the
most contaminated tree in the project, previously invisible. All 90 remain sound
under the asymmetric rule, so the contest-recall claim (98.4%) and the 33/34
head-to-head stand; **no rate or paired claim on that corpus does.**

**2. `eval/guard.py` — `default_terminal` admitted a GO whose health field was
absent.** Latent rather than realised: every tree governed by that rule does
carry the field. But `run_full_analysis` emits only `llm_error_detected`, so the
next runner wiring it through the guard would have hit it. A GO must now *prove*
an intact council rather than merely fail to report a broken one.

**3. `tests/test_eval_integrity.py` — three tests that could not fail.** Each
re-implemented the terminal rule in its own body and asserted on its own
arithmetic; `guard` was never executed, so a regression there would have left
all three green. They now call `guard.default_terminal`, and the replacements
were verified to fail against the old rule before being kept. A check that
cannot fail is not a check — the project's own thesis, found in its own tests.

Root cause closed as well as reported: `services/llm.py` now records
`specialists_errored` on the single-model path and `eval/run_ablation.py`
persists council health per row, so the ambiguity stops being *possible* rather
than merely being flagged.

### The arbitration retraction

`LOCAL_JUDGE_MODEL` defaulted to `qwen3:8b`, which was not pulled on the
evaluation host. Every judge call returned 404 and the unparseable-output path
**failed open** with `verdict="real", upheld=True, confidence=0.4`. All 234
findings received an identical verdict and identical confidence and were upheld
unconditionally — so arbitration dropped nothing, and the reported result
("wins 4 of 10 held-out splits — no gain") was true **by construction, not by
measurement.** Nothing in the output distinguished this from a judge that had
adjudicated and agreed.

The fail-open behaviour is *correct* for a security tool: a judge that cannot be
reached must not silently delete a candidate bug. The defect is that it was
indistinguishable from a verdict. Findings now carry `judge_ok` end to end.

With the model installed the judge discriminates — 24 `not_a_bug` to 3 `real`
over 27 findings, every call `judge_ok`, and confidence genuinely varying
(0.6–0.95; an earlier read of "constant 0.95" was a small-n artifact and is
withdrawn). The mechanism is therefore **not** a no-op and the sign of its
effect is unknown until the sweep completes. Marked RETRACTED in the paper
rather than quietly deleted. This is the fifth instance in this project of an
unreported configuration detail converting a mechanism into a no-op while every
downstream number looked normal, and the fourth found in our own
infrastructure rather than in the tool under test.

### The third decision rule is the second one

Replayed the decision-rule table on the full 2,142-row corpus (all asym-sound):

| rule | tp/fp/tn/fn | recall | FPR | was (n=1,154) |
|---|--:|--:|--:|--:|
| pre-gate `n_findings > 0` | 1051/755/291/45 | 95.9% | **72.2%** | 59.0% |
| evidence gate `NO-GO` | 977/480/566/119 | 89.1% | **45.9%** | 37.5% |
| noisy-OR τ = 0.925 | 977/480/566/119 | 89.1% | **45.9%** | 30.2% |

The noisy-OR column is identical to the evidence gate in **every cell**, and the
two disagree on **0 of 2,142** contracts. That is an identity, not a
measurement: `services/council.py:472` defines the shipped verdict as
`risk = 1 − Π(1 − conf_i)`, `NO-GO iff risk ≥ RISK_TAU`, with `RISK_TAU = 0.925`
at line 484. A τ sweep confirms it — disagreement is 191 rows at τ = 0.90,
**0** at 0.925, 1 at 0.95, 108 at 0.99; the zero sits exactly on the shipped
threshold.

This closes Phase 7's open "lands 2 contracts off" question in the opposite
direction. The third column is not slightly wrong; it is a *different function*
of data the checkpoints do not store (post-suppression findings), because any
noisy-OR over data they **do** store is the second column. It also dissolves
part of an earlier caveat: in replayable data there is no distinction between
"the raw verdict" and "the shipped noisy-OR rule" — they are the same function.

**Report two measured steps, not three:** 72.2% → 45.9%, a 26.3-point move
attributable to the decision rule on identical verdicts. Still the cleanest form
of the thesis, and it no longer credits a step we cannot reproduce. Caught
before review, where proposing noisy-OR pooling as an improvement would have
been proposing the tool's own shipped rule.

Both reproducible rules are materially worse at full corpus than at the
1,154-row replay (FPR +13.2 and +8.4 points), so **every FPR figure derived
from that replay is optimistic and must be regenerated before submission.**

### Sequencing note

The box runs at 96% GPU with two stages; a third reduced baseline throughput
from 2.5 to 1.4 rows/min without raising total output, so the stages are
contending for a saturated device rather than filling idle capacity. Work is
therefore serialised by paper value — arbitration sweep (settles the
retraction) and baselines first, the n=35 ablation paused at 11 rows and
resuming from checkpoints — rather than run three-wide.

### The judge is a reasoning model, and that is 97% of its cost

Diagnosing why the arbitration sweep ran at ~0.2 contracts/min, the first
hypothesis — GPU starvation from three concurrent stages — was wrong. A direct
call to the judge model returned in 2.7 s, so it was never queue-starved. The
measurement that mattered, on a realistic judge prompt:

| | per judge call |
|---|--:|
| latency | **23.2 s** |
| `thinking` emitted | 1,349 chars |
| `response` used | 35 chars (`{"verdict":"real","confidence":0.9}`) |
| `eval_count` | 300 tokens |

`qwen3:8b` is a **reasoning model**: roughly 97% of the tokens it generates per
arbitration are a chain-of-thought trace that the parser discards. That, not
contention, is the sweep's cost — about 8 min/contract, ~12 h for the corpus.

Two consequences recorded rather than optimised away:

1. **It is a second route to the fail-open we just retracted.** With a short
   `num_predict` or a tight timeout, the thinking trace consumes the budget and
   `response` arrives EMPTY with `done_reason: "length"` — reproduced directly
   (`num_predict: 5` returns `response: ""`). An empty body is unparseable, and
   the unparseable path fails open. The `judge_ok` flag added earlier now makes
   this visible (27/27 `True` in the current sweep, so it is parsing today), but
   the fragility is structural: **the judge's output budget must exceed its
   thinking budget or the mechanism silently reverts to a no-op.**

2. **Thinking was NOT disabled to speed up the sweep.** Doing so would be ~10–20×
   faster and is the obvious optimisation, but `qwen3:8b` with thinking on is the
   shipped default, and changing a model's reasoning mode partway through a sweep
   would mix two different judges into one result set — the same class of
   unreported configuration change that produced the retraction this sweep
   exists to correct. The sweep runs as shipped. If a no-thinking judge is worth
   measuring, it is a separate arm with its own label, not a performance tweak.

Also noted: the throughput-based scheduling decisions made during this session
(pausing and then resuming the ablation to manage contention) were **not
supported by the data**. Row-rate sampled over 5–15 min windows varied 0.93–2.5
rows/min for the *same* three-stage configuration, because per-contract cost
varies by more than the effect being measured. GPU sat at 96% throughout. All
stages are per-row checkpointed, so they were left running concurrently and no
further scheduling decisions were made on that signal.

### Interim: arbitration is a sensitivity dial, not a precision mechanism

First read on the re-run sweep with a judge that actually answers, at **n = 13
contracts (6 vulnerable, 7 safe) — INTERIM, not a result**:

| | tp | fp | tn | fn | recall | FPR | **precision** |
|---|--:|--:|--:|--:|--:|--:|--:|
| council (pre-arbitration) | 6 | 6 | 1 | 0 | 100.0% | 85.7% | **50.0%** |
| post-arbitration | 1 | 1 | 6 | 5 | 16.7% | 14.3% | **50.0%** |

The judge drops **92% of findings** (35 of 38) and flips 10 verdicts NO-GO→GO:
five safe contracts (correct) and five vulnerable ones (catastrophic). It
removes true and false positives at the *same rate*, so **precision does not
move at all** — 50.0% before, 50.0% after — while recall falls 83 points.

If this holds, the honest claim is not "adversarial arbitration yields no
held-out gain" but something sharper: **arbitration is a sensitivity threshold
presented as a reasoning mechanism.** It is drastically active, and
precision-neutral in exactly the quantity it was adopted to improve. The
retracted conclusion was accidentally right and entirely unearned — it was
measured on a judge that never answered.

`judge_ok` is False on **0 of 38** findings, so every adjudication here is real
rather than a fail-open default. The instrumentation added earlier is doing the
job it was added for.

**Why this is not yet reportable.** The sweep processes contracts in sorted
order and the corpus prefixes correlate with class: all five safe flips are
`01_dappclean_*`, all five vulnerable flips are `02_dappscan_*`. The first 13
contracts are therefore **not a class-random sample** and every rate above is
order-biased. Recompute at full n before quoting anything. The structural
observation (true and false positives dropped at equal rate ⇒ precision
unchanged) is the part least likely to be an artifact of ordering, but it needs
the full sweep and a Wilson interval before it is a claim.

Reproduce with `python -m eval.arb_interim` from `backend/`.

#### Correction at n = 41: precision-neutrality does NOT hold

The n=13 read above is **withdrawn**. Tripling the sample reverses it:

| | tp | fp | tn | fn | recall | FPR | **precision** |
|---|--:|--:|--:|--:|--:|--:|--:|
| council (pre-arbitration) | 20 | 20 | 1 | 0 | 100.0% | 95.2% | **50.0%** |
| post-arbitration | 7 | 1 | 20 | 13 | 35.0% | 4.8% | **87.5%** |

Precision moves **50.0% → 87.5%**, not 50% → 50%. At n=13 true and false
positives happened to be dropped at equal rates; at n=41 they are not, and the
sample is now roughly class-balanced (20 vulnerable, 21 safe) rather than the
all-safe-prefix block the earlier figure was computed on. The "sensitivity dial,
not a precision mechanism" framing was an artifact of a 13-contract sample and
must not be used.

**Arbitration is a real precision mechanism with a steep price: +37.5 points of
precision for −65 points of recall** (85% of findings dropped, 109 → 16).

This matters beyond the number. The retracted claim was not merely
*unmeasured* — it pointed the wrong way. "No held-out gain" was produced by a
judge that upheld everything; the working judge produces a large gain in
precisely the quantity the mechanism was adopted for. The paper's concession
has to become a result.

Two corrections to our own reasoning recorded alongside it, since both were
made in the course of a single evening by the people writing a paper about
this exact failure mode:
- a 13-contract interim was quoted as a structural property ("drops TPs and
  FPs at the same rate ⇒ precision cannot move"). Structural-sounding
  reasoning from a small sample is still a small sample.
- `judge_ok` is False on 0 of 109 findings, so none of this is fail-open
  contamination. The instrument that made the original defect visible is also
  what lets this number be trusted.

Still INTERIM: 41 of ~90 contracts, processed in sorted order, so not a random
sample. Wilson intervals and the full sweep before anything is quoted.

#### The fail-open caught in the act (a concrete artifact)

At n=51 contracts the re-run produced its first unanswered judge call, and
`judge_ok` caught it. The row, verbatim, from
`arb_sweep/02_dappscan_bandpricefeed.json`:

```json
{"type": "arithmetic", "judge_verdict": "real", "judge_ok": false,
 "conf": 0.4, "p_real": 0.4, "upheld": true}
```

This is worth quoting in the paper because of what it is: **apart from the flag,
it is indistinguishable from a confident adjudication.** `verdict="real"`,
`upheld=true`, a plausible `confidence=0.4` — all three are the hardcoded
fail-open defaults, and nothing about the shape, the types, or the value ranges
marks it as a non-answer. A reader, a reviewer, or a downstream aggregation
script sees a judged finding.

The base rate makes the contrast exact:

| run | findings | fail-open | rate |
|---|--:|--:|--:|
| original (judge not installed) | 234 | 234 | **100%** |
| re-run (judge installed) | 133 | 1 | **0.75%** |

The same code, the same output schema, the same absence of any error, and a
difference between a worthless result and a sound one. The only thing that
separates them is a boolean that did not exist this morning.

Note also that the fail-open is *correct behaviour* here and should not be
"fixed" away: this finding is on a contract whose ground truth is vulnerable and
whose council verdict is NO-GO, so upholding an unjudged finding is the safe
action for a security tool. The defect was never the fail-open. It was that the
fail-open was unobservable.

#### n = 280: the precision gain does not survive, and the retraction was right

Final correction, and it reverses two earlier entries in this log. On the full
sweep corpus:

| | tp | fp | tn | fn | recall | FPR | **precision** |
|---|--:|--:|--:|--:|--:|--:|--:|
| council (pre-arbitration) | 131 | 133 | 7 | 9 | 93.6% | 95.0% | **49.6%** |
| post-arbitration | 46 | 41 | 99 | 94 | 32.9% | 29.3% | **52.9%** |

**Precision moves 49.6% → 52.9%: +3.3 points, not the +37.5 recorded at
n = 41.** Arbitration drops 83% of findings (784 → 135), costs 61 points of
recall, and cuts FPR by 66 points — but barely touches precision, the quantity
it exists to improve.

The full sequence of readings taken during one evening, on the same mechanism:

| n | precision | what we concluded |
|--:|---|---|
| 13 | 50.0% → 50.0% | "a sensitivity dial, not a precision mechanism" |
| 41 | 50.0% → 87.5% | "a real precision mechanism; the concession becomes a result" |
| 280 | 49.6% → 52.9% | +3.3 points — essentially the original claim |

**So the retracted conclusion was substantively correct.** "Adversarial
arbitration yields no held-out gain" was reported from a judge that never
answered — the method was worthless — but the number it accidentally produced
is close to what a working judge gives on this corpus. The retraction stands as
a methodological correction; it does NOT license claiming the opposite result.

The two experiments disagree at full sample, and that is the finding:

| experiment | corpus | n | precision |
|---|---|--:|---|
| ablation | access_control_slice | 52 | 58.3% → **92.3%** |
| sweep | dappclean / dappscan | 280 | 49.6% → **52.9%** |

Same mechanism, same judge, same code — a +34-point gain on one corpus and
+3.3 on another. Reported as corpus dependence, not resolved by picking the
flattering one.

**The methodological lesson, recorded against ourselves.** Three times in one
evening a conclusion was drawn from a sample that then reversed it, and each
intermediate reading was confidently stated. The n=41 figure was quoted to the
project owner as "refuted from two independent designs." Nothing was wrong with
the arithmetic at any step; what was wrong was treating a partial sweep of a
*sorted* corpus as a sample of it. A paper whose thesis is that evaluation
setup determines the answer has no excuse for quoting an interim as a result,
and this log entry exists so the final number is not mistaken for a steady one.

`judge_ok` False on 13 of 784 findings (1.7%) — real adjudications throughout,
so none of the drift is fail-open contamination.

---

## Phase 10 — What is OUR best configuration? (2026-10-24)

A fair challenge from the project owner: we have run many experiments; have any
of them told us our own best operating point? Mostly **no**. Nearly everything
measured *the measurement* — label provenance, matching rules, context windows,
decision rules, machines. That is the paper's thesis and it is novel, but it is
a different question from "what should we ship", and we had not answered it.

Answering it took no GPU at all. Three offline analyses over cached checkpoints:

### 1. The decision threshold is exhausted

Sweeping τ over the shipped noisy-OR on 2,142 asym-sound rows:

| τ | recall | FPR | Youden J |
|--:|--:|--:|--:|
| 0.5 | 95.9% | 72.2% | 23.7 |
| 0.925 (shipped) | 89.1% | 45.9% | 43.3 |
| 0.99 | 84.9% | 40.0% | **45.0** |
| 0.9999 | 73.2% | 32.1% | 41.1 |

The shipped τ is already near-optimal, and more importantly **FPR will not go
below ~32% by thresholding at any τ**. About a third of safe contracts carry at
least one *near-certain* false finding. The false alarms are not low-confidence
noise that better aggregation can filter — they are confident and wrong. Every
gate/threshold/pooling experiment we have run is downstream of finding
generation and therefore capped by this floor.

### 2. One specialist produces the floor

Attributing findings on safe contracts (false by construction) by type and model:

| finding type | on safe | on vuln | FP rate |
|---|--:|--:|--:|
| **business_logic** | 467 | 435 | **52%** |
| arithmetic | 310 | 783 | 28% |
| dos_gas | 208 | 544 | 28% |
| access_control | 191 | 537 | 26% |
| reentrancy | 75 | 538 | 12% |

| model | on safe | on vuln | FP rate |
|---|--:|--:|--:|
| **llama3.2:3b** | 508 | 490 | **51%** |
| gemma3:4b | 208 | 544 | 28% |
| qwen2.5-coder:7b | 589 | 1879 | 24% |

These two rows are the same fact: `business_logic` is pinned to
`LOGIC_MODEL = llama3.2:3b`, and the static router **always** selects
`business_logic`. So a specialist that runs on every contract and is barely
better than a coin flip (52% of its findings land on safe contracts) generates
roughly a third of all false findings. Note this is *not* an argument for the 8B
model, which was measured worse on this role (p = 0.0303): the role is the
problem, not only the model on it.

### 3. Dropping it reaches the floor at much better recall

| configuration | recall | FPR | precision | F1 | J |
|---|--:|--:|--:|--:|--:|
| shipped, τ = 0.925 | 89.1% | 45.9% | 67.1% | 0.765 | 43.3 |
| drop business_logic, τ = 0.925 | 86.2% | 39.6% | 69.5% | 0.770 | 46.6 |
| drop business_logic, τ = 0.99 | 81.5% | **32.6%** | 72.4% | 0.766 | **48.9** |
| all findings, τ = 0.9999 | 73.2% | 32.1% | 70.5% | 0.718 | 41.1 |

The last two rows are the point: at the SAME ~32% false-alarm rate, dropping
the coin-flip specialist delivers **81.5% recall against 73.2% — +8.3 points
for free.** Thresholding buys FPR by sacrificing recall; removing the bad
specialist does not. At the shipped τ it is a straight Pareto gain (−6.3 FPR
for −2.9 recall, with precision and F1 both up).

### NOT YET A RESULT — and the reason matters

`business_logic` was selected **by inspecting this data**, and the fix was then
scored **on the same data**. That is post-hoc selection and some of the gain is
fitted noise. A paper arguing that evaluation setup determines the answer cannot
ship a configuration tuned on its own test set. Confirm on seeds 1–2, which are
unstarted and now affordable (the arbitration sweep was stopped at 281 balanced
rows for this reason: 42 further GPU-hours would only have narrowed an interval
on a null effect).

### Why arbitration is not the answer here

At n = 281 the judge retains **32.9% of true flags and 29.3% of false flags** —
nearly the same rate. Arbitration is approximately *uniform thinning*, which is
why precision moved only +3.3 points. A threshold knob achieves the same trade
more cheaply and controllably, which is the honest reading of the "no
held-out gain" result rather than a defence of it.

### Owed

- `evidence_quote` is dropped when checkpoints are written (only
  type/severity/confidence/source/model persist), so the obvious next test —
  do the confident-wrong findings fabricate their evidence? — needs a re-run
  with quotes stored. It cannot be answered from cache.
- Retrieval grounding is wired to nothing: `run_ablation` notes that retrieved
  precedents are surfaced in output but **not injected into specialist
  prompts**. That is the one untested lever that changes *what the specialists
  assert* rather than how findings are counted, so it is the only candidate we
  have for moving the 32% floor itself.
