# ThirdEye

**A model-diverse LLM council for smart-contract auditing — and a measurement of
why its false-alarm rate is not a property of the tool.**

[Live research exhibit](https://third-eye-capstone.vercel.app/) ·
[Paper draft](docs/PAPER_DRAFT.md) ·
[Results index](backend/eval/results/README.md) ·
[Decision log](docs/DECISION_LOG.md)

---

## The finding

Reported false-alarm rates for LLM security tools are treated as properties of
the tool. They are substantially properties of the **evaluation harness**.

We evaluate a council of eight OWASP/DASP specialists — each pinned to a
different base model, run locally on free tiers — against a purpose-built
benchmark of **1,154 scored Solidity contracts** (603 audited-safe across three
provenance tiers, 551 known-vulnerable), and isolate three unreported choices,
each with a controlled experiment on the same corpus.

**1. What the "safe" label means.** The false-alarm rate is 29.9% overall, but
it decomposes by how much the safe label can be trusted:

| safe tier | n | false-alarm rate (95% Wilson) |
|---|--:|---|
| Audited libraries (OpenZeppelin / Solady) | 172 | **15.7%** [11.0, 21.9] |
| Audit-reviewed, clean | 240 | 37.5% [31.6, 43.8] |
| Real-world, no bug reported | 191 | 33.0% [26.7, 39.9] |

Same tool, same seed, same machine, same contracts. Only the provenance of the
label changes. The effect is **two-level, not a gradient** — audited libraries
separate from both weaker tiers, which are indistinguishable from each other.
Hand review of 21 blocked safe contracts finds roughly 70% are genuine tool
errors, which bounds how much of this is label noise.

**2. What the harness silently discards.** Ollama truncates any prompt over
`num_ctx` without erroring, and abstentions are excluded from scoring — so a
misconfiguration *removes rows* instead of lowering a score. 24% of the corpus
overflows a 4,096-token window, and the overflow is class-skewed. A paired
ablation on identical contracts moves abstention from 44.4% to 0.0% and recall
from 12.5% to 81.2% (McNemar p = 0.016) while running **4.01× faster**.

**3. Which machine ran it.** On identical contract ids, seeds and byte-identical
model digests, verdict agreement across two machines is 0.735. A
`num_parallel=1` control excludes batch parallelism as the cause (p = 0.75).

## Is 29.9% good?

There is no single answer, because the published reference band is **20× wide
and not internally commensurable**. Every figure below was verified against the
source paper's own text:

| source | rate | denominator |
|---|--:|---|
| GPTScan (ICSE'24), self-reported | 4.39% | FP/(FP+TN) |
| Slither (WETSEB'19), self-reported | 10.9% | **1 − precision** |
| **ThirdEye, audited-library tier** | **15.7%** | FP/(FP+TN) |
| **ThirdEye, overall (shipped rule)** | **29.9%** | FP/(FP+TN) |
| COMPSAC'26, local 4-bit models | 34.09% | FP/(FP+TN) |
| GPTScan, measured independently (Heimdallr) | 97.50% | FP/(FP+TN) |

GPTScan moves 22× between its own evaluation and an independent one, with no
change to the tool. Slither's much-cited 10.9% is the share of *flagged*
contracts manual review found wrong, on one detector class, with no
true-negative set — it is not the same quantity it gets compared against.

We do not claim 29.9% is good. We claim it is **interpretable**: it carries a
stated negative class, a per-tier decomposition, a hand-audited label-noise
estimate, and a confidence interval.

## Against the baselines

**Slither**, on 150 identical contracts:

| | Slither | ThirdEye |
|---|--:|--:|
| answered | 46 / 150 | **150 / 150** |
| precision, where it answers | **0.941** | 0.712 |
| recall, where it answers | 0.889 | 0.808 |

Where Slither answers it is **more precise than we are**, and that is reported
rather than buried. Our advantage is coverage: it abstains on 69% of the corpus
because it needs a compiler. All 104 abstentions were diagnosed with `solc`
directly — exactly **one** was attributable to our toolchain.

**GPTScan (ICSE'24)**, on 34 gradable projects both tools were asked about:
33/34 against 31/34, **intervals overlapping**. No detection difference is
demonstrated, and it is reported that way rather than as a win.

## What this is not

- Not a claim that ThirdEye is the best available auditor. A 29.9% false-alarm
  rate is not deployable unattended, and we say so.
- Not a claim that the benchmark is representative of all Solidity.
- The `dynamic` auto-generated harness is a **scaffold**: it emits a log line
  with no assertion and can never reach CONFIRMED. Only the bundled
  reference-PoC path genuinely runs.
- Retrieval precedents are **not** injected into specialist prompts.
- `vectordb.py` is circular (it stores the app's own outputs) and is disabled by
  default.

Seven silent-failure modes found during this work — each of which produced
*plausible* metrics rather than obvious garbage — are documented in
[`docs/PAPER_DRAFT.md`](docs/PAPER_DRAFT.md) §5, with the invariants that now
guard against them pinned by tests.

## Quick start

```bash
# Backend
cd backend
pip install -r requirements.txt
cp .env.example .env          # set CEREBRAS_API_KEY or GROQ_API_KEY for hosted tiers
uvicorn main:app --reload     # http://localhost:8000

# Frontend
cd frontend
npm install
npm run dev                   # http://localhost:5173
```

Local inference needs [Ollama](https://ollama.com) with the specialist models
pulled. **Set `OLLAMA_NUM_CTX` deliberately** — leaving it at the default is the
misconfiguration measured in finding 2 above.

## Reproducing the results

Every run is checkpointed per contract, so each table can be re-scored without
re-running inference:

```bash
python -m eval.run_benchmark --report-only          # headline + per-tier
python -m eval.run_slither_bench --report-only      # Slither head-to-head
python -m eval.run_web3bugs --report-only --gptscan-set   # GPTScan head-to-head
python backend/eval/build_results_readme.py         # regenerate the results index
```

Confidence intervals are **Wilson**, never Wald — several of these rates sit near
0 or 1, where the Wald interval collapses to zero width.

## Layout

```
backend/
  main.py                 FastAPI app: auth, rate limiting, session ownership
  services/
    council.py            the core — 8 specialists, evidence gate, noisy-OR pooling
    suppression.py        recall-safe FP suppression, with per-rule MEASURED cost
    router.py             static pre-selection of specialists, with a decision trace
    arbitration.py        LLM-as-judge gate (reported as a NEGATIVE result)
    pipeline.py           retrieval -> council -> arbitration -> dynamic
    slither.py            static-analysis baseline integration
    sarif.py, report.py   SARIF for CI, PDF for humans
  eval/                   the evaluation harness — 15 runners, 6-tier loader,
                          seeded nested sampling, Wilson/McNemar metrics
  eval/results/           committed result tables (see its README.md)
  tests/                  regression tests pinning the exact defects found
frontend/src/
  views/Exhibit.tsx       the research exhibit
  views/Analyze.tsx       the auditing tool
docs/
  PAPER_DRAFT.md          the paper
  RELATED_WORK.md         claims audit — which of our claims survive the literature
  DECISION_LOG.md         every correction made during the work, and why
  THIRDEYE_PIPELINE.md    current architecture
```

## CI

`.github/workflows/contract-audit.yml` runs the council over changed `.sol` files
on every PR and uploads SARIF. It skips rather than fails when `GROQ_API_KEY` is
absent, so forks are unaffected.

## Team

Capstone Team 2, PES University — Tarun B, V Lakshitha, Anvita Agarwal,
Umar Ahmed.
