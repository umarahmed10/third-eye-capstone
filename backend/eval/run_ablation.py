"""
Ablation runner — the paper's core table (GATE 3 / GATE 5): does each added
stage actually improve detection on a benchmark with real negative-class
signal?

Runs, on a balanced sample of the Access-Control slice (the only backbone set
with genuine AC-negatives), these configurations in ablation order:

    single_llm                  : one model, no council (services/llm.py)
    council                     : 8 model-diverse specialists, evidence-gated
    council+retrieval           : council with exploit-corpus precedents
    council+arbitration         : council -> cross-model red-team/judge (Cerebras)

Metric is ACCESS-CONTROL-SPECIFIC, not generic "found any bug": a contract is
predicted AC-positive iff the configuration confirms an access_control finding.
The 125 AC-negative contracts (vulnerable in OTHER ways) supply the false-
positive signal that the all-positive datasets cannot. We report precision,
recall, F1, and the confusion matrix per configuration.

Honest scope: this runs a SAMPLE (default 24 balanced items, single-file only)
so it completes on a laptop without the multi-day full-dataset batch. Sample
size and composition are printed and written into the report. Full-dataset runs
use eval/run_baselines.py with the same code paths; this is the fast ablation
that shows the per-stage deltas.
"""

from __future__ import annotations

import asyncio
import json
import os
import time
from pathlib import Path

from dotenv import load_dotenv
load_dotenv()

from eval import guard
from eval.loaders import access_control_slice
from eval.schema import REPO_ROOT

RESULTS = REPO_ROOT / "backend" / "eval" / "results"
CKPT = REPO_ROOT / "backend" / "eval" / "checkpoints" / "ablation"

AC = "access_control"


def _is_ac_prediction(vulns: list[dict]) -> bool:
    """A configuration predicts AC-positive iff it confirms a finding whose
    type is access_control (substring-tolerant: 'access_control', 'access
    control', 'tx.origin' all count)."""
    for v in vulns:
        t = str(v.get("type", "")).lower()
        if "access" in t or "tx.origin" in t or "tx_origin" in t or "auth" in t:
            return True
    return False


# Council health for the config that just ran. The ablation rows recorded
# pred/ok/error and nothing about whether the council was intact, so a
# `pred=False` produced by a council with three dead specialists was
# indistinguishable from a genuine clean negative -- and eval/audit.py, keying
# on a field these rows never carried, reported the whole tree as CLEAN. A
# dead specialist can only suppress a finding, so in an ablation whose metric
# is detection that bias runs straight into the result. Recorded per row now.
_LAST_HEALTH: dict = {}


def _note_health(stats: dict) -> None:
    _LAST_HEALTH.clear()
    _LAST_HEALTH.update({
        "specialists_run": stats.get("specialists_run"),
        "specialists_errored": stats.get("specialists_errored"),
        "llm_error_detected": stats.get("llm_error_detected"),
    })


async def _single_llm(code: str) -> list[dict]:
    from services.llm import run_full_analysis
    r = await run_full_analysis(code, disable_slither=True)
    _note_health(r.get("stats") or {})
    return r.get("vulnerabilities", [])


async def _council(code: str, seed: int, use_retrieval: bool, use_arbitration: bool) -> list[dict]:
    from services.pipeline import run_thirdeye
    r = await run_thirdeye(code, backend="ollama", seed=seed,
                        use_retrieval=use_retrieval, use_arbitration=use_arbitration,
                        use_dynamic=False)
    # EVIDENCE THAT IT RAN. council+arbitration returned cells byte-identical to
    # plain council, which is either a real null result or a stage that never
    # executed -- and those are not the same claim. Record the judge's footprint
    # so the report can tell them apart instead of asserting "no gain" on faith.
    if use_arbitration:
        dropped = len(r.get("dropped_by_arbitration") or [])
        judged = sum(1 for v in (r.get("vulnerabilities") or []) if v.get("arbitration"))
        _ARB_EVIDENCE.append((judged, dropped))
    _note_health(r.get("stats") or {})
    return r.get("vulnerabilities", [])


# (judged, dropped) per arbitrated contract; summarised in the report.
_ARB_EVIDENCE: list[tuple[int, int]] = []


# council+retrieval is intentionally omitted from the RUN: retrieved
# precedents are currently surfaced in the output but NOT injected into the
# specialist prompts, so its verdicts are identical to plain council by
# construction — computing it would just burn 8 LLM calls/item for a
# guaranteed no-delta row. Noted in the report. Wiring precedents into prompts
# is the next retrieval-grounding step.
CONFIGS = {
    "single_llm": lambda code, seed: _single_llm(code),
    "council": lambda code, seed: _council(code, seed, False, False),
    "council+arbitration": lambda code, seed: _council(code, seed, True, True),
}


def _confusion(rows: list[dict], config: str) -> dict:
    tp = fp = tn = fn = 0
    for r in rows:
        if config not in r["pred"]:
            continue
        actual = r["is_ac"]
        pred = r["pred"][config]
        if actual and pred:
            tp += 1
        elif actual and not pred:
            fn += 1
        elif not actual and pred:
            fp += 1
        else:
            tn += 1
    p = tp / (tp + fp) if (tp + fp) else 0.0
    rec = tp / (tp + fn) if (tp + fn) else 0.0
    f1 = 2 * p * rec / (p + rec) if (p + rec) else 0.0
    acc = (tp + tn) / (tp + fp + tn + fn) if (tp + fp + tn + fn) else 0.0
    return {"tp": tp, "fp": fp, "tn": tn, "fn": fn, "precision": p, "recall": rec, "f1": f1, "accuracy": acc}


def _single_llm_model() -> str:
    """Read the model actually used, never a literal.

    The report previously hardcoded 'llama3.1:8b (single)' and 'council +
    Cerebras gpt-oss-120b judge'. Both were false on 2026-10-23: the logic
    model is llama3.2:3b (measured better, see scripts/env.sh) and the judge
    runs on local ollama -- there is no cloud in this pipeline at all. A table
    that misreports its own configuration is precisely the defect this paper
    is about, so the labels are now derived.
    """
    return os.getenv("OLLAMA_SINGLE_MODEL") or os.getenv("OLLAMA_LOGIC_MODEL", "llama3.2:3b")


def _council_models() -> str:
    try:
        from services.council import specialist_assignments
        models = sorted({m for _p, m in specialist_assignments("ollama").values()})
        return " + ".join(models)
    except Exception:  # noqa: BLE001 — a label must never break the report
        return "(could not read specialist assignments)"


def _arb_backend() -> str:
    return os.getenv("ARB_BACKEND", "ollama")


def _ckpt_path(config: str, cid: str, seed: int) -> Path:
    safe = cid.replace("/", "_").replace(":", "_")
    return CKPT / f"seed{seed}" / config / f"{safe}.json"


async def main(n_per_class: int = 12, seed: int = 0):
    items = access_control_slice.load()
    # single-file only (fast, deterministic); split by label, balanced.
    single = [it for it in items if len(it.code_paths) == 1 and it.code_paths[0].exists()]
    pos = [it for it in single if it.ground_truth_label == "vulnerable"][:n_per_class]
    neg = [it for it in single if it.ground_truth_label == "likely_safe"][:n_per_class]
    sample = pos + neg
    print(f"Ablation sample: {len(pos)} AC-positive + {len(neg)} AC-negative = {len(sample)} items (seed={seed})")

    # REFUSE rather than report nothing as something. On 2026-10-23 this ran
    # with 17 positives and ZERO negatives -- the dataset had not been synced --
    # and produced a correctly formatted table of 0.000s that was written to
    # results/ and looked like a finding. An all-positive sample cannot measure
    # the false positives this table exists to measure, so an empty or
    # single-class sample is a configuration error, not a result.
    if not pos or not neg:
        raise SystemExit(
            f"ABORT: ablation needs BOTH classes and has {len(pos)} AC-positive / "
            f"{len(neg)} AC-negative. The AC-negatives are the entire point of this "
            f"table -- they are the only real negative-class signal in the benchmark. "
            f"Check that datasets/ is fully synced (the web3bugs clone supplies the "
            f"negatives, smartbugs-curated the positives)."
        )

    # This runner had the bug the guard exists for, in its purest form: an
    # exception was caught, printed, and then checkpointed as `pred = False`.
    # A backend failure therefore became a NEGATIVE PREDICTION -- permanently,
    # since the checkpoint is reused -- which lowers recall for whichever
    # config happened to be running when the backend hiccuped. An ablation
    # exists precisely to compare configs, so noise that attaches to one config
    # is the one kind of noise that cannot be tolerated here.
    g = guard.Guard("ablation", terminal_fn=lambda r: bool(r.get("ok")),
                    max_consecutive=6, window=20)

    rows = []
    for i, it in enumerate(sample):
        code = it.read_code()
        is_ac = it.ground_truth_label == "vulnerable"
        pred = {}
        for config, fn in CONFIGS.items():
            cp = _ckpt_path(config, it.contract_id, seed)
            if cp.exists():
                pred[config] = json.load(open(cp))["pred"]
                continue
            t0 = time.time()
            ok, p, err = True, False, None
            _LAST_HEALTH.clear()
            try:
                vulns = await fn(code, seed)
                p = _is_ac_prediction(vulns)
            except Exception as e:
                print(f"  ! {config} failed on {it.contract_id}: {e}")
                ok, err = False, str(e)[:200]
            dt = round(time.time() - t0, 1)
            row = {"pred": p, "latency_s": dt, "is_ac": is_ac, "ok": ok, "error": err,
                   **_LAST_HEALTH}
            cp.parent.mkdir(parents=True, exist_ok=True)
            try:
                terminal = g.write(row, cp)
            except guard.RunAborted:
                guard.record_stage(g.summary())
                raise
            if terminal:
                pred[config] = p
            print(f"  [{i+1}/{len(sample)}] {it.contract_id} {config}: "
                  + (f"pred_ac={p} ({dt}s)" if terminal else f"QUARANTINED ({dt}s)"))
        # A contract missing any config is dropped whole. Comparing config A on
        # 24 contracts against config B on 21 is not an ablation, and the three
        # B is missing are the ones that timed out, i.e. the hardest.
        if len(pred) == len(CONFIGS):
            rows.append({"cid": it.contract_id, "is_ac": is_ac, "pred": pred})
        else:
            print(f"  - dropping {it.contract_id}: only {len(pred)}/{len(CONFIGS)} configs completed")

    print(g.line())
    guard.record_stage(g.summary())

    # Build report
    reports = {c: _confusion(rows, c) for c in CONFIGS}
    RESULTS.mkdir(parents=True, exist_ok=True)
    json.dump({"sample_size": len(sample), "n_pos": len(pos), "n_neg": len(neg),
               "seed": seed, "configs": reports, "rows": rows},
              open(RESULTS / "ablation_ac.json", "w"), indent=2)

    lines = [
        "# Ablation — Access-Control detection (single-file balanced sample)",
        "",
        f"Sample: {len(pos)} AC-positive + {len(neg)} AC-negative = {len(sample)} contracts, seed={seed}.",
        "Metric: AC-specific — a config is positive iff it confirms an access_control finding.",
        "AC-negatives are contracts vulnerable in OTHER ways, so a positive there is a real false positive.",
        "",
        "| config | model(s) | TP | FP | TN | FN | precision | recall | F1 |",
        "|---|---|---|---|---|---|---|---|---|",
    ]
    model_labels = {
        "single_llm": _single_llm_model(),
        "council": _council_models(),
        "council+retrieval": "council + exploit-corpus precedents",
        "council+arbitration": "council + retrieval + arbitration (" + _arb_backend() + ")",
    }
    for c in CONFIGS:
        r = reports[c]
        lines.append(f"| {c} | {model_labels[c]} | {r['tp']} | {r['fp']} | {r['tn']} | {r['fn']} | "
                     f"{r['precision']:.3f} | {r['recall']:.3f} | {r['f1']:.3f} |")
    # Did the judge actually run? "No gain" and "never executed" produce the
    # same table, and only one of them is a finding.
    if _ARB_EVIDENCE:
        n = len(_ARB_EVIDENCE)
        judged = sum(j for j, _d in _ARB_EVIDENCE)
        dropped = sum(d for _j, d in _ARB_EVIDENCE)
        if judged or dropped:
            # Whether the arms AGREE is a fact about the table, so read it off
            # the table instead of asserting it. This sentence used to end
            # "...the identical row above is therefore a real null result",
            # hardcoded from the era when the two council arms produced
            # byte-identical rows. Once the judge was actually installed they
            # stopped being identical (precision 0.583 -> 0.923), and the
            # report went on claiming a null result directly beneath a table
            # showing a large effect. A conclusion that does not check its own
            # premise is the same defect as a checker that cannot fail.
            base, arb = reports.get("council"), reports.get("council+arbitration")
            same = bool(base and arb and all(
                base[k] == arb[k] for k in ("tp", "fp", "tn", "fn")))
            verdict = ("The two council rows above are identical, so this is a real null "
                       "result rather than a stage that never ran."
                       if same else
                       f"The arms DIFFER (council precision {base['precision']:.3f} vs "
                       f"{arb['precision']:.3f}), so arbitration has a measurable effect "
                       f"here; it is not a null result.")
            lines += ["", f"**Arbitration executed** on {n} contract-runs: {judged} findings "
                          f"carried a judge verdict, {dropped} were dropped by the judge. "
                          + verdict]
        else:
            lines += ["", f"**WARNING — arbitration did NOT run.** {n} contract-runs produced "
                          f"ZERO judged and ZERO dropped findings. The identical row above is "
                          f"NOT evidence of 'no gain'; do not cite it as such."]
    else:
        lines += ["", "**Arbitration evidence unavailable** — rows came from checkpoints written "
                      "before evidence recording existed. Re-run fresh before citing the "
                      "arbitration row."]

    (RESULTS / "ablation_ac.md").write_text("\n".join(lines) + "\n")
    print("\n" + "\n".join(lines))
    print(f"\nWrote {RESULTS / 'ablation_ac.md'}")


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--n-per-class", type=int, default=12)
    ap.add_argument("--seed", type=int, default=0)
    args = ap.parse_args()
    asyncio.run(main(args.n_per_class, args.seed))
