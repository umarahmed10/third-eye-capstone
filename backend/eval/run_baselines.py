"""
Runs the real baselines (Slither, single-LLM, current-ThirdEye) against the
benchmark datasets, with per-item checkpointing so a Groq rate-limit (or any
other interruption) doesn't waste already-spent quota on restart.

Checkpointing: one JSON file per (baseline, dataset, contract_id) under
eval/checkpoints/. If the file exists, the item is skipped entirely (not
even re-checked against the network) — restart-safe by construction, not
by accident.

Retry: a contract's analysis is retried with exponential backoff if
run_full_analysis() reports llm_error_detected=True in its stats (added in
services/llm.py specifically for this — covers 429s, timeouts, and
connection errors, since they all produce the same downstream symptom: a
silently empty result that looks identical to "genuinely no vulnerabilities
found" unless you check for the error marker explicitly).

Usage:
    cd backend
    python -m eval.run_baselines --help
    python -m eval.run_baselines --baselines slither --datasets smartbugs_curated --limit 5
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import time
from pathlib import Path

from dotenv import load_dotenv
load_dotenv()  # must run before importing eval.metrics -> services.llm reads LLM_BACKEND/GROQ_API_KEY at module-import time

from eval import metrics
from eval.loaders import etherscan50, smartbugs_curated, web3bugs
from eval.schema import EvalItem, REPO_ROOT

CHECKPOINT_ROOT = REPO_ROOT / "backend" / "eval" / "checkpoints"

# Statuses worth checkpointing permanently — deterministic given the same
# input, so re-running tomorrow would just reproduce the same outcome.
# "rate_limited_exhausted" and "error" are deliberately excluded: Groq's
# free tier enforces a 100k-token/24h ROLLING window (confirmed via direct
# API test), not a fixed daily reset — an item that exhausts retries today
# because the window is full will very likely succeed tomorrow once it
# drains. Checkpointing those permanently would silently and invisibly
# block every future day's retry, exactly the kind of self-inflicted
# wound a multi-day checkpointed run can't afford.
TERMINAL_STATUSES = {"ok", "no_result", "too_large_for_backend"}

LOADERS = {
    "smartbugs_curated": smartbugs_curated.load,
    "web3bugs": web3bugs.load,
    "etherscan50": etherscan50.load,
}

BASELINES = ["slither", "single_llm", "current_thirdeye", "council"]

MAX_RETRIES = 5
BASE_DELAY_SECONDS = 8


class DailyQuotaExhausted(Exception):
    """Groq's 100k-tokens/24h window is full. Every subsequent LLM call
    this run will fail identically until the window drains (confirmed via
    direct API test: a ~50min wait was quoted, far past anything our
    retry backoff covers) — so there's no point discovering that one
    item at a time. Raised to stop the whole run early and resume
    tomorrow via the normal checkpoint-skip mechanism."""


def _safe_id(contract_id: str) -> str:
    return re.sub(r"[^A-Za-z0-9_.-]", "_", contract_id)


def _checkpoint_path(baseline: str, dataset: str, contract_id: str) -> Path:
    return CHECKPOINT_ROOT / baseline / dataset / f"{_safe_id(contract_id)}.json"


def _load_checkpoint(path: Path) -> dict | None:
    if not path.exists():
        return None
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return None  # corrupt checkpoint — treat as missing, will be re-run


def _save_checkpoint(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    tmp.replace(path)  # atomic-ish on the same filesystem — avoids half-written checkpoints


async def _run_slither_baseline(item: EvalItem) -> dict:
    from services.slither import run_slither
    from services.llm import _parse_slither

    code = item.read_code()
    slither_out = await asyncio.to_thread(run_slither, code)
    if slither_out.get("status") != "completed":
        return {"status": "no_result", "reason": slither_out.get("status"), "slither_message": slither_out.get("message")}

    slither_vulns = _parse_slither(slither_out)
    predicted_label = "vulnerable" if slither_vulns else "likely_safe"
    predicted_categories = [v.get("type", "") for v in slither_vulns]
    return {
        "status": "ok",
        "predicted_label": predicted_label,
        "predicted_categories": predicted_categories,
        "raw_finding_count": len(slither_vulns),
    }


async def _run_llm_baseline(item: EvalItem, disable_slither: bool) -> dict:
    from services.llm import run_full_analysis

    code = item.read_code()
    last_error = None
    for attempt in range(MAX_RETRIES):
        try:
            result = await run_full_analysis(code, disable_slither=disable_slither)
        except Exception as e:
            last_error = f"exception: {e}"
            if attempt < MAX_RETRIES - 1:
                await asyncio.sleep(BASE_DELAY_SECONDS * (2 ** attempt))
                continue
            return {"status": "error", "reason": last_error}

        if result.get("stats", {}).get("llm_error_detected"):
            last_error = result.get("summary", "")[:200]
            # A 413 ("Request too large") is the prompt exceeding the
            # backend's per-request/TPM budget — deterministic given the
            # same input, not transient like a 429. Retrying just burns
            # 5 rounds of exponential backoff (up to ~2 minutes) for a
            # guaranteed-identical failure. Fail fast and let the dataset
            # report this as a real, distinct coverage gap instead.
            if "LLM Error 413" in last_error or "too large" in last_error.lower():
                return {"status": "too_large_for_backend", "reason": last_error}
            if "tokens per day" in last_error.lower() or "(tpd)" in last_error.lower():
                raise DailyQuotaExhausted(last_error)
            if attempt < MAX_RETRIES - 1:
                print(f"    [retry {attempt + 1}/{MAX_RETRIES}] llm_error_detected for {item.contract_id}, backing off {BASE_DELAY_SECONDS * (2 ** attempt)}s")
                await asyncio.sleep(BASE_DELAY_SECONDS * (2 ** attempt))
                continue
            return {"status": "rate_limited_exhausted", "reason": last_error}

        predicted_label = "vulnerable" if result.get("final_verdict") == "NO-GO" else "likely_safe"
        predicted_categories = [v.get("type", "") for v in result.get("vulnerabilities", [])]
        return {
            "status": "ok",
            "predicted_label": predicted_label,
            "predicted_categories": predicted_categories,
            "raw_finding_count": len(result.get("vulnerabilities", [])),
            "final_verdict": result.get("final_verdict"),
        }

    return {"status": "error", "reason": last_error or "unknown"}


async def _run_council_baseline(item: EvalItem, llm_backend: str) -> dict:
    from services.council import run_council

    code = item.read_code()
    last_error = None
    for attempt in range(MAX_RETRIES):
        try:
            result = await run_council(code, backend=llm_backend)
        except Exception as e:
            last_error = f"exception: {e}"
            if attempt < MAX_RETRIES - 1:
                await asyncio.sleep(BASE_DELAY_SECONDS * (2 ** attempt))
                continue
            return {"status": "error", "reason": last_error}

        if result.get("stats", {}).get("llm_error_detected"):
            last_error = result.get("summary", "")[:200]
            if "LLM Error 413" in last_error or "too large" in last_error.lower():
                return {"status": "too_large_for_backend", "reason": last_error}
            if "tokens per day" in last_error.lower() or "(tpd)" in last_error.lower():
                raise DailyQuotaExhausted(last_error)
            if attempt < MAX_RETRIES - 1:
                print(f"    [retry {attempt + 1}/{MAX_RETRIES}] llm_error_detected for {item.contract_id}, backing off {BASE_DELAY_SECONDS * (2 ** attempt)}s")
                await asyncio.sleep(BASE_DELAY_SECONDS * (2 ** attempt))
                continue
            return {"status": "rate_limited_exhausted", "reason": last_error}

        predicted_label = "vulnerable" if result.get("final_verdict") == "NO-GO" else "likely_safe"
        predicted_categories = [v.get("type", "") for v in result.get("vulnerabilities", [])]
        # Verifiable model-diversity log: which provider/model each
        # specialist actually ran on, not just an assertion that it did.
        models_used = [
            {"role": r["role"], "provider": r["provider"], "model": r["model"], "found": r["found"]}
            for r in result.get("council_detail", [])
        ]
        return {
            "status": "ok",
            "predicted_label": predicted_label,
            "predicted_categories": predicted_categories,
            "raw_finding_count": len(result.get("vulnerabilities", [])),
            "final_verdict": result.get("final_verdict"),
            "council_models_used": models_used,
        }

    return {"status": "error", "reason": last_error or "unknown"}


async def run_one(baseline: str, item: EvalItem, llm_backend: str = "groq") -> dict:
    if baseline == "slither":
        return await _run_slither_baseline(item)
    if baseline == "single_llm":
        return await _run_llm_baseline(item, disable_slither=True)
    if baseline == "current_thirdeye":
        return await _run_llm_baseline(item, disable_slither=False)
    if baseline == "council":
        return await _run_council_baseline(item, llm_backend)
    raise ValueError(f"unknown baseline: {baseline}")


async def run_dataset_baseline(baseline: str, dataset_name: str, items: list[EvalItem], llm_backend: str = "groq") -> dict:
    """Returns {contract_id: Prediction} for items with a usable result —
    items that errored/rate-limited out are reported but excluded from
    predictions (left as "no prediction" for the metrics module to count
    honestly rather than guessed at)."""
    preds: dict[str, metrics.Prediction] = {}
    counts = {"ok": 0, "skipped_checkpoint": 0, "no_result": 0, "error": 0, "rate_limited_exhausted": 0}

    for i, item in enumerate(items):
        ckpt_path = _checkpoint_path(baseline, dataset_name, item.contract_id)
        cached = _load_checkpoint(ckpt_path)
        if cached is not None:
            counts["skipped_checkpoint"] += 1
            result = cached
        else:
            if not item.code_paths or not all(p.exists() for p in item.code_paths):
                result = {"status": "no_result", "reason": "missing source file(s)"}
            else:
                result = await run_one(baseline, item, llm_backend)
            if result.get("status") in TERMINAL_STATUSES:
                result["_checkpointed_at"] = time.time()
                _save_checkpoint(ckpt_path, result)

        status = result.get("status", "error")
        counts[status] = counts.get(status, 0) + 1
        print(f"  [{baseline}/{dataset_name}] {i + 1}/{len(items)} {item.contract_id}: {status}")

        if status == "ok":
            preds[item.contract_id] = metrics.Prediction(
                contract_id=item.contract_id,
                predicted_label=result["predicted_label"],
                predicted_categories=result["predicted_categories"],
                category_taxonomy="thirdeye",
            )

    print(f"  [{baseline}/{dataset_name}] done: {counts}")
    return {"predictions": preds, "counts": counts}


def _check_backend_config(baselines: list[str], llm_backend: str) -> None:
    """Fail loud and immediate, not 30 minutes of wasted retries in: confirm
    LLM_BACKEND is actually what we think it is before spending any quota."""
    llm_dependent = {"single_llm", "current_thirdeye", "council"}
    if not llm_dependent.intersection(baselines):
        return
    backend = os.getenv("LLM_BACKEND", "ollama")
    print(f"LLM_BACKEND={backend!r} (from environment, after load_dotenv())")
    if backend != llm_backend:
        raise SystemExit(
            f"LLM_BACKEND is {backend!r}, not {llm_backend!r} — --llm-backend {llm_backend} requires "
            f"the environment to actually match (cwd must be backend/ when running "
            f"python -m eval.run_baselines)."
        )
    if backend == "groq" and not os.getenv("GROQ_API_KEY"):
        raise SystemExit("LLM_BACKEND=groq but GROQ_API_KEY is empty — check backend/.env.")
    if "council" in baselines and backend == "groq" and not os.getenv("CEREBRAS_API_KEY"):
        raise SystemExit(
            "council baseline with --llm-backend groq needs CEREBRAS_API_KEY (one specialist "
            "runs on Cerebras for genuine provider diversity) — check backend/.env."
        )


async def main(baselines: list[str], dataset_names: list[str], limit: int | None, llm_backend: str) -> None:
    # Must happen before services.llm is ever imported anywhere — it reads
    # LLM_BACKEND once at module-import time into a module-level constant,
    # not per-call. _run_llm_baseline()'s `from services.llm import ...` is
    # a lazy/local import, so as long as this runs first (it does — CLI
    # parsing always precedes the first baseline call), this is safe.
    os.environ["LLM_BACKEND"] = llm_backend
    _check_backend_config(baselines, llm_backend)
    datasets = {}
    for name in dataset_names:
        items = LOADERS[name]()
        if limit:
            items = items[:limit]
        datasets[name] = items
        print(f"Loaded {name}: {len(items)} item(s)")

    for baseline in baselines:
        for dataset_name, items in datasets.items():
            print(f"\n=== Running {baseline} on {dataset_name} ({len(items)} items) ===")
            try:
                await run_dataset_baseline(baseline, dataset_name, items, llm_backend)
            except DailyQuotaExhausted as e:
                # Groq-specific (a 100k-tokens/24h cap) — Ollama has no such
                # wall, and the string-matching that raises this exception
                # only ever fires on Groq's own error text, so this branch
                # is unreachable when llm_backend == "ollama" in practice.
                # Still handled explicitly for clarity rather than relying
                # on that being true forever.
                print(f"\n!!! Groq daily token quota exhausted: {e}")
                print("!!! Stopping this run early (not an error) — already-completed items are")
                print("!!! checkpointed, nothing was lost. Re-run this same command tomorrow (or")
                print("!!! once the 24h rolling window drains) to resume from where this stopped.")
                return


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run real baselines with checkpointing")
    parser.add_argument("--baselines", default=",".join(BASELINES), help="comma-separated subset of: " + ",".join(BASELINES))
    parser.add_argument("--datasets", default=",".join(LOADERS.keys()), help="comma-separated subset of: " + ",".join(LOADERS.keys()))
    parser.add_argument("--limit", type=int, default=None, help="limit items per dataset (for testing)")
    parser.add_argument("--llm-backend", choices=["groq", "ollama"], default="groq", help="which LLM_BACKEND to force for single_llm/current_thirdeye baselines")
    args = parser.parse_args()

    asyncio.run(main(
        baselines=args.baselines.split(","),
        dataset_names=args.datasets.split(","),
        limit=args.limit,
        llm_backend=args.llm_backend,
    ))
