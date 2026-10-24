# A False-Alarm Rate Is Not a Property of the Tool

### The Same Verdicts, Two Defensible Scores: Four Unreported Choices in LLM Smart-Contract Audit Evaluation

**Umar Ahmed, Anvita Agarwal, Tarun B, V Lakshitha**
Department of Computer Science and Engineering, PES University, Bengaluru, India
`{PES2UG23CS662, PES2UG23CS085, PES2UG23CS644, PES2UG23CS665}`

> **Target:** MSR 2027 Technical Papers. Abstract 20 Oct 2026, full paper 23 Oct 2026, 10 pp + 2 refs.
> **Draft status:** v1, 2026-09-25. Every figure traces to `docs/PAPER_FACTS.md`.
> Author order is a proposal, not a decision — see the note at the end of §11.

---

## Abstract

Reported false-alarm rates for LLM-based security tools are treated as
properties of the tool. We show they are substantially properties of the
benchmark, and that the responsible choices are systematically unreported.

Recent work establishes that scoring *pipelines* move benchmark outcomes in
cybersecurity question-answering, by as much as eighty percentage points. We ask
the same question of a *detection* task, which differs in a way that turns out to
matter: a detection benchmark must **construct a negative class** and **define a
matching rule**, and a question-answering benchmark does neither. Those two
constructions, we find, dominate the numbers.

We build a balanced benchmark of 2,250 Solidity contracts (1,125 safe : 1,125
vulnerable) whose safe class is stratified by *how the safe label was obtained*,
and evaluate a model-diverse LLM council on 1,154 of them. Holding the tool, the
seed, the model digests and the machine fixed, four evaluation choices each move
the headline metric by more than any tool-versus-tool difference we found in the
literature. **The same 1,154 verdicts, scored two defensible ways, yield recall
of 25.5% or 82.2%, and false-alarm rates of 15.7% or 37.5%.** Controlling for
our own coverage gaps, 31.6 points of the recall spread remain attributable to
the scoring protocol alone.

The four choices are: how the safe label was established (false alarms 15.7%
[11.0, 21.9] on audited libraries against 37.5% [31.6, 43.8] on audit-reviewed
code); what counts as a detection (recall 82.2% any-slice against 25.5%
type-matched on 349 labelled contracts; 31.6 points survive on the 187 where
the tool had a specialist for the labelled class); what the model was
permitted to read (a silently truncating context window makes specialist calls
fail outright at 39.1% against 3.2%, *p* < 1e-26, and returns twelve GO
verdicts from councils in which one to three specialists never ran); and which machine
produced the verdicts (0.735 agreement across two hosts on identical inputs, with
batch parallelism excluded by a control, *p* = 0.75).

We report what this costs us. Scored type-matched, our recall falls inside the
band of the static analysers we set out to beat. Our original hypothesis — that a
model-diverse council raises precision — is refuted on the one early corpus with
a negative class. We release the benchmark, per-contract checkpoints for
every run, and a decision log recording each correction made during the work.

---

## 1. Introduction

A paper reporting a new LLM-based vulnerability detector will report a recall and
a false-alarm rate. A reader compares those two numbers against the previous
paper's two numbers and forms a view about which tool is better. This comparison
is close to meaningless, and the reason is not that the tools are similar.

Consider two figures from the literature, both verified against their source
papers. GPTScan [1] reports a 4.39% false-alarm rate on a curated set of
non-vulnerable contracts. Heimdallr [4] measures **the same tool** at 97.50% on
real audit-contest projects. Twenty-two-fold, with no change to the tool. The
difference lies entirely in which contracts were designated "not vulnerable."

Now consider the most-cited low-false-positive figure in the field: Slither's
10.9% [2]. Read the denominator. It is the share of *flagged* contracts that
manual review found wrong — one minus precision — established by sampling at
least fifty flagged contracts, on the reentrancy detector alone, with no
true-negative set at all. It is not FP/(FP+TN), and it cannot be converted into
one from the published data. It is nonetheless the number LLM tools are
informally held against.

Recent work by Berriche et al. [6] shows that this is not peculiar to smart
contracts: across eight cybersecurity benchmarks and ten models, a single
scoring-pipeline choice can move a model's score by more than eighty percentage
points. Their taxonomy of fifteen failure modes covers stop-sequence handling,
extractor divergence, token budgets and aggregation order.

Every benchmark in that study is question-answering. **A multiple-choice question
cannot produce a false alarm.** Their failure modes are therefore bugs in the
plumbing around a task whose ground truth is given. A detection benchmark is a
different object: it must *construct* the class of things that are not bugs, and
it must *decide* what it means to have found one. Neither construction has a
correct answer, both are usually unreported, and — we find — both move the
headline further than the tool does.

**This paper.** We build a detection benchmark designed so those two
constructions can be varied and measured rather than assumed, and we run four
controlled experiments on one corpus with one tool.

**RQ1.** Does the *provenance of the safe label* change the false-alarm rate?
**RQ2.** Does the *matching rule* change recall?
**RQ3.** Does what the model was *permitted to read* change measured performance?
**RQ4.** Does the *execution environment* change the verdicts themselves?

**Contributions.**

1. A balanced 2,250-contract Solidity benchmark whose negative class is
   stratified by label provenance — to our knowledge the first that permits a
   false-alarm rate to be decomposed by how much the "safe" label can be trusted.
2. Four controlled measurements on one corpus, each isolating a single
   evaluation choice, with paired statistics where the design is paired.
3. A protocol-sensitivity result: identical verdicts scored any-slice versus
   type-matched give 82.2% and 25.5% recall. We decompose the 56.7-point spread
   into 31.6 points of genuine protocol effect and ~25 points of our own
   coverage gap, and report both separately rather than claiming the sum.
4. Seven silent failure modes observed during the work, six proposed invariants,
   and a documented instance of our own instrument violating one of them.
5. A released artifact: corpus, loaders, per-contract checkpoints, replay
   tooling, and a chronological decision log.

---

## 2. Background and Related Work

### 2.1 What the standard corpora can and cannot measure

SmartBugs-curated and the Web3Bugs contest corpus are the sets on which recall is
most often reported. Both are **all-positive**: every contract carries a known
bug. Precision computed on such a set is mechanically 1.000 whenever recall is
non-zero, and a false-alarm rate is not defined at all. Our own early runs make
the point concretely — on SmartBugs-curated our council records precision 1.000
and recall 0.881, which says nothing whatever about false alarms.

Durieux et al. [3] is the largest evaluation in the field: nine tools over 47,518
chain contracts and 69 annotated ones, 428,337 analyses, 564 days of compute.
They report that **93% of the wild contracts are flagged vulnerable**, and then —
correctly — go no further than calling this evidence of "a considerable number of
false positives," because the wild corpus is unlabelled. Their annotated set,
where the split would be possible, has 69 contracts and no safe class. One paper,
flag rate without a false-alarm rate and recall without a negative class, not
through any defect of method but because no corpus offered both.

That is the gap this benchmark exists to close.

### 2.2 The claim we are *not* making

Berriche et al. [6] own the general observation that benchmark scores are
pipeline-dependent, and state it more strongly than our data can: swings above
eighty points across eight benchmarks and ten models. Heimdallr [4] owns the
observation that LLM auditors carry catastrophic real-world false-alarm rates.
We take both as premises rather than findings.

Our claim is narrower and, we argue, unclaimed: in a **detection** task, the
construction of the negative class and the definition of the matching rule are
themselves experimental variables of first-order magnitude. Neither exists in the
QA benchmarks Berriche et al. audit. Their "denominator inflation" is a counting
error over attempted versus total questions; ours is a question about what the
denominator of a false-positive rate should *be*.

### 2.3 Positioning table

| prior work | what it establishes | what it leaves open |
|---|---|---|
| GPTScan [1] | logic-vuln detection with GPT + program analysis; FPR on a curated negative set | negative set is one curated slice; 22× gap to [4] unexplained |
| Slither [2] | fast, precise static analysis; 10.9% "false positives" | different denominator (1 − precision), one detector class, no TN set |
| Durieux et al. [3] | 9 tools at scale; 93% flagged; 42% combined detection | negative class unlabelled ⇒ FPR not computable |
| Heimdallr [4] | LLM auditors at 97.5% FPR on contest code | negatives = "not in the report", i.e. absence of evidence |
| COMPSAC'26 [5] | paired safe variants; local 4-bit FPR 34.09%; lexical bias | states "no context-window analysis" as its own limitation |
| Berriche et al. [6] | scoring pipelines move QA scores >80 pp | every benchmark is QA — **no negative class exists** |

---

## 3. Benchmark Construction

The benchmark is the instrument, so its construction is a contribution rather
than a preliminary.

### 3.1 Balance and tiers

2,250 Solidity contracts, balanced **1,125 safe : 1,125 vulnerable**. Both halves
are stratified into three tiers. The safe tiers are ordered by *how much the safe
label can be trusted*:

| tier | n (scored) | how "safe" was established |
|---|--:|---|
| Audited libraries | 172 | OpenZeppelin / Solady — heavily reviewed, widely deployed |
| Audit-reviewed, clean | 240 | in a published audit's scope, no finding filed against it |
| Real-world, no bug reported | 191 | deployed, no public report — *absence of evidence* |

| tier | n (scored) | how "vulnerable" was established |
|---|--:|---|
| Curated | 214 | SmartBugs-style annotated vulnerabilities |
| Injected | 170 | a known bug deliberately introduced |
| Audit-report findings | 167 | a real finding from a published audit |

The safe tiers are the novel part. Tier 1 is as close to ground truth as this
domain offers; tier 3 is an inference from silence. A tool's false-alarm rate is
conventionally reported against whichever of these a paper happened to use.

### 3.2 The negative class is a claim, not a fact

Because tier 3 is absence of evidence, some "false alarms" against it may be real
unreported bugs. We bound this by hand. A random sample (seed 2026) of 20 of the
79 blocked safe contracts, plus one from an earlier read, was reviewed against
each contract's externally callable surface:

| assessment | count | share |
|---|--:|--:|
| clear tool error | 14 | **70%** |
| unclear, needs a full read | 4 | 20% |
| possible real bug in a "safe" contract | 2 | 10% |

So roughly 70% of blocked safe contracts are genuine tool errors, and at most
30% of the false-alarm rate could be label noise. Two contracts —
`w3b_90_indexlogic` and `w3b_68_amunbasket_bridge`, both with unmodified external
`mint`/`withdraw` surfaces — are flagged in the artifact as candidate real
defects in contracts the datasets call safe.

### 3.3 Sampling discipline

Samples are **nested and seeded**: extending a run from *n* to *n′* > *n* yields a
strict superset, so a longer run cannot silently change the population. Every
contract is checkpointed individually, which makes every table in this paper
re-scorable without re-running inference — a property we rely on in §5.2, where a
new result is produced from old checkpoints at zero inference cost.

---

## 4. The Instrument

The tool under measurement is not the contribution, and we describe it only as
far as the experiments require.

**ThirdEye** routes a contract to up to eight single-class specialists
(reentrancy, access control, arithmetic, business logic, oracle/price
manipulation, flash-loan/MEV, DoS/gas, proxy upgradeability), each pinned to a
distinct open-weights base model served locally by Ollama. A finding whose quoted
evidence does not appear verbatim in the source is discarded before aggregation.

**Verdict rule.** Surviving finding confidences are pooled as
*risk* = 1 − ∏(1 − *conf*ᵢ), blocking at τ = 0.925. This matters for reading our
tables, because an earlier rule blocked on *any* surviving finding — the same
rule at τ → 0. Both appear in the artifact and they are never interchanged:

| rule (n = 1,154) | tp/fp/tn/fn | FPR | recall | precision | F1 |
|---|---|--:|--:|--:|--:|
| OR-gate (as recorded) | 498/356/247/53 | 59.0% | 90.4% | 0.583 | 0.709 |
| **noisy-OR, τ = 0.925 (shipped)** | **445/180/423/106** | **29.9%** | **80.8%** | **0.712** | **0.757** |

Across 10 random dev/test splits (n = 233), thresholding wins 9 of 10. Per-class
weighting beats a flat threshold on only 3 of 10, so we attribute the gain to
**thresholding, not weighting**, and report the simpler mechanism.

**Where the council genuinely helps, and where it does not.** On the
access-control slice the council is a clear win over a single LLM. Re-run
2026-10-24 at n = 52 paired contracts sound in all arms (superseding an n = 16
pilot that reported recall 0.125 → 0.750, F1 0.222 → 0.857 and precision 1.000
throughout — the precision figure in particular does not survive the larger
sample):

| arm | precision | recall | FPR | F1 |
|---|--:|--:|--:|--:|
| single LLM | 50.0% | 22.2% | 11.8% | 0.308 |
| council | 58.3% | 77.8% | 29.4% | 0.667 |
| council + arbitration | 92.3% | 66.7% | 2.9% | 0.774 |

The gain is in **recall** (22.2% → 77.8%), not precision (50.0% → 58.3%), which
is the distinction the refutation below turns on. On Etherscan-50, the only other
early corpus with a negative class,
**it loses**: precision 0.067 / recall 0.167, against a single LLM's 0.182 /
0.667 and an LLM+Slither pipeline's 0.140 / 1.000. That corpus has scraped,
noisy ground truth and we weight it accordingly — but the project's original
hypothesis was that a model-diverse council raises **precision**, and on the
available evidence that specific hypothesis is **refuted**. We report it because
a paper about honest measurement that suppressed its own negative result would
be self-refuting.

The scope of that refutation matters, and we state it rather than leave a reader
to find the apparent contradiction. It concerns **precision**: on the
access-control slice the council moves precision only 50.0% → 58.3% while moving
recall 22.2% → 77.8%, and on Etherscan-50 precision is worse than a single LLM's.
What the council buys is recall, reliably and substantially; what it was adopted
for was precision, and that it does not deliver. The mechanism is the same one
either way — §5 shows the council is a logical OR over k detectors, so
contract-level false positives grow as 1−(1−p)^k. Model diversity is
simultaneously what buys the recall and what destroys the precision; they are not
separable by prompt tuning, only by the aggregation rule.

> **RETRACTED 2026-10-23 — this result was an artifact of our own harness and
> is being re-measured.** We previously reported that adversarial LLM-as-judge
> arbitration wins **4 of 10** held-out splits — no gain. That number was
> produced by a judge that never answered. `LOCAL_JUDGE_MODEL` defaulted to a
> model that was not installed on the evaluation host, every judge call
> returned HTTP 404, and the unparseable-output path **failed open**: it
> returned `verdict="real", upheld=True, confidence=0.4`. All 234 findings
> received an identical verdict, identical confidence, and were upheld
> unconditionally, so arbitration dropped nothing and "no gain" was true by
> construction rather than by measurement. Nothing in the output distinguished
> this from a judge that had adjudicated and agreed.
>
> **Re-measured on 280 contracts with a working judge, the original conclusion
> holds.** Precision moves 49.6% → 52.9% (+3.3 points) while 83% of findings
> are dropped, recall falls 93.6% → 32.9%, and FPR falls 95.0% → 29.3%. The
> mechanism is emphatically *not* a no-op — it is the single largest
> intervention we measure — but it does not buy precision, which is the
> property it was adopted for. The retraction is therefore a correction of
> method, not of conclusion: the earlier number was unearned, and it was also
> approximately right.
>
> On a second corpus the same mechanism behaves differently: in the
> access-control ablation (n = 52) precision moves 58.3% → 92.3%. Same judge,
> same code, +34 points on one corpus and +3.3 on another. We report the
> disagreement rather than the flattering half of it. The fail-open behaviour itself is correct for a security
> tool — a judge that cannot be reached must not silently delete a candidate
> bug — but it was indistinguishable from a verdict, and that is the defect.
> Findings now carry `judge_ok`, so a fail-open can no longer be read as an
> adjudication. This is the fifth instance in this project of an unreported
> configuration detail silently converting a mechanism into a no-op while every
> downstream number looked normal, and the fourth found in our own
> infrastructure rather than in the tool under test.

---

## 5. Results

All experiments hold the tool, seed, model digests and (except in RQ4) the
machine fixed. Intervals are Wilson; paired designs use McNemar.

### 5.1 RQ1 — the provenance of the safe label

Same tool, same contracts, same rule. Only the origin of the safe label varies.

| safe tier | n | fp | **false-alarm rate** |
|---|--:|--:|--:|
| Audited libraries | 172 | 27 | **15.7% [11.0, 21.9]** |
| Audit-reviewed, clean | 240 | 90 | **37.5% [31.6, 43.8]** |
| Real-world, no bug reported | 191 | 63 | **33.0% [26.7, 39.9]** |

The effect is **two-level, not a monotonic gradient**. Audited libraries separate
cleanly from both weaker tiers; the two weaker tiers overlap and are not
distinguishable from each other. An earlier version of this work described a
three-step gradient, which the intervals do not support.

**Is this just code complexity?** The obvious confound is that audited libraries
might simply be smaller and simpler than contest code, making the gradient a
statement about contract size rather than label provenance. It is not, and the
data runs the other way:

| safe tier | n | median chars | mean chars | FPR |
|---|--:|--:|--:|--:|
| Audited libraries | 283 | **6,649** | 12,300 | **15.7%** |
| Audit-reviewed, clean | 625 | 3,531 | 7,811 | 37.5% |
| Real-world, no bug reported | 217 | 3,783 | 6,661 | 33.0% |

The tier with the **lowest** false-alarm rate has contracts with nearly **twice
the median size** of the tier with the highest. If surface area drove false
alarms we would observe the opposite ordering. The size confound therefore works
*against* the measured effect, which means the effect of label provenance is if
anything **understated** here.

**The 21.8-point spread between tiers 1 and 2 is larger than the difference
between most published tools.** A paper evaluating only against audited libraries
would report 15.7%; the same tool evaluated against contest code reports 37.5%.

### 5.2 RQ2 — what counts as a detection

Recall requires deciding when a flag *counts*. Two protocols appear in the
literature and neither is usually named:

- **any-slice-positive** — the tool flagged the contract, and the contract
  carries the label. This is what our §4 table and most head-to-head comparisons
  use.
- **type-matched** — the finding that fired must itself name the labelled
  category. This is Durieux et al.'s unit, and GPTScan's.

Re-scoring the same checkpoints through the same shipped rule, changing nothing
but the protocol (denominator: the 349 vulnerable contracts carrying a mapped
DASP-10 label; 202 of the 551 carry none and are excluded):

| protocol | detected | recall |
|---|--:|--:|
| any-slice-positive | 287 / 349 | **82.2%** |
| type-matched | 89 / 349 | **25.5%** |

**A 56.7-point spread with no change to any verdict** — but that figure mixes
two different things, and we separate them rather than claim the sum. The council
has eight roles, five of which map unambiguously onto DASP-10, and **158 of the
349 contracts (45.3%) carry only classes no role covers**. Part of the spread is
therefore *our* coverage gap, not a property of the protocol.

Restricting to the 187 contracts that carry **only** classes for which a
specialist exists — so the tool was genuinely looking for the labelled thing —
isolates the protocol effect:

| set | n | any-slice | type-matched | spread |
|---|--:|--:|--:|--:|
| all labelled contracts | 349 | 82.2% | 25.5% | 56.7 pts |
| **coverage-controlled** | **187** | **77.0%** | **45.5%** | **31.6 pts** |

So roughly 25 points are attributable to our role set and **31.6 points to the
scoring protocol alone**. We take the controlled figure as the paper's claim. It
is still larger than any tool-versus-tool difference we found in the literature,
and it is obtained with the tool held fixed and every verdict unchanged.

The uncontrolled 56.7 points is not discarded — it is the number a reader of our
headline recall would actually be misled by — but it is reported as a *joint*
effect of protocol and coverage, never as protocol alone.

| DASP-10 class | n | any-slice | type-matched | specialist? |
|---|--:|--:|--:|---|
| unchecked low-level calls | 109 | 89.0% | — | **none** |
| reentrancy | 86 | 76.7% | 29.1% [20.5, 39.4] | yes |
| arithmetic | 79 | 77.2% | 62.0% [51.0, 71.9] | yes |
| time manipulation | 40 | 92.5% | — | **none** |
| access control | 17 | 88.2% | 70.6% [46.9, 86.7] | yes |
| denial of service | 8 | 62.5% | 50.0% [21.5, 78.5] | yes |

Our two largest labelled classes have **no specialist at all** and are
nonetheless "detected" at 89.0% and 92.5%. Reentrancy — the class the field has
studied longest — is flagged on 76.7% of its contracts but *named* by the
reentrancy specialist on 29.1%. A separate, earlier two-model council
independently scored recall **zero** on bad randomness (0/8), denial of service
(0/6) and arithmetic (0/15), corroborating the gap on a different run.

We report **[25.5%, 82.2%]** as a bracket rather than either endpoint. 25.5% is a
*lower* bound: only five of eight roles have an unambiguous DASP slot, and we
deliberately refuse to stretch `business_logic`, `oracle_price_manipulation` and
`proxy_upgradeability` into "other," which would manufacture type-matched hits.

**This makes comparison with prior work fair for the first time.** Durieux et
al.'s units are type-matched: nine tools combined reach 42% of 115 tagged
vulnerabilities, the best single tool 27%, and Slither 17%. Our 25.5% sits inside
that band, while returning a verdict on 100% of contracts against Slither's 31%
(§5.5). Reported as 82.2%, the same comparison would have read as a two-fold win
over the entire field combined — an artifact of protocol, not of capability.

### 5.3 RQ3 — what the model was permitted to read

The local runtime truncates any prompt exceeding `num_ctx` **without error**, and
abstentions are excluded from scoring. A misconfiguration therefore *removes
rows* rather than lowering a score. 540 of 2,250 contracts (24.0%) overflow a
4,096-token window, and the overflow is class-skewed — 350 vulnerable against 190
safe, because real buggy contracts are larger.

Paired ablation on identical contracts, 4,096 → 16,384, vulnerable class
(36 paired, 20 scored in both arms):

| | 4,096 | 16,384 |
|---|--:|--:|
| abstention | 44.4% | **0.0%** |
| recall | 12.5% | **81.2%** |
| accuracy | 25.0% | **75.0%** |

McNemar *b* = 2, *c* = 12, ***p*** **= 0.016**. The larger window is also
**4.01× faster** (sign test *p* < 0.0001) — truncation triggers context shifting,
so the misconfiguration cost both accuracy and time while appearing in neither.

**Limitation, stated rather than managed.** The safe-class arm of this experiment
is *not* reported. Our 2026-09-25 run of it was corrupted by a backend outage
that left 145/176 and 108/176 rows as total council failures; only 31 pairs
scored in both arms, and those 31 are whatever ran while the backend was alive.
Consequently **RQ3 is established on the vulnerable class only**, and our 29.9%
headline false-alarm rate may be an under-estimate by an amount this work does
not yet bound. We flag this as the most important open item rather than reporting
a figure from a compromised run.

### 5.4 RQ4 — which machine produced the verdicts

Identical contract ids, seeds and byte-identical model digests, two hosts:

| arm | n | agreement with laptop | acc (DGX) | acc (laptop) |
|---|--:|--:|--:|--:|
| `full3b` (main) | 230 | **0.735** | 0.722 | 0.622 |
| `full3b`, `num_parallel = 1` | 227 | 0.727 | 0.736 | 0.621 |

Roughly one verdict in four flips across machines. A `num_parallel = 1` control
excludes batch parallelism as the cause (paired McNemar *p* = 0.75). Backend and
hardware nondeterminism is documented elsewhere; what we add is its **propagation
to security verdicts**, and therefore to a published rate.

**Capacity is not the lever (negative result).** Restoring a 2.7× larger model on
the three semantic roles — a one-variable change on the same 230 contracts —
*increases* false alarms 49 → 74 (McNemar ***p*** **= 0.00008**) while reducing
misses 15 → 7 (*p* = 0.043), for a net accuracy drop of 0.722 → 0.651. Stronger
associative reasoning reads more benign patterns as vulnerabilities.

### 5.5 Calibration against the literature

| source | rate | negative class | denominator |
|---|--:|---|---|
| GPTScan, self-reported | 4.39% | Top200 non-vulnerable | FP/(FP+TN) |
| Slither, self-reported | 10.9% | *none* — sample of flagged | **1 − precision** |
| **ThirdEye, audited-library tier** | **15.7%** | OpenZeppelin / Solady | FP/(FP+TN) |
| **ThirdEye, overall** | **29.9%** | 603 safe, three tiers | FP/(FP+TN) |
| COMPSAC'26, local 4-bit | 34.09% | paired safe variants | FP/(FP+TN) |
| **ThirdEye, audit-reviewed tier** | **37.5%** | contest code, no bug filed | FP/(FP+TN) |
| GPTScan, measured by Heimdallr | 97.50% | Sherlock contest projects | FP/(FP+TN) |

We do not claim 29.9% is good. We claim it is *interpretable*: it carries a
stated negative class, a per-tier decomposition, a hand-audited label-noise
bound, and intervals.

**Against Slither on 150 identical contracts.** Slither answered 46; ThirdEye
answered 150. Where Slither answers it is **more precise than we are** —
32 tp / 2 fp, a 5.9% false-discovery rate that corroborates the 10.9% its own
paper reports — against our 0.712 precision. Its 104 abstentions were diagnosed
with `solc` directly and **exactly one** was attributable to our toolchain; the
rest are multi-file contest codebases and pragma mismatches. Slither is a
high-precision, low-coverage instrument; we are a moderate-precision,
full-coverage one.

**Against GPTScan on 34 gradable shared projects.** 33/34 against 31/34, with
**overlapping** intervals: no detection difference is demonstrated, and we report
that rather than a win.

---

## 6. Silent Failure Modes

Seven defects found during this work, each of which produced *plausible* metrics
rather than obvious garbage. Directional bias is what makes them dangerous.

| # | defect | effect on the reported metric |
|--:|---|---|
| 1 | pinned model absent; at exactly 50% errored the `>50%` fail-closed rule does not trip | half-dead council records a clean GO; a 1,152-contract run invalidated |
| 2 | partial-council results treated as terminal | 32/198 rows had errored specialists — **100% of them GO** |
| 3 | provider quota drained mid-run, checkpointed as terminal | bakes a transient outage permanently into recall |
| 4 | arbitration silently defaulted to a hosted backend | the "local tier" was not local |
| 5 | arbiter config keyed on names the caller never passes | precision collapsed to 0.094 and looked like a finding |
| 6 | subsampling by `items[:N]` | filename order clusters by project; the "sample" was 263 consecutive files |
| 7 | health-probe timeout shorter than a cold model load | aborts a healthy backend |

**Proposed invariants.** (i) A verdict is terminal only if the whole council ran.
(ii) Transient ≠ deterministic — provider failures must never be checkpointed as
results. (iii) Every stage records the backend and model it *actually used*.
(iv) Config lookups must fail loudly, never fall back. (v) Samples must be nested
and seeded. (vi) Probe timeouts must exceed measured worst-case cold start.

**We then violated invariant (ii) ourselves.** The context-ablation runner —
the instrument measuring RQ3 — wrote rows in which every specialist had errored
into its checkpoint directory, and its resume path returned them verbatim, so a
retry silently reused an outage instead of repairing it. This is the failure
reported in §5.3. We record it because it is the strongest available evidence
that these invariants are not obvious in retrospect: they were written by the
authors, published in a prior draft, and violated in the same codebase.

---

## 7. Threats to Validity

**Construct.** Tier-3 "safe" is absence of evidence. §3.2 bounds this at ≈30% by
hand review, but the bound rests on 21 contracts assessed from externally
callable surfaces, not full reads.

**Internal.** RQ3 is established on the vulnerable class only (§5.3). The
type-matched mapping in RQ2 covers five of eight roles; a more generous map
would raise 25.5%, which is why it is reported as a lower bound and why the
coverage-controlled 31.6-point figure, not the 56.7-point one, is the claim.
The RQ1 gradient is not explained by contract size, which runs opposite to it
(§5.1), but we have not controlled for cyclomatic complexity or external-call
count, either of which could still carry part of the effect.

**External.** One tool, one language, one model family, two machines. The
*mechanisms* — constructed negatives, matching rules, silent truncation,
execution nondeterminism — are not specific to any of these, but the magnitudes
certainly are.

**Statistical.** RQ3 rests on 20 paired contracts and RQ1's smallest tier on 172.
We report Wilson intervals throughout and never Wald, whose width collapses to
zero at the boundaries where several of these rates sit.

---

## 8. What Is Not Claimed

- Not that ThirdEye is a good auditor. A 29.9% false-alarm rate is not deployable
  unattended, and scored type-matched our recall falls inside the band of the
  static analysers we set out to beat.
- Not that the benchmark is representative of all Solidity.
- Not that benchmark scores being configuration-dependent is a new observation —
  Berriche et al. [6] established that, in a neighbouring domain, first.
- Not that our rate is comparable to every figure in §5.5. Two are computed on a
  different denominator, which is why the denominator is printed beside each.
- Not that we beat GPTScan. The head-to-head intervals overlap.

---

## 9. Conclusion

A false-alarm rate is not a property of a tool. In a detection task it is jointly
determined by how the negative class was constructed, what counts as a match,
what the model was permitted to read, and which machine ran it. We measured each
on one corpus with one tool, and each moved the headline further than the
differences the literature currently reports as results. The largest
well-controlled instance is 31.6 points, from a choice that changes no verdict at
all — and even that is measured with the tool's own coverage held constant, so it
is a floor rather than a ceiling.

The practical consequence is a reporting standard, not a better tool: **state the
provenance of your negative class, state your matching rule, state your context
window, and state your hardware.** Absent those four, two reported rates are not
comparable, and the field has been comparing them anyway.

---

## 10. Data Availability

Corpus, loaders, per-contract checkpoints for every run, replay tooling, the
generated results index, and a chronological decision log recording each
correction made during this work are released at
`github.com/tarunb05/ThirdEye`. Every table above is re-scorable from the
committed checkpoints without re-running inference.

Artifact scale: 18,078 lines of source across 61 commits, 42 backend regression
tests pinning the defects in §6, and 3,707 lines of documentation.

---

## 11. References

[1] Y. Sun, D. Wu, Y. Xue, H. Liu, H. Wang, Z. Xu, X. Xie, Y. Liu. "GPTScan:
Detecting Logic Vulnerabilities in Smart Contracts by Combining GPT with Program
Analysis." ICSE 2024.

[2] J. Feist, G. Grieco, A. Groce. "Slither: A Static Analysis Framework for
Smart Contracts." WETSEB@ICSE 2019, pp. 8–15.

[3] T. Durieux, J. F. Ferreira, R. Abreu, P. Cruz. "Empirical Review of Automated
Analysis Tools on 47,587 Ethereum Smart Contracts." ICSE 2020, pp. 530–541.

[4] X. Hu, W. Y. Chan, Y. Shi, Q. Sun, W.-C. Wang, C. Wu, H. Wang, N. He. "An
Effective and Cost-Efficient Agentic Framework for Ethereum Smart Contract
Auditing." arXiv:2601.17833, 2026.

[5] S.-C. Susan, A. Arusoaie, D. Lucanu. "Benchmarking LLM-Based Static Analysis
for Secure Smart Contract Development." IEEE COMPSAC 2026. arXiv:2605.11163.

[6] A. Berriche, C. Shalby, M. Alhanahnah, Y. Boshmaf. "Benchmark Scores Are
Pipeline-Dependent: A Reliability Audit of Cybersecurity LLM Benchmarks."
arXiv:2609.08765, 2026.

[7] Z. Zhang, B. Zhang, W. Xu, Z. Lin. "Demystifying Exploitable Bugs in Smart
Contracts." ICSE 2023. [Web3Bugs]

[8] J. F. Ferreira, P. Cruz, T. Durieux, R. Abreu. "SmartBugs: A Framework to
Analyze Solidity Smart Contracts." ASE 2020, pp. 1349–1352.

[9] D. Pape, J. Evertz, L. Schönherr. "The Silent Hyperparameter: Quantifying the
Impact of Inference Backends on LLM Reproducibility." arXiv:2605.19537, 2026.

---

### Note on authorship

Order above is a **proposal**, not a decision. It reflects the weight each
subsystem carries in *this* paper rather than in the product: Umar ran the
benchmark, the four ablations and the parity study; Anvita built the corpus,
loaders and verifier that make the benchmark a contribution; Tarun built the
council and the verdict rule under measurement; Lakshitha built the grounding,
suppression and delivery path. A tool paper would order these differently.
Settle it among yourselves before submission.
