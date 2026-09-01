# Related work — and an audit of our own novelty claims

**Status: 2026-09-01.** Entries marked **(v)** were cross-checked against the
paper's own text and are cleared for citation: GPTScan, Durieux et al., Slither.
Entries without (v) came from search plus automated summarisation and are
**leads, not citations** — verify before they enter the submission. The
per-entry marking replaces the blanket "verify everything" banner this file
used to carry.

The purpose of this pass was not to pad a related-work section. It was to find
out which of *our* claims survive contact with the literature, because three of
them were stated as "we are not aware of any work that…" and one of those is now
dead.

---

## 1. The papers that matter

### GPTScan — ICSE'24 · [arXiv 2308.03314](https://arxiv.org/abs/2308.03314)

Verified in detail (v). tp 40 / fp 30 / tn 154 / fn 8 = 232 counts on Web3Bugs,
giving precision 57.14%, recall 83.33%, F1 67.8%. Unit is a project × *tested
vulnerability type* at function level. Ten DeFi logic types; reentrancy and
overflow deliberately excluded. 72 Web3Bugs projects that compile directly,
48 in-scope ground-truth vulnerabilities.

Also reports **FPR 4.39% on non-vulnerable Top200 contracts** — i.e. it *does*
have a negative set. This matters for our claim (§3, A).

Our head-to-head sits in §4.11 of the draft.

### Heimdallr — [arXiv 2601.17833](https://arxiv.org/html/2601.17833), Jan 2026

**The most dangerous paper for us.** An agentic Ethereum auditing framework.
Reports, on 30 top-rewarding Sherlock contest projects (𝒟3):

| tool | FPR |
|---|--:|
| GPTScan | **97.50%** |
| LLMSmartAudit | 99.01% |
| Hound | 80.20% |
| Heimdallr (GPT-oss-20B) | 31.27% |
| Heimdallr (Claude-Haiku-4.5) | 49.12% |

Claim: existing tools "exhibit either negligible detection capabilities
(F1 < 0.02) or prohibitive noise levels (FPR > 97%)", i.e. practically unusable.
Reports a 32k token limit, temperature 0.7, top-p 0.9. A stability pilot found
semantic consistency > 0.95 across three iterations — **same machine**, not
cross-platform.

Why it hurts: **"LLM auditors have catastrophic real-world false-alarm rates" is
already published, with harder numbers than ours.** Framing B's headline cannot
be that observation.

Why it helps, and it genuinely does:
- It shows GPTScan at **97.5%** FPR in the field against **57.14%** precision on
  its own benchmark. That gap *is* our thesis, demonstrated by someone else on a
  tool that is not ours. It is the strongest available evidence that benchmark
  numbers do not survive contact with real code.
- Our 29.9% [26.3, 33.6] is in the same band as their own tool (31.27–49.12%),
  and far below the tools they call unusable. Different corpora, so not a
  head-to-head — but it stops "our FPR is embarrassing" being the reading.
- Their negative class is weaker than ours: anything not in the contest report
  is "initially classified as a potential false positive". That is precisely the
  label-noise problem we quantified by hand-reviewing 21 contracts (≈70% genuine
  tool errors). We can say something about our negatives they cannot.

### Durieux et al., "Empirical Review of Automated Analysis Tools on 47,587 Ethereum Smart Contracts" — ICSE 2020 · [arXiv 1910.10601](https://arxiv.org/abs/1910.10601)

Verified against the full text (v). **The single best citation we have**, and it
was missing from this file.

Nine tools (HoneyBadger, Maian, Manticore, Mythril, Osiris, Oyente, Securify,
Slither, Smartcheck) over two datasets: 69 annotated contracts carrying 115
tagged vulnerabilities, and 47,518 unlabelled contracts from the chain.
428,337 analyses, 564 days 3 h of compute.

| result | value |
|---|--:|
| vulnerabilities found by **all nine tools combined** | **48/115 (42%)** |
| best single tool (Mythril) | 31/115 (27%) |
| Slither | 20/115 (17%) |
| wild-set contracts flagged vulnerable (combined) | **44,589/47,518 (93%)** |
| Oyente alone / Mythril alone on the wild set | 73% / 48% |
| DASP categories with **zero** detections by any tool | DoS, bad randomness, short addresses |
| agreement: vulns found by 4+ tools | arithmetic 937, reentrancy 133 — nothing else |

Why this is the most useful paper in the file:

1. **It is the canonical evidence for claim A, in its narrowed form.** The
   largest evaluation in the field flags 93% of real contracts as vulnerable and
   then *cannot say how many of those are wrong*, because the wild set has no
   labels. The authors say so themselves — the flag rate "suggests a considerable
   number of false positives" is as far as the data lets them go. That is not a
   flaw in their study; it is the structural hole our six-tier benchmark exists
   to fill.
2. **It is the ancestor of claim G.** They demonstrate the problem at scale
   (unlabelled negatives ⇒ unmeasurable FPR); we measure what happens when you
   *construct* negatives at graded trust levels. The gap between their paper and
   ours is exactly one experiment, and we ran it.
3. **It independently corroborates our Slither result.** We measured Slither at
   46/150 with 1 finding of 104 on our corpus; they measure 20/115 (17%) on
   theirs. Two different corpora, same conclusion, and theirs is peer-reviewed —
   this defuses "you must have configured Slither wrong."
4. **It supports claim F.** Three of ten DASP categories are detected by *no*
   tool at all. Coverage bias is not a hypothetical.

### Feist, Grieco, Groce, "Slither: A Static Analysis Framework for Smart Contracts" — WETSEB@ICSE 2019 · [arXiv 1908.09878](https://arxiv.org/abs/1908.09878)

Verified against the full text (v). Our own baseline's paper — we had been
citing the tool without citing its evaluation, which was a hole.

SlithIR: Solidity → SSA-form intermediate representation, enabling dataflow and
taint tracking. Table I evaluates **reentrancy detection on the 1,000 most-used
contracts**:

| tool | "false positives" | flagged | s/contract | timed out | failed |
|---|--:|--:|--:|--:|--:|
| **Slither** | **10.9%** | 112 | 0.79 ± 1 | 0% | 0.1% |
| Securify | 25% | 8 | 41.4 ± 46.3 | 20.4% | 11.2% |
| SmartCheck | 73.6% | 793 | 10.9 ± 7.14 | 4% | 10.22% |
| Solhint | 91.3% | 81 | 0.95 ± 0.35 | 0% | 1.2% |

**Read the denominator before quoting the 10.9%.** It is the share of *flagged*
contracts that were wrong — i.e. 1 − precision — established by manually
reviewing "a random sample of at least 50 of the flagged contracts for each
tool," on **one** detector class, with **no true-negative denominator at all**.
It is not FP/(FP+TN), which is what we report.

This is worth a paragraph of its own in the paper, because it is the field's
most-cited "low false positive" number and it is routinely compared against
rates computed a different way. Restated on our denominator it is not
computable from their data. That is claim-A's thesis appearing inside the
baseline everyone trusts.

### "Benchmarking LLM-Based Static Analysis…" — COMPSAC 2026 · [arXiv 2605.11163](https://arxiv.org/html/2605.11163)

Closest methodological neighbour, and mostly an **ally**.

- Uses a **paired positive/negative** Solidity benchmark (176 examples, 49
  categories) with safe variants — so it measures FPR, recall, balanced accuracy
  and full confusion counts.
- Runs local models via **Ollama**, 4-bit, on a 24GB machine.
- Finds local 4-bit models have **higher FPR (34.09% vs 25%)** and far worse
  latency (44s vs 3s per contract) than hosted.
- Finds **lexical bias**: renaming identifiers costs 4–8% balanced accuracy.
- Finds **grounding bias**: feeding Slither reports makes models adopt tool
  findings uncritically (up to +354% Slither-aligned detections).
- **Its own stated limitations include "single hardware configuration" and "no
  context window analysis — configuration details remain undocumented."**

That last line is the single most useful sentence in this survey: a 2026 paper
running local models through Ollama explicitly records that it did not report its
context window and did not vary hardware. It is direct support for two of our
claims, from a paper that would otherwise scoop us.

Their 34.09% local FPR also independently brackets our 29.9%.

### "The Silent Hyperparameter: Inference Backends and LLM Reproducibility" — [arXiv 2605.19537](https://arxiv.org/pdf/2605.19537)

Quantifies how inference backend choice affects reproducibility; covers
llama.cpp and Ollama among others. **This kills any claim that we discovered
backend/hardware nondeterminism.** Summary quality here was poor (the fetch
hedged repeatedly) — *read this one properly before writing the related-work
paragraph.*

Supporting general literature: Thinking Machines' "Defeating Nondeterminism in
LLM Inference"; [arXiv 2506.09501](https://arxiv.org/pdf/2506.09501) on numerical
sources of nondeterminism (FP32 near-deterministic, BF16 high variance; batch
size and GPU architecture matter). The mechanism — non-associative floating point
and kernel/batch-shape dependence — is well established.

### Others worth a line

- **LLM-BSCVM** ([2505.17416](https://arxiv.org/abs/2505.17416)) — claims FPR
  reduced 7.2% → 5.1%, F1 > 91%. Negative set unverified; abstract does not say.
- **SAST Tools for Smart Contracts: How Far Are We?** ([2404.18186](https://arxiv.org/pdf/2404.18186),
  ACM FSE) — the reference point for static-analyser coverage/precision.
- **An empirical analysis of vulnerability detection tools** ([2505.15756](https://arxiv.org/pdf/2505.15756)).
- **SmartBugs** — curated set is 143 annotated *vulnerable* contracts / 208
  tagged vulnerabilities; the wild set is 47,518 unlabelled. The curated set has
  no safe class, which is the concrete basis for our narrowed claim.

---

## 2. Audit of our own claims

| # | Our claim | Verdict |
|---|---|---|
| A | Benchmarks are all-positive, so FPR is not measurable | **NARROWED — now well-supported** |
| B | LLM auditors carry high real-world false-alarm rates | **NOT NOVEL — cite Heimdallr** |
| C | A bigger model makes false alarms worse | **NARROW to the controlled measurement** |
| D | Nobody checks cross-platform reproducibility | **MUST NARROW** |
| E | Local-LLM security evals do not report context window | **SURVIVES** |
| F | Coverage/abstention bias goes unreported | **PROBABLY SURVIVES — verify** |
| G | False alarms track the provenance of the "safe" label | **APPEARS NOVEL — our best claim; Durieux is the ancestor** |

### A. All-positive benchmarks — narrow it

False as stated. GPTScan reports FPR on Top200; COMPSAC 2026 built a paired
positive/negative set; at least one 400-contract balanced dataset (200/200)
exists. The defensible version:

> The *contest-derived* corpora that recall figures are most often reported on —
> Web3Bugs, SmartBugs-curated — contain no safe class, so a false-alarm rate
> cannot be computed from the same data that produces the headline recall. Papers
> that do measure FPR use a *separate* negative set, and the two are rarely
> reported together on the same contracts.

That is still a real and checkable observation, and our balanced six-tier
benchmark answers it directly.

**Durieux et al. now carries this claim.** The largest evaluation in the field
(9 tools, 47,518 contracts, 564 days of compute) reports that 93% of real
contracts are flagged vulnerable and cannot decompose that figure, because the
wild set is unlabelled. Their annotated set, where labels do exist, has 69
contracts and no safe class. So the field's biggest study measures flag rate
without a false-alarm rate, and its labelled study measures recall without a
negative class — in the same paper. Cite this rather than asserting the claim
in our own voice.

### B. High real-world FPR — concede and build on it

Heimdallr owns this. Do not lead with it. Instead:

> Heimdallr reports GPTScan at 97.5% FPR on real contest projects against the
> 57.14% precision GPTScan reports on its own benchmark. We take that gap as the
> starting point rather than the finding, and ask what in the *evaluation
> harness* produces it.

That is a better paper anyway, and it is the framing the draft already
recommends.

### C. Bigger model, worse alarms — the measurement is the contribution

The observation exists in prose ("stronger associative reasoning leads larger
models to read benign patterns as vulnerabilities"). What we have that they do
not is a **controlled paired ablation**: one variable, same machine, same seed,
n=230, McNemar p=0.00008 on false alarms and p=0.043 on misses. Claim the
*causal isolation*, not the phenomenon.

### D. Cross-platform reproducibility — narrow hard

Backend and hardware nondeterminism is documented. Ours is not that. Ours is:

> The effect propagates to *security verdicts* and therefore to a published
> false-alarm rate. On identical contracts, seeds and model digests, verdict
> agreement across two machines is 0.735, and a `num_parallel=1` control rules
> out batching as the cause (paired McNemar p=0.75). We are not aware of a
> smart-contract security evaluation that reports such a check.

Note Heimdallr's stability pilot is same-machine repeatability — a *different*
thing, and worth saying so explicitly.

### E. Context window — survives, and is well supported

COMPSAC 2026 uses Ollama and lists "no context window analysis" in its own
limitations. Heimdallr reports a 32k chunking limit, which is not the runtime's
`num_ctx`. Our ablation shows the setting moves abstention 44.4% → 0.0%, recall
12.5% → 81.2% and is 4× slower. This is the most defensible *new* systems result
we have.

### G. The label-trust gradient — our strongest card

Searches surfaced no work measuring false-alarm rate **as a function of how
trustworthy the "safe" label is**. We have it at n=1154 under the shipped rule:
audited libraries 15.7% [11.0, 21.9] versus audit-reviewed 37.5% [31.6, 43.8]
and real-world-no-bug 33.0% [26.7, 39.9] — a **two-level** effect, audited
libraries separating from both, the two weaker tiers indistinguishable from each
other.

Combined with the hand-review (≈70% of blocked safe contracts are genuine tool
errors), this is a claim about *what a false-alarm rate even means* when the
negative class is constructed from absence of evidence. Nothing found so far
does this. **Verify hardest here, because it is what the paper should lead on.**

Durieux et al. is the closest prior work and it *strengthens* G rather than
threatening it: they establish that an unlabelled negative class makes the
false-alarm rate unmeasurable at scale; we grade the negative class by label
provenance and measure how much the answer moves (15.7% → 37.5%, non-overlapping
intervals). Their paper is the motivation section; ours is the experiment they
could not run.

---

## 3. Recommended positioning

The measurement paper survives; its *headline* has to move.

**Not:** "LLM auditors cry wolf." Heimdallr published that, with worse numbers.

**Instead:** *the false-alarm rate you report is an artifact of three things
nobody reports* — what your "safe" label means (G), what your harness silently
drops (E, F), and which machine you ran it on (D). We demonstrate each with a
controlled experiment on the same corpus, and show that each one moves the
published number by more than the differences papers currently claim as results.

That framing:
- concedes B rather than being caught by it,
- makes G, E and D the contributions instead of the caveats,
- and makes the GPTScan head-to-head (overlapping intervals, no difference
  demonstrated) an *illustration* of the thesis rather than a disappointment.

## 4. What still needs a human

1. **Read [2605.19537](https://arxiv.org/pdf/2605.19537) properly.** The summary
   was weak and it is the paper that constrains claim D.
2. **Confirm G is actually unclaimed** — the most valuable and the least
   verified item here. Try: dataset label-quality papers, and work on
   "unlabelled ≠ negative" / PU-learning in vulnerability detection.
3. **Check F** against the SAST survey ([2404.18186](https://arxiv.org/pdf/2404.18186)),
   which is the natural place for compile-failure coverage to be reported.
   Partly answered already: Durieux reports three DASP categories with zero
   detections across all nine tools.
4. Decide whether to cite Heimdallr as motivation (recommended) or as a baseline
   we cannot run.
