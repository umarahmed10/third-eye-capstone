# Paper facts — every number, with provenance

**Status: 2026-09-25.** One place to look up any figure that goes into the
submission. Each row names the artefact it came from. Nothing here is typed from
memory; everything was read out of a committed result file, a generated table, or
a verified source paper.

Three labels are used throughout and they are not interchangeable:

- **SOUND** — measured, checkpointed, reproducible, safe to cite.
- **UNSOUND** — the run was corrupted (backend outage); do not cite any figure.
- **EXTERNAL (v)** — from another paper, checked against that paper's own text.

> **The two-rule trap.** Checkpoints were recorded under the historical OR-gate;
> the tool *ships* a pooled noisy-OR rule at τ = 0.925. Both appear below and
> they must never be quoted interchangeably. **The shipped column is what the
> paper reports.**

---

## 1. The corpus

| fact | value | source |
|---|--:|---|
| total contracts | 2,250 | `eval/loaders/thirdeye_bench` |
| balance | 1,125 safe : 1,125 vulnerable | ditto |
| scored in the main run | **1,154** (603 safe, 551 vulnerable) | `benchmark_by_tier.json` |
| safe tiers | audited libraries 172 · audit-reviewed 240 · real-world-no-bug 191 | ditto |
| vulnerable tiers | curated 214 · injected 170 · audit-report 167 | ditto |
| vulnerable contracts with a mapped DASP-10 label | 349 (202 carry none) | `class_coverage_shipped.json` |
| contracts overflowing a 4,096-token window | 540 / 2,250 (24.0%), skewed 350 vulnerable : 190 safe | `run_ctx_ablation.py` docstring |
| safe overflow pool under the 12,230-token ceiling | 176 (190 without the ceiling) | `reconstruct_ctx_sample.py`, verified |

---

## 2. Headline result at scale — SOUND

`benchmark_by_tier.json` + shipped replay in `frontend/src/data/benchmark.ts`,
n = 1,154, backend `ollama_noarb`, seed 0, 0 abstentions, 0 errors.

| | OR-gate (as recorded) | **noisy-OR (shipped)** |
|---|--:|--:|
| tp / fp / tn / fn | 498 / 356 / 247 / 53 | **445 / 180 / 423 / 106** |
| false-alarm rate | 59.0% [55.1, 62.9] | **29.9% [26.3, 33.6]** |
| recall | 90.4% [87.6, 92.6] | **80.8% [77.3, 83.8]** |
| precision | 0.583 | **0.712** |
| F1 | 0.709 | **0.757** |

---

## 3. FINDING 1 — label provenance — SOUND

Same tool, seed, machine, contracts. Only how the *safe* label was obtained changes.

| safe tier | n | fp (shipped) | FPR, shipped | FPR, OR-gate |
|---|--:|--:|--:|--:|
| Audited libraries (OZ / Solady) | 172 | 27 | **15.7% [11.0, 21.9]** | 49.4% [42.0, 56.8] |
| Audit-reviewed, clean | 240 | 90 | **37.5% [31.6, 43.8]** | 66.2% [60.1, 71.9] |
| Real-world, no bug reported | 191 | 63 | **33.0% [26.7, 39.9]** | 58.6% [51.6, 65.4] |

Two-level, **not** a monotonic gradient: audited libraries separate from both
weaker tiers; the two weaker tiers overlap and are not distinguishable.

**Label-noise bound (hand review, `FP_REVIEW_SAMPLE.md`).** Random sample
(seed 2026) of 20 of the 79 blocked safe contracts, plus 1 from an earlier read:

| assessment | count | share |
|---|--:|--:|
| clear tool error | 14 | **70%** |
| unclear, needs a read | 4 | 20% |
| possible real bug in a "safe" contract | 2 | 10% |

Detection by vulnerable tier (OR-gate tp): curated 185/214 = 86.4% [81.2, 90.4] ·
injected 152/170 = 89.4% [83.9, 93.2] · audit-report 118/167 = 70.7% [63.4, 77.0].

---

## 4. FINDING 2 — the matching rule — SOUND (new, 2026-09-25)

`class_coverage_shipped.json`. Identical contracts, verdicts and rule; only the
protocol changes. Denominator = 349 labelled vulnerable contracts.

| protocol | detected | recall |
|---|--:|--:|
| any-slice-positive | 287 | **82.2%** |
| type-matched | 89 | **25.5%** |

**Spread: 56.7 points.** 158 / 349 (45.3%) carry only classes the council has no
specialist for.

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

## 5. FINDING 3 — silent input truncation

**Vulnerable class — SOUND.** `ctx_compare_ctx4k_ctx16k.json`, 4,096 → 16,384.

| | value |
|---|--:|
| paired / scored in both | 36 / 20 |
| McNemar b / c | 2 / 12 |
| **p** | **0.0162** |
| abstention | 44.4% → 0.0% |
| recall | 12.5% → 81.2% |
| accuracy | 25.0% → 75.0% |
| speed | **4.01× faster** at the larger window, sign test p < 0.0001 |

**Safe class — UNSOUND, DO NOT CITE.** `ctx_ablation_safe.txt`, 2026-09-25 run.
176 paired but only **31 scored in both**; 145/176 and 108/176 INCONCLUSIVE, and
*every one* is "N/N specialists failed to run" — a backend outage, not
abstention. The surviving 31 are whatever ran while Ollama was alive. Figures
seen (FPR 9.7% → 54.8%, McNemar χ² = 12.07, p = 0.0005, 14 discordant pairs all
one way, 3.73× speedup) are **not reportable**. Re-run required.

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
