# Argus pipeline & benchmark restructure (Session 5)

This documents the restructured benchmarking and the full multi-phase pipeline
built in this session. It is deliberately honest about what is production-grade,
what is demo/scaffold, and what is blocked.

## The pipeline

```
retrieval grounding ──► model-diverse council ──► evidence-anchored arbitration ──► dynamic confirmation
 services/retrieval.py    services/council.py        services/arbitration.py          services/dynamic.py
```

Orchestrated by `services/pipeline.py::run_argus(code, backend, use_retrieval,
use_arbitration, use_dynamic, ...)` — every stage is independently toggleable,
so one code path produces every ablation configuration. Exposed at
`POST /api/analyze/argus` (and the council alone at `POST /api/analyze/council`).

### Phase A — benchmark restructure (the "fix the datasets" ask)
- **Etherscan-50 dropped as a headline benchmark.** Its ground truth is
  heuristic/scraped ("vulnerabilities not checked yet"); it was a pre-existing
  convenience set with no research weight. Still loadable for smoke tests
  (`--datasets etherscan50`) but never in a default run.
- **Backbone = `smartbugs_curated`, `web3bugs`, `access_control_slice`.**
- **Web3Bugs is now actually analyzable.** The old whole-project concatenation
  made only 1/102 projects usable. `eval/slicing.py` slices a project into
  per-file (and per-contract for oversized files) units; the LLM council reads
  source and needs no compilation, so 101/102 projects are now analyzable.
  Project-level rollup is any-slice-positive (matches Web3Bugs's project-level
  GT). Vendored/test files (OpenZeppelin, mocks, `*.t.sol`) are excluded;
  slices capped at 40/project with logging.
- **Access-Control slice (`eval/loaders/access_control_slice.py`)** — the only
  backbone set with real AC-NEGATIVE signal: 35 AC-positive + 125 AC-negative
  (contracts vulnerable in other ways). This is what lets us measure AC
  *precision*, which the all-positive datasets mechanically cannot.
- **Protocol:** per-item latency captured; seed namespacing for the ≥3-seed
  mean±std protocol (`--seed`); `$/contract = $0` (local/free). metrics.py
  already does per-category + macro/micro + confusion matrix.

### Phase B — model-diverse council (8 OWASP specialists)
`services/council.py`. Eight single-class specialists (reentrancy,
access_control, arithmetic, business_logic, oracle_price_manipulation,
flashloan_mev, dos_gas, proxy_upgradeability), each pinned to a base model:
- **local tier** (3 families): qwen2.5-coder:7b + llama3.1:8b + gemma3:4b
- **hosted tier** (2 families): Groq Llama-3.3-70B + Cerebras gpt-oss-120b

Aggregation is **evidence-anchored**: a finding whose `evidence_quote` does not
appear verbatim in the source is discarded *before* the agreement vote (this
killed a real false positive where a specialist quoted the prompt's own
few-shot example). Then ≥2 credible specialists, or 1 with conf≥0.8, → CONFIRMED.
Each finding carries a `proposed_property` (the invariant the dynamic layer
targets). `council_models_used` logs which model ran each role — verifiable
diversity, not asserted.

### Phase C — retrieval grounding
`services/retrieval.py`. Replaces the rejected self-referential ChromaDB corpus
with a **real exploit corpus** built from SmartBugs (143 records: code +
DASP-10 class + exploit/fix narrative). Embeddings prefer Ollama
(`nomic-embed-text`) and fall back to a pure-Python n-gram cosine (zero deps);
store prefers LanceDB, falls back to in-memory cosine. `find_similar(code, k)`
returns same-class precedents (verified: a reentrancy contract retrieves
reentrancy exploits at ~0.83). **Limitation:** precedents are surfaced in the
output but not yet injected into specialist prompts, so retrieval does not yet
change verdicts — that wiring is the next step.

### Phase D — evidence-anchored arbitration (the precision lever)
`services/arbitration.py`. For each confirmed finding: a RED-TEAM model (a
different family) argues it's a false positive, then a JUDGE renders a verdict
+ calibrated confidence under an evidence rubric (dynamic witness > static +
precedent > LLM-only), defaulting to not-a-bug on credible doubt.
**Key measured result: the judge model quality is decisive.** A local 8B judge
*inverted* verdicts on eth-046 (dropped the real reentrancy, kept noise). The
Cerebras gpt-oss-120b judge ran 70× faster (2.6s vs 187s) and correctly
collapsed 5 over-flags to 1 real finding. So arbitration uses Cerebras by
default (`arbitration_backend="cerebras"`). Honest residual: class-attribution
noise (the surviving finding was reentrancy but filed under the business_logic
card).

### Phase E — dynamic exploit confirmation (scaffold)
`services/dynamic.py`. Generates a Foundry test harness from a finding's class +
target function (templates for reentrancy, access_control), runs `forge test`,
and promotes SUSPECTED → CONFIRMED-EXPLOITABLE on a failing-assertion witness.
**Blocked from full demo here:** the Foundry installer (`curl | bash`) is denied
by the sandbox, so `forge` is absent — the module generates the harness and
reports `foundry_not_installed` (findings stay SUSPECTED, harness attached).
Run `foundryup` to enable live confirmation. Harness generation is
template-based, not general program synthesis (auto-exploiting arbitrary
contracts is an open problem, per the plan).

### Phase F — output/integration
`services/sarif.py` (SARIF 2.1.0), `argus_cli.py` (`argus scan <path>
[--sarif] [--json]`, exit 1 on NO-GO = CI gate), `.github/workflows/argus.yml`
(PR scan + SARIF upload, gated on a GROQ_API_KEY secret). Verified end-to-end.

### Phase G — UI/UX overhaul
`frontend/src/components/council/*`. GO/NO-GO banner, 8 specialist cards with
visible model+provider chips (the diversity story), severity/confidence badges,
SUSPECTED vs CONFIRMED-EXPLOITABLE PoC badges, precedent cards, Council/Standard
toggle. Dependency-free (React + Tailwind v4). Production build verified.

## Session 6 updates

- **Hosted tier now works without Groq.** The provided Groq key was invalid
  ("Invalid API Key"); the hosted tier defaults to a **Cerebras-dual** variant
  — `gpt-oss-120b` + `zai-glm-4.7`, two genuinely different model families on
  one provider. Restore a valid Groq key in `.env` to switch back to
  Groq+Cerebras. Added burst-429 retry + bounded concurrency (`COUNCIL_MAX_
  CONCURRENCY`) so the hosted free tier doesn't reject the 8-way fan-out.
- **A fast scale tier** (`backend="hosted_fast"`, all gpt-oss-120b) for
  thousands-scale batches (~5-10s/contract) vs the dual-family quality tier.
- **Live streaming**: `POST /api/analyze/council/stream` (SSE) emits per-
  specialist events for the UI's live processing view.
- **Benchmark/KPI API**: `GET /api/stats/benchmark` (real ablation + dataset
  vuln distributions + published baselines), snapshotted to
  `eval/results/benchmark_stats.json` so production serves real numbers without
  the gitignored datasets.
- **Dynamic confirmation now EXECUTES.** Foundry installed via Homebrew
  (`forge 1.7.1`). A self-contained workspace (`backend/dynamic_workspace/`,
  no forge-std, runs offline) produces a **verified reentrancy witness**:
  `[FAIL: REENTRANCY WITNESS: attacker drained funds beyond its 1 ETH deposit]`.
  Exposed at `GET /api/dynamic/reference-poc`. Per-arbitrary-contract auto-
  harness generation remains best-effort (open research problem).

## Honest status / what's blocked

| Item | Status |
|---|---|
| Hosted council diversity | **Works** via Cerebras-dual (gpt-oss-120b + zai-glm-4.7). Provided Groq key was invalid; local tier (3 families) also fully functional. |
| Dynamic confirmation | **Runs** — Foundry installed; reference reentrancy PoC produces a real witness. Auto-harness for arbitrary contracts is best-effort, not 100% (no tool achieves that). |
| "Thousands of contracts" | **Compute/quota-bound** — free tiers can't complete thousands in one session (Cerebras daily token cap; local ~48s/contract). Infrastructure is checkpointed/resumable + a fast tier exists; full thousands-run is a multi-day batch. This session: full SmartBugs-143 (local) + AC ablation. |
| Retrieval → prompts | Precedents surfaced, not yet fed into specialist prompts (no verdict effect yet). |
| GPTScan head-to-head | Not run — requires a paid OpenAI key. |
| DefiHacks | Dead (no source code), confirmed in prior sessions. |
| Live deploy | Pushed to GitHub for the teammate to deploy to Vercel; not deployed directly from here. |

## API surface (new this session)
- `POST /api/analyze/council/stream` — SSE live per-specialist events.
- `POST /api/analyze/argus` — full pipeline (retrieval→council→arbitration→dynamic), per-stage toggles.
- `GET /api/stats/benchmark` — KPI/ablation/distribution/baseline data.
- `GET /api/dynamic/reference-poc` — runs the Foundry reentrancy witness.
- `GET /api/retrieval/status` — corpus/embedding/store diagnostics.

## Reproduce

```bash
cd backend && source venv_mac/bin/activate   # or ./venv_mac/bin/python
# bounded ablation (the paper's per-stage delta table):
python -m eval.run_ablation --n-per-class 8 --seed 0
# full backbone council (multi-day; checkpointed/resumable):
python -m eval.run_baselines --datasets access_control_slice,smartbugs_curated,web3bugs --baselines council --llm-backend ollama --seed 0
# CLI:
python argus_cli.py scan path/to/Contract.sol --sarif out.sarif
```
