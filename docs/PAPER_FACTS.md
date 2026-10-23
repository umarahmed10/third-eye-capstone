# Paper facts — every number, with provenance

**Status: 2026-10-09.** One place to look up any figure that goes into the
submission. Each row names the artefact it came from. Nothing here is typed from
memory; everything was read out of a committed result file, a generated table, or
a verified source paper.

Three labels are used throughout and they are not interchangeable:

- **SOUND** — measured, checkpointed, reproducible, safe to cite.
- **UNSOUND** — the run was corrupted (backend outage); do not cite any figure.
- **EXTERNAL (v)** — from another paper, checked against that paper's own text.

> **The three-rule trap.** There are *three* decision rules in this codebase, not
> two, and the one this file used to call "OR-gate" was the wrong one of them.
> Replayed 2026-10-09 from `eval/checkpoints/benchmark/ollama_noarb/seed0`
> (1,154 rows, all schema 2, zero null confidences):
>
> | rule | where it sits | tp/fp/tn/fn | FPR |
> |---|---|--:|--:|
> | `n_findings > 0` | **pre-gate** — any specialist raised anything | 498 / 356 / 247 / 53 | 59.0% |
> | `verdict == NO-GO` | post evidence-gate + agreement vote | 455 / 226 / 377 / 96 | 37.5% |
> | noisy-OR, τ = 0.925 | pooling over the surviving findings | 446 / 182 / 421 / 105 | 30.2% |
>
> The first two reproduce **exactly** — the second is `benchmark_by_tier.json`'s
> `overall` to the contract. The third lands 2 contracts off the figure the paper
> reports (445/180/423/106), at *every* τ in [0.80, 0.999] and under every
> treatment of a missing confidence, so the published replay applied something the
> checkpoints do not record. Structural suppression (`services/suppression.py`) is
> the candidate: it drops findings *after* the council, and the stored `findings`
> list is pre-suppression. Rerun `python -m eval.verify_facts` to reproduce any of
> this; it exits non-zero on a mismatch.
>
> **The correction this forces.** Calling the pre-gate count "the OR-gate" credits
> the pooling rule with the evidence gate's work. The OR over *surviving* findings
> is 37.5%, not 59.0%. So the honest framing is a three-step decomposition —
> 59.0% (flag anything) → 37.5% (evidence gate) → 30.2% (pooling) — and the gate
> does more of that work than the pooling does. Do not write "59.0% → 29.9%" as a
> single step attributable to noisy-OR.
>
> Two fixes owed: store post-suppression findings in the checkpoint (or apply
> suppression inside `verify_facts`), and relabel every "OR-gate" column below
> according to which of the three rules it actually is.

---

## 1. The corpus

| fact | value | source |
|---|--:|---|
| total contracts | 2,250 | `eval/loaders/thirdeye_bench` |
| balance | 1,125 safe : 1,125 vulnerable | ditto |
| scored in the main run | **1,154** (603 safe, 551 vulnerable) | `benchmark_by_tier.json` |
| safe tiers | audited libraries 172 · audit-reviewed 240 · real-world-no-bug 191 | ditto |
| safe-tier median contract size (full corpus) | audited 6,649 · audit-reviewed 3,531 · real-world 3,783 chars | computed 2026-09-25 |
| vulnerable tiers | curated 214 · injected 170 · audit-report 167 | ditto |
| vulnerable contracts with a mapped DASP-10 label | 349 (202 carry none) | `class_coverage_shipped.json` |
| contracts overflowing a 4,096-token window | 540 / 2,250 (24.0%), skewed 350 vulnerable : 190 safe | `run_ctx_ablation.py` docstring |
| safe overflow pool under the 12,230-token ceiling | 176 (190 without the ceiling) | `reconstruct_ctx_sample.py`, verified |

---

## 2. Headline result at scale — SOUND

`benchmark_by_tier.json` + shipped replay in `frontend/src/data/benchmark.ts`,
n = 1,154, backend `ollama_noarb`, seed 0, 0 abstentions, 0 errors.

| | pre-gate (`n_findings > 0`) | evidence gate (`NO-GO`) | **noisy-OR (shipped)** |
|---|--:|--:|--:|
| tp / fp / tn / fn | 498 / 356 / 247 / 53 | 455 / 226 / 377 / 96 | **445 / 180 / 423 / 106** |
| false-alarm rate | 59.0% [55.1, 62.9] | 37.5% [33.7, 41.4] | **29.9% [26.3, 33.6]** |
| recall | 90.4% [87.6, 92.6] | 82.6% [79.2, 85.5] | **80.8% [77.3, 83.8]** |
| precision | 0.583 | 0.668 | **0.712** |
| F1 | 0.709 | 0.739 | **0.757** |

The middle column is the one the committed JSON holds; the first column is *not*
"the OR-gate", it is the rule before any gating at all. Replaying the shipped
column from these checkpoints gives 446/182/421/105 (FPR 30.2%) — 2 contracts
off, unexplained, see the three-rule note at the top. **Cite the shipped column
as 29.9% only alongside that caveat, or cite the replayable 30.2%.**

---

## 3. FINDING 1 — label provenance — SOUND

Same tool, seed, machine, contracts. Only how the *safe* label was obtained changes.

| safe tier | n | fp (shipped) | FPR, shipped | FPR, pre-gate |
|---|--:|--:|--:|--:|
| Audited libraries (OZ / Solady) | 172 | 27 | **15.7% [11.0, 21.9]** | 49.4% [42.0, 56.8] |
| Audit-reviewed, clean | 240 | 90 | **37.5% [31.6, 43.8]** | 66.2% [60.1, 71.9] |
| Real-world, no bug reported | 191 | 63 | **33.0% [26.7, 39.9]** | 58.6% [51.6, 65.4] |

The right-hand column sums to 85 + 159 + 112 = 356 false positives, which is the
**pre-gate** count, not the OR over surviving findings — relabelled 2026-10-09,
see the three-rule note at the top.

Two-level, **not** a monotonic gradient: audited libraries separate from both
weaker tiers; the two weaker tiers overlap and are not distinguishable.

**Label-noise bound (hand review, `FP_REVIEW_SAMPLE.md`).** Random sample
(seed 2026) of 20 of the 79 blocked safe contracts, plus 1 from an earlier read:

| assessment | count | share |
|---|--:|--:|
| clear tool error | 14 | **70%** |
| unclear, needs a read | 4 | 20% |
| possible real bug in a "safe" contract | 2 | 10% |

Detection by vulnerable tier (evidence-gate tp, 185+152+118 = 455): curated 185/214 = 86.4% [81.2, 90.4] ·
injected 152/170 = 89.4% [83.9, 93.2] · audit-report 118/167 = 70.7% [63.4, 77.0].

---

## 4. FINDING 2 — the matching rule — SOUND (new, 2026-09-25)

`class_coverage_shipped.json`. Identical contracts, verdicts and rule; only the
protocol changes. Denominator = 349 labelled vulnerable contracts.

| protocol | detected | recall |
|---|--:|--:|
| any-slice-positive | 287 | **82.2%** |
| type-matched | 89 | **25.5%** |

**Spread: 56.7 points**, which decomposes. 158 / 349 (45.3%) carry only classes
the council has no specialist for, so part of the spread is our coverage gap.
Restricting to contracts carrying ONLY covered classes isolates the protocol:

| set | n | any-slice | type-matched | spread |
|---|--:|--:|--:|--:|
| all labelled | 349 | 82.2% | 25.5% | 56.7 pts |
| **coverage-controlled** | **187** | **77.0%** | **45.5%** | **31.6 pts** |

**Cite 31.6 as the protocol effect.** 56.7 is protocol + coverage jointly.

| DASP-10 class | n | any-slice | type-matched | specialist? | Durieux |
|---|--:|--:|--:|---|---|
| unchecked low-level calls | 109 | 89.0% | — | **none** | Slither 33% (4/12) |
| reentrancy | 86 | 76.7% | 29.1% [20.5, 39.4] | yes | Slither 88% (7/8) |
| arithmetic | 79 | 77.2% | 62.0% [51.0, 71.9] | yes | Mythril 68% (15/22) |
| time manipulation | 40 | 92.5% | — | **none** | Slither 40% (2/5) |
| access control | 17 | 88.2% | 70.6% [46.9, 86.7] | yes | best 21% (4/19) |
| bad randomness | 9 | 66.7% | — | **none** | ZERO of 9 tools |
| denial of service | 8 | 62.5% | 50.0% [21.5, 78.5] | yes | ZERO of 9 tools |
| front running | 4 | 100.0% | 0.0% [0.0, 49.0] | yes | Mythril/Securify 29% |
| short addresses | 1 | 100.0% | — | **none** | ZERO of 9 tools |

`[25.5%, 82.2%]` is a bracket: 25.5% is a **lower** bound (only 5 of 8 roles have
an unambiguous DASP slot; `business_logic`, `oracle_price_manipulation`,
`proxy_upgradeability` are deliberately unmapped).

**Independent corroboration of the coverage gap** — the older 2-model council on
SmartBugs-curated scored recall **0** on bad_randomness (0/8), denial_of_service
(0/6) and arithmetic (0/15). `council_baseline_smartbugs_curated.json`.

---

## 5. FINDING 3 — silent input truncation — SOUND, REFRAMED 2026-10-23

**The claim changed, and it got stronger.** Earlier drafts reported this as a
recall effect (12.5% -> 81.2%, McNemar p = 0.0162, 4.01x slower). That figure
rested on 20 paired rows **of which exactly ONE had an intact council in both
arms** -- 27 of the 29 scored 4k rows had errored specialists. Since a dead
specialist can only fail to raise a flag, never invent one, the contamination
pushed 4k recall DOWN and therefore *manufactured* the effect. It is the same
defect this file already caught in the safe arm, present unnoticed in the
vulnerable arm. **Do not cite 12.5% -> 81.2%, and do not cite 4.01x: at 4k
most specialist calls terminate on the client deadline, so the measured
latency is the timeout, not the model.**

Re-run clean on 2026-10-23, the effect is not on recall but on whether the
council *runs at all*, and it is measured per SPECIALIST CALL, so it does not
depend on paired rows:

| arm | specialist calls | failed | rate [95% Wilson] |
|---|--:|--:|--:|
| vulnerable, num_ctx 4,096 | 92 | 36 | **39.1% [29.8, 49.3]** |
| vulnerable, num_ctx 16,384 | 437 | 14 | 3.2% [1.9, 5.3] |
| safe, num_ctx 4,096 | 97 | 43 | **44.3% [34.8, 54.2]** |
| safe, num_ctx 16,384 | 485 | 11 | 2.3% [1.3, 4.0] |

Two-proportion test: vulnerable z = 10.71, **p = 9.5e-27**; safe z = 13.03,
**p = 7.8e-39**. Both classes, same direction, order-of-magnitude effect.

| | 4k | 16k |
|---|--:|--:|
| contracts with an intact council | 22.2% / 20.0% | 85.7% / 92.5% |
| inconclusive | 33.3% / 45.0% | 1.1% / 1.7% |
| **GO returned by a BROKEN council** | **7 / 5** | **0 / 0** |

**The sentence for the abstract.** Twelve contracts at 4,096 tokens returned
GO -- no vulnerability -- from a council in which one to three specialists
never ran. At 16,384 that happened zero times. A silently truncating context
window does not degrade detection gracefully: it makes specialist calls fail
outright, and the harness reports the wreckage as a clean bill of health. The
failure is both silent and biased toward false SAFETY.

Provenance: `ctx_ctx4k` / `ctx_ctx16k` / `ctx_ctx4k_safe` / `ctx_ctx16k_safe`,
all purged of pre-2026-10-23 rows, re-run with the 4k arms at concurrency 2
and a 1,800s deadline so the failures are the model's and not the queue's.
Verify with `python -m eval.audit`.

**Known limit, state it.** The 4k arms are small (n = 18 and 20 contracts)
*because* they fail -- 78% and 80% of attempted rows quarantined. That is the
finding, not a sampling shortfall, but the per-CONTRACT rates carry wide
intervals and only the per-CALL rates should be quoted as precise.

---

## 6. FINDING 4 — execution environment — SOUND

| arm | n scored | agreement w/ laptop | acc DGX | acc laptop | median latency |
|---|--:|--:|--:|--:|--:|
| `full3b` (main) | 230 | **0.735** | 0.722 | 0.622 | — |
| `full3b_np1` (control) | 227 | 0.727 | 0.736 | 0.621 | 7.5 s vs 60.6 s |
| `full8b` (capacity) | 232 | 0.767 | 0.651 | 0.625 | 22.6 s vs 60.6 s |

`num_parallel = 1` control excludes batch parallelism: paired McNemar **p = 0.75**.

**Capacity ablation (negative result).** Restoring a 2.7× larger model on the 3
semantic roles: false alarms **49 → 74** (McNemar **p = 0.00008**), misses
**15 → 7** (p = 0.043), net accuracy **0.722 → 0.651**. Capability is not the lever.

---

## 7. Verdict rule — SOUND

`weighted_aggregation.json`, 10 random dev/test splits, n = 233 rows (116 dev / 117 test), τ = 0.575.

| rule | FPR | precision | recall | F1 |
|---|--:|--:|--:|--:|
| OR-gate | 64.8% ± 5.4 | 0.563 ± 0.021 | 0.938 ± 0.020 | 0.703 ± 0.017 |
| noisy-OR threshold (shipped) | **27.4% ± 7.8** | 0.733 ± 0.043 | 0.824 ± 0.101 | 0.770 ± 0.033 |

Held-out test: OR-gate 51/43/19/4, FPR 69.4%, F1 0.685 → noisy-OR 48/19/43/7,
FPR 30.6%, F1 0.787. Wins **9 of 10** splits. Per-class weighting beats a flat
threshold on only **3 of 10** — so the gain is attributed to **thresholding**,
not weighting (`threshold_only` F1 0.790 vs weighted 0.770).

**Arbitration — NEGATIVE result.** `arbitration_sweep.json`, n = 233.
Council-only 101/79/45/8, P 0.561, R 0.927, F1 0.699. Best in-sample τ = 0.15
gives F1 0.711 but is **not reportable** (fitted in-sample). Held out, arbitration
wins **4 of 10** splits — no gain, despite visibly cutting the FPR column.

---

## 8. Baselines — SOUND

**Slither, identical 150 contracts** (`slither_bench.json`, rule: NO-GO iff ≥1 High/Medium):

| | Slither | ThirdEye |
|---|--:|--:|
| answered | **46 / 150** | **150 / 150** |
| abstained | 104 (69%) | 0 |
| tp / fp / tn / fn | 32 / 2 / 8 / 4 | — |
| precision where it answers | **0.941** | 0.712 |
| recall where it answers | 0.889 | 0.808 |

False-discovery 2/34 = **5.9%**, corroborating the **10.9%** Slither's own paper
reports. All 104 abstentions diagnosed with `solc`; **exactly 1** attributable to
our toolchain (`slither_failure_audit.json`).

**Access-control ablation** (`ablation_ac.json`, 8 positive + 8 negative, seed 0) —
the one place the council clearly wins, on a set with real negative signal:

| config | tp/fp/tn/fn | precision | recall | F1 |
|---|---|--:|--:|--:|
| single LLM (llama3.1:8b) | 1/0/8/7 | 1.000 | 0.125 | 0.222 |
| **council** | 6/0/8/2 | 1.000 | **0.750** | **0.857** |
| council + arbitration | 1/0/8/7 | 1.000 | 0.125 | 0.222 |

**Etherscan-50 — the council LOST** (`baseline_table.md`). Council P 0.067 /
R 0.167, against single-LLM 0.182 / 0.667 and LLM+Slither 0.140 / 1.000.
Council confusion 1/14/30/5. Ground truth is scraped and noisy — the table says
so itself — but the original hypothesis ("the council raises precision") is
**refuted** on the only early set with a negative class. Report it.

---

## 9. Prior work — EXTERNAL (v)

| source | figure |
|---|---|
| **GPTScan** (ICSE'24) | tp 40 / fp 30 / tn 154 / fn 8 = 232 checks; P 0.571, R 0.833, F1 0.678; FPR **4.39%** on Top200; 10 DeFi types, reentrancy & overflow excluded; 10/72 static failures |
| **Slither** (WETSEB'19) | **10.9%** "false positives" = 1 − precision, reentrancy only, ≥50 sampled, no TN set; 112 flagged; 0.79 ± 1 s; 0% timeout; 0.1% failed. Securify 25%, SmartCheck 73.6%, Solhint 91.3% |
| **Durieux et al.** (ICSE'20) | 9 tools, 47,518 wild + 69 annotated (115 vulns), 428,337 analyses, 564 days. **93%** of wild flagged. All 9 combined **48/115 (42%)**; Mythril 31/115 (27%); Slither 20/115 (17%). DoS / bad randomness / short addresses: **zero by any tool** |
| **Heimdallr** (2601.17833) | GPTScan **97.50%** FPR on Sherlock; LLMSmartAudit 99.01%; Hound 80.20%; their own 31.27–49.12% |
| **COMPSAC'26** (2605.11163) | local 4-bit FPR **34.09%** vs hosted 25%; 44 s vs 3 s; lexical bias 4–8% |
| **Berriche et al.** (2609.08765, Sept 2026) | 15 failure modes, 8 cyber **QA** benchmarks, 10 models; one pipeline choice moves a score **>80 pp**; denominator inflation 99.8 pp. **No negative class anywhere** |

**Our head-to-head vs GPTScan** (`web3bugs_gptscan.json`): 63 contests scored,
62 detected, contest recall 98.4% [91.5, 99.7], median latency 226.9 s, 3,547 API
calls, 205 S-class bugs. On the **34 gradable** shared projects: **33/34 vs
31/34, intervals overlapping — no difference demonstrated.**

**Council health on this corpus (added 2026-10-23, from `eval/audit.py`).**
Of the 90 web3bugs contest rows, **only 25 ran with every slice intact — 65
(72.2%) had at least one errored slice.** This is the most contaminated tree in
the project and it had been **invisible**: `audit.py` keyed terminality on a
`verdict` field that these rows do not have (they carry `detected` /
`slices_errored`), so the corpus reported `terminal=0` — printed as a row of
zeros that reads as "nothing to see" and actually meant "never audited."

What survives and what does not:
- **The contest-recall claim survives.** All 90 rows are sound under the
  asymmetric rule (`asym=90`): a slice that errored can only fail to raise a
  flag, never invent one, so a *detection* cannot be manufactured by a dead
  slice. The 98.4% recall and the 33/34 head-to-head stand.
- **No rate or paired claim on web3bugs may rest on this tree.** A
  non-detection cannot be distinguished from a slice that never ran, so any
  FPR-like or per-contest comparative figure is unsupported at 72.2%
  contamination.

Reported here rather than in a limitations footnote because the bias direction
is the whole point: contamination on this corpus pushes toward *missing* bugs,
which is the direction that would flatter a recall number if the rule were
reversed, and the only reason we can state which way it cuts is that the field
was recorded per row.

---

## 10. Engineering artefact

| fact | value |
|---|--:|
| source LOC (py/ts/tsx/sh/yml, excl. lockfiles & venv) | **18,078** |
| — Python / TSX / TS | 10,909 / 4,526 / 1,686 |
| documentation | 3,707 lines |
| commits | 61 |
| backend tests | 42, all passing |
| silent failure modes documented | 7, with 6 proposed invariants |

**We then committed one of our own invariants' violations.** The ablation runner
checkpointed transient backend failures as results and reused them on resume —
defect #3 ("transient ≠ deterministic"), by the instrument that measures the
headline. Found and fixed 2026-09-25 (`c687ff8`).
