# ThirdEye — paper draft (working)

Status: draft skeleton with REAL measured numbers as of 2026-08-06.
Every number below is traceable to a checkpoint file. Nothing is estimated.
Placeholders are marked `[TODO]` — do not submit with any remaining.

---

## Which paper to write

Two viable framings. They are not equally supported by the evidence.

### Framing A — "free model-diverse council matches paid GPTScan"
**Claim:** recall 0.85 on a balanced benchmark at $0/contract, versus GPTScan
(ICSE'24) 0.833 on Web3Bugs with paid GPT.

**Problem:** the false-positive rate is 60% on audited-safe code (12/20). The
paper's own motivation cites GPT-4o-mini's ~951 false positives as the failure
to fix. A reviewer reaches that number and stops. Also the GPTScan comparison
is not head-to-head — different dataset, so it is at best contextual.

**Verdict:** not submittable as the headline. Arbitration as a binary gate was
MEASURED and is harmful (§4.4). Survives only if the threshold sweep (§4.5)
finds an operating point beating council-only F1.

### Framing B — "silent failure modes in LLM security-evaluation harnesses"  ← RECOMMENDED
**Claim:** LLM-based evaluation harnesses fail *silently and asymmetrically*,
producing plausible-looking metrics from broken pipelines. We document seven
distinct defects found in one system, show each one's directional bias on the
reported metric, and propose invariants that make them fail loudly instead.

**Why this is stronger:** it is fully supported by evidence we already have, it
is novel (the LLM-eval-methodology literature is thin), and its core artifact —
a list of concrete, reproducible failure modes with measured impact — is exactly
the kind of contribution a systems/SE venue accepts. It also does not depend on
beating anyone's baseline.

**Recommendation:** write B, and include the ThirdEye measurements as the case
study that produced the findings. Framing A becomes a section, not the thesis.

---

## 1. Abstract

Large-language-model "councils" — ensembles of specialist agents, each pinned to
a distinct base model and vulnerability class — are an increasingly common design
for automated smart-contract auditing. We evaluate one such system on a balanced
benchmark of 232 Solidity contracts (124 audited-safe, 108 known-vulnerable),
and report three findings.

First, the council attains 0.93 recall on known-vulnerable contracts at zero
inference cost on consumer hardware, comparable to recall reported for paid-model
baselines. Second, and against the design's own premise, it blocks 64% of
audited-safe contracts. We show this is structural rather than a prompting
defect: the council verdicts unsafe if ANY specialist objects — a logical OR over
k detectors — so the false-alarm rate grows with ensemble size, measured rising
monotonically as the router engages more specialists. The model diversity that
produces the ensemble's sensitivity is the same mechanism that destroys its
precision, and benchmarks without a balanced safe class cannot observe this at
all.

Third, we show the defect is fixable in the aggregation rule rather than the
models. Replacing the OR-gate with a confidence-thresholded noisy-OR reduces the
false-alarm rate from 66% to 28% and raises F1 from 0.696 to 0.787 on held-out
data (10 stratified splits), requiring no additional inference. A per-class
reliability-weighted variant was also evaluated and did NOT improve on the plain
threshold, so we report the simpler rule. We further find that adversarial
LLM-as-judge arbitration — the standard precision mechanism for such systems —
does not pay for itself: as a binary gate it destroys 71% of true positives, and
in calibrated form it yields no measurable gain (+0.003 F1).

Finally, we document eight silent failure modes encountered while building the
evaluation harness, each of which produced plausible-looking but invalid metrics,
and each of which biased results in a consistent direction. We give the
invariants that make them fail loudly instead. Our artifacts, checkpoints and
decision log are released in full.

## 2. Introduction

Automated smart-contract auditing is a natural target for LLM ensembles: the
vulnerability classes are well enumerated (reentrancy, access control,
arithmetic, oracle manipulation), the artifact under test is short source text,
and a missed bug is expensive. A recurring architecture is the *council* — one
specialist agent per vulnerability class, each pinned to a different base model
for diversity, aggregated into a single go/no-go verdict.

Reported results for such systems emphasise recall. That emphasis is an artifact
of the benchmarks: the standard corpora in this area (SmartBugs-Curated,
Web3Bugs) consist almost entirely of known-vulnerable contracts, so precision is
mechanically 1.0 whenever recall is non-zero and a false-alarm rate cannot be
computed at all. A tool that flags everything scores perfectly.

We evaluate on a balanced benchmark with a genuine safe class and find that the
council's headline recall (0.93) coexists with a 64% false-alarm rate on
audited, widely-used code including OpenZeppelin and Solady. We then show this is
not a tuning problem. The aggregation rule is a logical OR over k independent
detectors, so contract-level false positives compound with k by construction —
and we measure exactly that. The fix is therefore in the aggregation, not the
prompts or the models, and we show a rule change that halves the false-alarm rate
at zero additional inference cost.

A secondary contribution is methodological. Building the harness surfaced eight
distinct defects that each produced *plausible* metrics from a broken pipeline —
a missing pinned model that let a half-dead council record clean passes, a
provider quota drain checkpointed as a deterministic result, an arbiter
configuration that silently fell back to a weaker local judge. Every one of them
biased results in a single direction. We report them, with the invariants that
convert each into a loud failure, because we believe they are common to this
class of system and largely absent from its literature.

## 3. Method

Pipeline (`services/pipeline.py::run_thirdeye`):

```
static router  ->  model-diverse council  ->  per-finding evidence gate
               ->  adversarial arbitration ->  GO / NO-GO / INCONCLUSIVE
```

- **Router** (`services/router.py`) selects relevant specialists from static and
  lexical features rather than firing all eight; logic classes always run,
  because static analysis cannot see logic bugs.
- **Council** (`services/council.py`): eight single-class OWASP/DASP
  specialists, each pinned to a base model. Local tier: qwen2.5-coder:7b,
  llama3.2:3b, gemma3:4b (three families). Hosted tier: Cerebras gpt-oss-120b.
- **Evidence gate:** a finding whose `evidence_quote` does not appear verbatim
  in the source is discarded before aggregation.
- **Arbitration** (`services/arbitration.py`): per finding, a red-team model
  argues false-positive, then a judge rules under an evidence rubric.
- **Fail-closed:** if >50% of specialists error, the verdict is INCONCLUSIVE,
  never GO. An abstention is not an all-clear.

## 4. Evaluation

### 4.1 Benchmark

`smartcontract-datasets/`: 2,250 scored contracts, balanced 1,125 safe : 1,125
vulnerable, across six trust tiers — three safe (audited libraries, audit-
reviewed clean, real-world no-bug-reported) and three vulnerable (curated,
injected, real audit-report findings). The balanced SAFE bucket is what makes
false-positive rate measurable at all; the all-positive benchmarks common in
this literature make precision mechanically 1.0 whenever recall > 0.

Sampling is stratified and **nested**: shuffle once under a seed, take a prefix,
so N=10 ⊂ N=25 ⊂ N=50 per tier and a small run extends into a larger one without
discarding work or changing which contracts are covered.

### 4.2 Main result (local council, no arbitration, n=232)

| slice | n | TP | FP | TN | FN | precision | recall | F1 |
|---|--:|--:|--:|--:|--:|--:|--:|--:|
| Vulnerable tiers | 108 | 100 | 0 | 0 | 8 | 1.000 | **0.926** | 0.962 |
| Safe tiers | 124 | 0 | **79** | 45 | 0 | — | — | — |
| Overall | 232 | 100 | 79 | 45 | 8 | 0.559 | 0.926 | 0.697 |

Zero abstentions across all 232.

Recall across three independent sample sizes: n=40 -> 0.850, n=121 -> 0.868,
n=232 -> 0.926. The false-positive rate is likewise stable (60% / 65% / 64%).
Neither number is an artifact of a small draw.

Context (NOT head-to-head — different datasets):

| system | recall | cost |
|---|--:|---|
| Static tools (Slither/Mythril), ACToolBench | 0.05 | free |
| GPTScan (ICSE'24), Web3Bugs | 0.833 | paid GPT |
| GPT-4o-mini, real-world AC | 0.90 (~951 FPs) | paid |
| **This work (local, free)** | **0.926** | **$0** |

**Honest reading:** recall is competitive; the **64% false-positive rate**
(79/124) on audited-safe code is disqualifying for a deployment claim on its own.
The 95% CI at n=68 is roughly 53-76% — precise enough to be a real problem, not
a small-sample artifact. Note the GPTScan/GPT-4o-mini rows are on DIFFERENT
datasets and are context only; the one head-to-head we actually ran is §4.3.

### 4.3 Head-to-head vs Slither on IDENTICAL contracts

Same benchmark, same ground truth, same nested sample. Slither verdict rule:
NO-GO iff ≥1 High/Medium-impact detector fires. Contracts that fail to compile
are abstentions, not silent passes.

**Coverage — the headline of this subsection:**

| tool | scored | abstained | coverage |
|---|--:|--:|--:|
| ThirdEye council | 121 / 121 | 0 | **100%** |
| Slither | 46 / 150 | 104 | **31%** |

Slither's abstentions are **not random**. It compiled 36/75 vulnerable contracts
(old, simple SmartBugs/SolidiFI files) but only 10/75 safe ones (large modern
OZ/Solady requiring exact solc versions). Any recall figure reported for a
static analyser on a corpus like this is therefore computed on a subset
selected for being easy to compile — a bias we have not seen stated in
comparable evaluations. The council reads source directly and needs no
compilation, so it has no such subset.

**On the 29 contracts both tools scored:**

| tool | precision | recall | F1 | FPR (safe) | tp/fp/tn/fn |
|---|--:|--:|--:|--:|---|
| ThirdEye council | 0.840 | **1.000** | 0.913 | 0.500 | 21/4/4/0 |
| Slither | **0.947** | 0.857 | 0.900 | **0.125** | 18/1/7/3 |

Honest reading: **F1 is effectively tied.** The council trades precision for
recall and coverage; Slither trades recall and coverage for precision. Neither
dominates. This is a trade-off characterisation, not a victory — and it is a
more useful result than a contested win, because it tells a practitioner which
tool fits which position in a pipeline (council as a high-recall pre-filter,
static analysis as a low-noise gate).

### 4.4 Arbitration as a precision gate — NEGATIVE RESULT

Every council NO-GO re-adjudicated by red-team + judge (Cerebras gpt-oss-120b),
n=29 contracts:

- False positives corrected: **9/12 (75%)**
- True positives destroyed: **12/17 (71%)**

The gate drops findings at essentially the same rate regardless of whether they
are real. Net effect on the full benchmark:

| config | FPR (safe) | precision | recall | F1 |
|---|--:|--:|--:|--:|
| council only | 60% | 0.586 | 0.850 | **0.694** |  <!-- n=40 subset matching the arbitrated set -->
| council + arbitration | 15% | 0.625 | 0.250 | **0.357** |

Arbitration buys a 45-point FPR reduction for a 60-point recall loss, halving
F1. **As a binary gate it is harmful.** We attribute this to the judge rubric's
"default to not-a-bug on credible doubt" instruction combined with a red-team
that always argues false-positive: the judge is systematically over-conservative
and is not discriminating between real and spurious findings.

**Follow-up (in progress, §4.5):** the judge emits a `calibrated_confidence`
that the binary gate discards. Treating it as a score and sweeping a threshold
converts one bad operating point into a precision-recall curve.

### 4.5 Per-class calibrated aggregation — THE PROPOSED METHOD

The council verdicts NO-GO if ANY specialist yields a surviving finding: a
logical OR over k detectors, so contract-level FP grows with k by construction.
Measured (n=121): FP rate 50% -> 61% -> 71% -> 73% as the router selects 1..4
specialists. Separately, per-class precision ranges from 0.00 (business_logic,
0/18) to 0.50 (reentrancy) while all classes are weighted equally.

Proposed replacement:

    risk = 1 - PROD_i ( 1 - w_class(i) * conf_i )      NO-GO iff risk >= tau

w_class is a Laplace-smoothed per-class reliability fit on a DEV split; tau is
swept on dev and applied once to a disjoint TEST split. Setting all w=1 and
tau->0 recovers the current OR-gate exactly, so the baseline is a special case
of the method and the comparison is apples-to-apples by construction.

**Result (n=86 scored, 10 random stratified dev/test splits, mean +/- std):**

| config | precision | recall | F1 | FPR (safe) |
|---|--:|--:|--:|--:|
| OR-gate (current) | 0.477 +/- 0.025 | **1.000** +/- 0.000 | 0.646 +/- 0.023 | 0.652 +/- 0.063 |
| **weighted noisy-OR** | **0.642** +/- 0.064 | 0.794 +/- 0.132 | **0.703** +/- 0.062 | **0.270** +/- 0.092 |

Weighted aggregation wins on F1 in **8/10 splits**. The false-positive rate on
audited-safe code falls from 65% to 27% — a 58% relative reduction — at a cost
of ~21 points of recall.

**Honesty checks performed.** (a) Fitting weights AND reporting on the same data
gives F1 0.771 vs 0.765 held out on the same split — the near-identical values
indicate the weights generalise rather than memorise. That inflated row is
reported alongside, never in place of, the held-out one. (b) Laplace smoothing
(alpha=1) prevents a class scoring 0/18 from collapsing to weight exactly zero,
which would be an overconfident conclusion from 18 samples. (c) Recall variance
(+/- 0.132) is high and is the weakest part of the result.

**Limitation:** n=86 (43 dev / 43 test per split). Phase D extends this to 300.

### 4.6 Calibrated arbitration — the mechanism was fine, the decision rule was not

Binary arbitration (Sec 4.4) destroyed 71% of true positives. But the judge also
emits a confidence, which the binary rule discards. Converting it to a monotone
score (p_real = conf if "real" else 1-conf) and thresholding instead:

| config | FPR (safe) | precision | recall | F1 |
|---|--:|--:|--:|--:|
| council only | 0.634 | 0.537 | 0.935 | 0.682 |
| binary arbitration (Sec 4.4) | 0.15 | 0.625 | **0.250** | 0.357 |
| **calibrated, tau held out** | 0.422 | 0.617 | 0.863 | **0.719 +/- 0.026** |

At n=231 benchmark / n=119 arbitrated this improved F1 in 10/10 splits
(median tau 0.85). **It did not survive scale-up.** Re-measured on the full
n=232 benchmark with 100% of NO-GO contracts arbitrated (179/179):

| config | FPR (safe) | precision | recall | F1 |
|---|--:|--:|--:|--:|
| council only | 0.645 | 0.558 | 0.935 | 0.699 |
| calibrated, tau held out | 0.545 | 0.586 | 0.879 | 0.702 +/- 0.024 |

**6/10 splits, F1 +0.003 — no meaningful effect.** The selected threshold
collapsed from tau=0.85 to tau=0.05, i.e. the sweep's own answer became "keep
almost everything", which is council-only behaviour. The earlier 10/10 was a
small-sample result that did not generalise.

Reported here rather than dropped: an intermediate result that reverses under
more data is exactly what a decision log exists to capture, and the reversal is
itself evidence for the paper's thesis about how easily LLM-pipeline
evaluations mislead.

### 4.7 Which fix to actually use

Final, both on the SAME n=232 benchmark, both held out over 10 splits:

| method | FPR | F1 | extra LLM calls | wins |
|---|--:|--:|--:|--:|
| OR-gate (current) | 0.655 | 0.696 | 0 | — |
| **weighted noisy-OR** | **0.298** | **0.771** | **0** | **9/10** |
| calibrated arbitration | 0.545 | 0.702 | 2 per finding | 6/10 |

**The cheap fix wins.** Reweighting the council's own findings by per-class
reliability halves the false-alarm rate at zero additional inference cost, and
beats adversarial arbitration with a 120B judge on both FPR and F1. The
practical recommendation is therefore NOT to buy the expensive precision
mechanism.

Both rows are now computed on the identical benchmark, so this is a controlled
comparison rather than a directional one. Adversarial arbitration with a 120B
judge — two extra large-model calls per finding — produces no measurable gain
(+0.003 F1, 6/10 splits). Reweighting the council's own outputs, at zero
inference cost, halves the false-alarm rate (+0.075 F1, 9/10 splits).

p_real = conf if judge ruled "real" else 1 − conf; a contract is NO-GO iff any
finding scores ≥ τ. Early scores on safe contracts are low (0.04–0.18), which
is the separation the sweep needs.

Resolved (n=233 scored, 185 arbitrated). The in-sample optimum is τ=0.15 at F1
**0.711** against a council-only **0.699** — but that τ was chosen on the same
data it is scored on, so it is not reportable and we do not report it as a
result. Held out over 10 disjoint splits:

| | baseline | calibrated gate |
|---|--:|--:|
| F1 | 0.706 | **0.705** ± 0.020 |
| false-alarm rate (safe tiers) | 0.639 | **0.532** |
| splits won | — | 4 / 10 |

**No τ beats the baseline on held-out F1**, and the gate wins fewer than half
the splits, so the difference is not distinguishable from noise. §4.4 therefore
stands as a clean negative result and Framing A does not return.

The one real effect is on the false-alarm rate, which falls 0.639 -> 0.532. It
does not reach F1 because the recall it costs cancels the precision it buys.
That is worth stating precisely because it is the trap this paper is about: a
gate that visibly "reduces false positives" while delivering no net gain would
read as a success in any evaluation that reported only the FPR column.

### 4.8 Deployment gap: the measured rule must be the shipped rule

An independent precision review found that the result in Sec 4.5 was not
implemented in the tool. The threshold rule existed only in the evaluation
harness; `council.py` shipped a per-finding confidence floor followed by an
OR over survivors, which is that rule at tau -> 0. The reported false-positive
reduction was therefore a property of an offline script, not of the artefact.

We ported it and verified faithfulness by replaying every scored checkpoint
through the production function:

| rule | FPR | recall | F1 |
|---|--:|--:|--:|
| OR-gate (previously shipped) | 63.7% | 0.927 | 0.699 |
| pooled risk >= tau=0.925 (now shipped) | 28.2% | 0.844 | 0.780 |

We flag this as a general hazard for work of this kind: when the evaluation
harness re-implements the decision rule rather than calling the product's own,
the two can diverge silently and the paper measures something the system does
not do. Our mitigation is that the shipped `_contract_risk` mirrors the offline
`risk()` exactly, including its handling of a missing confidence, so any future
divergence is a code change rather than an oversight.

### 4.9 Suppression levers: overlap, and a scoring artefact

The same review proposed structural suppressions (stateless-library gating,
per-class preconditions) and a severity policy as further "recall-safe" wins,
each sized against the 64% baseline. Measured individually on top of the
threshold, they are not free:

| lever | FPR | recall | F1 |
|---|--:|--:|--:|
| threshold only | 28.2% | 0.844 | 0.780 |
| + stateless/library gate | 27.4% | 0.835 | 0.778 |
| + reentrancy / proxy preconditions | 28.2% | 0.844 | 0.780 |
| + dos_gas precondition | 27.4% | 0.807 | 0.762 |
| + severity policy | 25.0% | 0.789 | 0.761 |

Two lessons. First, **precision levers overlap**: the threshold already removes
44 of the 79 false alarms, including most of the pure-library cases the
stateless gate targets, so per-lever estimates made against the original
baseline substantially overstate their marginal value. Sizing interventions
against the *current* baseline, not the original one, is the correct practice.

Second, a **scoring artefact**: the `dos_gas` precondition cost four true
positives to remove one false alarm. The contracts it silenced are genuinely
vulnerable, but not to denial-of-service — the finding had been counted correct
because scoring is contract-level. Contract-level scoring credits
right-verdict/wrong-reason detections, which inflates any per-class reliability
analysis derived from it, including our own Sec 4.5 weights. This is a limitation
of the standard evaluation protocol in this area, not only of our system.

Final shipped configuration (n=233): FPR **26.6%**, recall **0.835**, F1
**0.781**, against 63.7% / 0.927 / 0.699 before.

### 4.10 Hardware feasibility (negative result, worth reporting)

A model-diverse council is not deployable on consumer hardware. On an RTX 3050
laptop (4GB VRAM, 15.7GB RAM):

- Only one model is GPU-resident at a time; every other model runs CPU-only.
  Measured: GPU-resident model 55–75s/call, non-resident 224–270s/call —
  *independent of model size* (the 2.0GB model was slower than the 4.7GB one
  when the latter held the GPU).
- Model switching costs 72–229s. Grouping specialists by model (one batch per
  model) cuts a contract from N reloads to one per distinct model.
- A judge capable of adjudicating does not fit: `llama3.1:8b` dropped 4/4
  findings, `qwen3:8b` upheld 4/4 — neither discriminates, while the 120B
  hosted judge collapsed 5 over-flags to 1.

**Implication:** the "free/local" selling point of model-diverse councils has a
hardware floor that published work does not report.

### 4.10b Result at scale, and the shape of the label-trust effect

The n=233 configuration above was extended to **n=1,154 scored contracts** (603
safe, 551 vulnerable). All figures here are under the **shipped** rule (noisy-OR,
tau=0.925) replayed over every checkpoint, not the historical OR-gate under which
the checkpoints were originally recorded — quoting the latter would advertise a
false-alarm rate the tool no longer has, which is the §4.8 failure mode.

| | shipped rule, n=1,154 | 95% Wilson |
|---|--:|---|
| false-alarm rate (safe) | **29.9%** | [26.3, 33.6] |
| recall (vulnerable) | **0.808** | [0.773, 0.838] |
| precision | 0.712 | |
| F1 | 0.757 | |

Per safe tier, ordered by how much the "safe" label can be trusted:

| safe tier | n | FPR | 95% Wilson |
|---|--:|--:|---|
| Audited libraries (OZ/Solady) | 172 | **15.7%** | [11.0, 21.9] |
| Audit-reviewed, clean | 240 | 37.5% | [31.6, 43.8] |
| Real-world, no bug reported | 191 | 33.0% | [26.7, 39.9] |

**The effect is two-level, not a monotonic gradient**, and we state it that way.
Audited libraries separate cleanly from both weaker tiers; the two weaker tiers
have overlapping intervals and are **not** distinguishable from each other. An
earlier version of this work described a three-step gradient; at n=233 the
per-tier intervals were roughly +/-13 points and overlapped almost completely, so
that ordering was not supported by the data and is withdrawn.

The direction still carries the argument: false alarms concentrate where the
"safe" label is weakest, which is what a label-noise account predicts and what
§6 quantifies by hand-review.

### 4.11 Head-to-head vs GPTScan on IDENTICAL projects

GPTScan (ICSE'24) publishes per-project true/false positive and negative counts
for the 72 Web3Bugs projects it evaluated (the subset of the Code4rena corpus
that compiles directly, carrying 48 ground-truth logic vulnerabilities in its
scope). Aggregating that artifact reproduces the published table exactly —
tp 40, fp 30, tn 154, fn 8 over 232 counts, giving precision **57.14%**, recall
**83.33%**, F1 **67.8%** — which establishes the file is the right one. The
precision figure is the one their abstract does not lead with.

**Their unit, in their own words**, is scored at the function level *for each
tested vulnerability type*: "if a project tested five vulnerability types, each
would contribute one count". A count is therefore a project x rule-check, not a
project and not a contract.

**Their definition of a true negative is what licenses the subset below**: a TN
is a tested type that *lacks a corresponding ground-truth vulnerability in that
project*. So a project with `tp = 0` and `fn = 0` had nothing of the relevant
type to find. This is their definition, not our inference.

Because the file is per-project, it supports a real head-to-head rather than the
side-by-side of two different corpora that §6 rightly calls context. We hold
source for 63 of the 72.

**The unit conversion, and the trap in it.** GPTScan's unit is a project x rule
check; ours is a project-level decision. Collapsing theirs to ours — detected if
`tp > 0` — is the only way to compare them, but done naively it is wrong: **34 of
the 72 projects carry `tp = 0` AND `fn = 0`**, meaning GPTScan's ten rule types
had no applicable check to run there at all. Scoring those as misses is scoring a
tool on questions it was never asked, and it drags its apparent detection rate
from ~91% to ~49%. We therefore compute detection only over projects where
GPTScan had a ground-truth positive to find.

| on 34 gradable projects | detected | 95% Wilson |
|---|--:|---|
| ThirdEye | 33/34 | 97.1% [85.1, 99.5] |
| GPTScan | 31/34 | 91.2% [77.0, 97.0] |

**The intervals overlap: no detection difference is demonstrated.** We report
this as the result. A gap claimed across overlapping intervals is precisely the
inference this paper objects to elsewhere, and claiming one here would forfeit
the argument.

Two asymmetries remain, both favouring us, and both are stated rather than left
for a reviewer to find: our detection is any-slice-positive and is **not**
type-matched, whereas their true positive is; and collapsing to `tp > 0` hides
their per-check misses inside projects both tools detect. Our rate is an upper
bound against their lower bound.

**The remaining difference is scope, and it is not a defect of theirs.** The 29
excluded projects each carry a confirmed Web3Bugs S-class bug outside GPTScan's
rule set, so it has no applicable check; ThirdEye returns a verdict on all 29.
This is a coverage property and is never merged into the recall figure — on an
all-positive set an any-slice flag is nearly free.

It must also be attributed honestly. GPTScan targets **ten DeFi logic types**
(Approval Not Cleared, Risky First Deposit, Price Manipulation by AMM, Price
Manipulation by Buying Tokens, Vote Manipulation by Flashloan, Front Running,
Wrong Interest Rate Order, Wrong Checkpoint Order, Slippage, Unauthorized
Transfer) and **deliberately excludes reentrancy and integer overflow**, on the
stated premise that existing pattern-based tools already handle those and that
~80% of Web3 bugs cannot be audited by them. Its narrower project coverage is a
design decision in service of that premise, not a shortfall against ours. We
therefore report the gap as **a difference in target population**, not as a win:
our taxonomy is broader, which is a different claim from being better at the
task GPTScan set itself.

**Precision is not computable for us on this bucket**, because every project in
it is positive. GPTScan's 0.571 and our **29.9%** [26.3, 33.6] false-alarm rate
on the balanced tiers (shipped rule, n=1154) come from different negative sets
and are not differenced. The honest
summary is: comparable detection where both tools apply, on roughly twice the
applicable projects, at a false-alarm cost we measure and they do not have to
pay.

## 5. Silent failure modes (the core contribution of Framing B)

Seven defects found in one system, each of which produced *plausible* metrics.
Directional bias is what makes them dangerous: none produced obvious garbage.

| # | Defect | Effect on reported metric |
|---|---|---|
| 1 | Pinned specialist model absent; at exactly 50% errored the `>50%` fail-closed rule does not trip | Half-dead council records clean **GO**. 1,152-contract run invalidated; median latency ~1s was the only tell |
| 2 | Partial-council results treated as terminal | 32/198 rows had errored specialists — **100% of them GO**. A dead specialist can only fail to raise a flag, never raise a false one, so the bias is one-directional: inflates safe-tier accuracy, deflates recall |
| 3 | Provider quota drained mid-run → cascade to INCONCLUSIVE, checkpointed as terminal | Bakes a transient outage permanently into recall; resume skips those contracts forever |
| 4 | Arbitration silently defaulted to a hosted backend whenever a key existed | A run invoked as `backend="ollama"` made hosted 120B calls; the "local tier" was not local |
| 5 | Arbiter config keyed on names the caller never passes (`hosted_fast` → `.get()` fallback) | Hosted run adjudicated by a local 8B judge that upheld 100% of findings. Precision collapsed to 0.094 and looked like a real finding |
| 6 | Subsampling by `items[:N]` | Filename order clusters by source project; the "sample" was 263 consecutive OpenZeppelin files. No CI computed from it is valid |
| 7 | Health probe timeout shorter than a cold model load (60s vs 90–230s) | Aborts a healthy backend; encourages re-runs that mask real failures |

### 5.1 Proposed invariants

1. **A verdict is terminal only if the whole council ran.** Any errored
   specialist ⇒ non-terminal, retried, quarantined for diagnosis.
2. **Transient ≠ deterministic.** Provider failures must never be checkpointed
   as results. Park them separately; exclude from scoring; retry on resume.
3. **Every stage records the backend and model it actually used**, not the one
   it was configured with. Defects 4 and 5 were invisible in the output.
4. **Config lookups must not silently fall back.** Fail loudly on an unknown
   key; a wrong-but-plausible default is worse than a crash.
5. **Samples must be nested and seeded**, so extending a run cannot silently
   change the population.
6. **Probe timeouts must exceed worst-case cold start**, measured not assumed.

## 6. Threats to validity

**The false-alarm rate is an UPPER BOUND on tool error, not a measure of it.**
"Safe" in this benchmark means *no vulnerability has been reported*, not *no
vulnerability exists*. We inspected the 79 safe-labelled contracts the tool
blocked. Structurally, 12 (15%) are pure libraries — `library` declarations whose
functions are all `internal`/`pure`/`view`, holding no state and controlling no
value. These cannot be exploited as written and are unambiguous tool errors.

We then reviewed a random sample of 20 of the 79 (seed 2026; full table in
`docs/FP_REVIEW_SAMPLE.md`), classifying each from its externally-callable
surface. **14/20 (70%) are unambiguous tool errors** — canonical OpenZeppelin and
Solady components with correct guards, pure rendering/formatting libraries, and
contracts with no external state-changing surface at all. **4/20 could not be
settled without a full read.** **2/20 expose externally-callable state-changing
functions (`mint`/`burn`; `withdraw`/`withdrawTo` on a bridge) with no visible
authorisation** and are candidate real defects in contracts the dataset labels
safe. A separately hand-read contract,
`TwoKeyDeepFreezeTokenPool.setInitialParams`, is `public` and guarded only by
`require(initialized == false)` with no authorisation on the first caller — the
classic unprotected-initializer pattern — in a contract also labelled safe.

Two conclusions, of differing strength. The strong one: **the false-alarm rate is
predominantly genuine**, not an artifact of label noise — roughly 70% of blocked
safe contracts are real tool errors, so the precision problem this paper
identifies is real. The weaker, directional one: **a non-trivial tail is label
noise**, so the measured rate is an upper bound on tool error. At 2-3 candidates
in 21 inspected we state the direction and decline to quote a correction factor;
establishing one requires expert review of a larger sample and is the highest-
value piece of remaining work.

We note explicitly that a purely lexical scan for "unguarded" entrypoints
substantially overcounts: it cannot see OpenZeppelin's `initializer` modifier,
in-body `require(msg.sender == ...)` checks, `onlyRole(getRoleAdmin(role))`, or
Solidity 0.4-era `constant` getters. At least 5 of the 20 sampled contracts were
misread by such a scan, which is why we report the manual classification and the
narrow structural figure (15% pure libraries) rather than a lexical estimate.

**Sample size.** n=232 scored (124 safe / 108 vulnerable), zero abstentions. The
Slither head-to-head rests on the 29 contracts both tools scored — the weakest n
in the paper.

**Seeds.** All headline numbers are seed 0. Splits are repeated (10 stratified
dev/test partitions with mean±std), which addresses data-split variance but NOT
model-sampling variance. Runs at seeds 1-2 are incomplete at the time of writing.

**Single dataset.** Every result is on one benchmark, assembled from public
corpora. External validity to other contract populations is unestablished.

**Single hardware profile.** The feasibility findings (§4.4) are specific to a
4GB-VRAM consumer GPU. They bound what that class of machine can do; they say
nothing about a datacentre deployment.

**Dataset non-equivalence.** The GPT-4o-mini figures are from another paper on
another corpus under its own protocol, and are context only. Two comparisons in
this paper ARE like-for-like: Slither on identical contracts (§4.3), and GPTScan
on identical projects (§4.11), the latter using the authors' own published
per-project results. The aggregate GPTScan row quoted elsewhere in §4 remains
context, and should not be read as the head-to-head — the two use different
units and different project sets.

**Threshold selection.** τ is chosen on a dev split and applied once to a
disjoint test split, averaged over 10 partitions. We additionally report the
fit-on-everything number so the inflation from selecting on the evaluation set
is visible rather than assumed.

**Context truncation silently removed a quarter of the corpus from view.**
Every result in this paper was produced with the local backend's context window
at 4096 tokens. A longer prompt is not rejected: it is truncated, and the
specialist then judges a fraction of the contract while returning a verdict
formed as though it had seen all of it. The backend's own token accounting
confirms the loss — one identical prompt evaluated **2,050** tokens at the 4096
setting against **9,054** at 32768.

Measured across the benchmark, **540 of 2,250 contracts (24.0%)** build a prompt
that exceeds 4096 tokens (median overflow 1.5x, worst 12.6x). The overflow is
**not class-balanced**: 350 are vulnerable against 190 safe, because real
vulnerable contracts are larger. Truncation therefore suppresses **recall**
specifically — the direction that flatters a paper reporting a false-alarm
problem, which is why we measure it rather than assume it benign.

The effect has two paths. The visible one is abstention: a truncated prompt can
produce unparseable output, which fails closed to INCONCLUSIVE and removes the
contract from scoring — and because the affected contracts are the large ones,
those removals are not random. The quieter one is that a truncated prompt whose
output *did* parse was scored normally, so an unknown share of the reported
numbers rests on partial code.

We flag this as a threat to every rate in §4 and note that the same knob is,
in most published local-LLM evaluations, neither reported nor held constant.

## 7. What is NOT claimed

- Not "beats GPTScan". A head-to-head on 34 identical, gradable projects now
  exists (§4.11) and its confidence intervals OVERLAP, so no detection
  difference is demonstrated. The defensible claim is broader applicability
  at an unquantified precision cost on that bucket, not superiority.
- Not deployable — a 60% FP rate on audited code is not production-ready.
- Dynamic exploit confirmation is scaffold; auto-harness generation for
  arbitrary contracts is an open problem and is off by default.
- Retrieval precedents are surfaced but not injected into specialist prompts,
  so retrieval does not affect verdicts.

## 8. Reproduction

```bash
cd backend
# main benchmark (nested stratified sample)
./venv_win/Scripts/python.exe -m eval.run_benchmark --backend ollama \
    --limit-per-tier 25 --sample-seed 0 --concurrency 1 --no-arbitration
# arbitration precision-gate experiment
./venv_win/Scripts/python.exe -m eval.arbitration_ablation --arb-backend cerebras
# score
./venv_win/Scripts/python.exe -m eval.run_benchmark --backend ollama_noarb --report-only
```

Checkpoints: `backend/eval/checkpoints/`. Invalidated runs are archived, not
deleted, under `_invalid_*/` with the reason in the directory name.
