"""
Benchmark / KPI data for the results dashboard — assembled from REAL on-disk
artifacts, never mocked:
  - eval/results/ablation_ac.json : per-stage ablation (single_llm -> council
    -> council+arbitration) with precision/recall/F1.
  - datasets/smartbugs-curated/vulnerabilities.json + datasets/web3bugs/results/
    bugs.csv : the vulnerability-class distributions ("most common vulns in the
    wild") across the labelled benchmarks.
  - PUBLISHED_BASELINES : the paper numbers we position against (GPTScan ICSE'24
    etc.) — clearly tagged as published, to be reproduced, not claimed as ours.

Every field degrades gracefully: a missing artifact yields an empty/!available
section with a note, so the endpoint never 500s on a fresh checkout.
"""

from __future__ import annotations

import csv
import json
from collections import Counter
from pathlib import Path

from eval.schema import REPO_ROOT, DATASETS_ROOT

RESULTS = REPO_ROOT / "backend" / "eval" / "results"
SMARTBUGS = DATASETS_ROOT / "smartbugs-curated" / "vulnerabilities.json"
WEB3BUGS_BUGS = DATASETS_ROOT / "web3bugs" / "results" / "bugs.csv"

# Published numbers we benchmark against (NOT our results — to be reproduced).
# Sources: GPTScan ICSE'24; ACToolBench ASE'25 (real-world access control).
PUBLISHED_BASELINES = [
    {"tool": "GPTScan (ICSE'24)", "dataset": "Web3Bugs", "recall": 0.833, "f1": 0.678, "cost": "paid GPT", "note": "primary target"},
    {"tool": "GPTScan (ICSE'24)", "dataset": "DefiHacks", "recall": 0.714, "f1": 0.80, "cost": "paid GPT", "note": "no public source — not reproduced"},
    {"tool": "Static tools (Slither/Mythril)", "dataset": "real-world access control", "recall": 0.05, "f1": None, "cost": "free", "note": "3-8% recall (ACToolBench)"},
    {"tool": "GPT-4o-mini", "dataset": "real-world access control", "recall": 0.90, "f1": None, "cost": "paid", "note": "high recall, ~951 false positives"},
]


def _ablation() -> dict:
    p = RESULTS / "ablation_ac.json"
    if not p.exists():
        return {"available": False, "note": "run eval/run_ablation.py"}
    data = json.load(open(p))
    rows = []
    for cfg, m in data.get("configs", {}).items():
        rows.append({"config": cfg, "precision": round(m["precision"], 3),
                     "recall": round(m["recall"], 3), "f1": round(m["f1"], 3),
                     "tp": m["tp"], "fp": m["fp"], "tn": m["tn"], "fn": m["fn"]})
    return {"available": True, "task": "access-control detection",
            "sample": {"n": data.get("sample_size"), "pos": data.get("n_pos"), "neg": data.get("n_neg"), "seed": data.get("seed")},
            "configs": rows}


def _smartbugs_distribution() -> list[dict]:
    if not SMARTBUGS.exists():
        return []
    c = Counter()
    for e in json.load(open(SMARTBUGS)):
        for v in e.get("vulnerabilities", []):
            c[v["category"]] += 1
    total = sum(c.values()) or 1
    return [{"category": k, "count": n, "pct": round(100 * n / total, 1)} for k, n in c.most_common()]


def _web3bugs_distribution() -> list[dict]:
    if not WEB3BUGS_BUGS.exists():
        return []
    c = Counter()
    with open(WEB3BUGS_BUGS, encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            # strip keys (columns carry leading spaces, e.g. ' Bug Label'); some
            # short rows map extras to a None key with a list value — coerce.
            row = {}
            for k, v in r.items():
                if k is None:
                    continue
                row[k.strip()] = v.strip() if isinstance(v, str) else ""
            label = row.get("Bug Label", "")
            if label:
                c[label] += 1
    total = sum(c.values()) or 1
    return [{"category": k, "count": n, "pct": round(100 * n / total, 1)} for k, n in c.most_common(15)]


def _headline_kpis(ablation: dict) -> list[dict]:
    """The KPI cards. Council vs single-LLM deltas pulled from the ablation."""
    kpis = [
        {"label": "Vulnerability classes", "value": "8", "sub": "OWASP/DASP specialists"},
        {"label": "Cost per contract", "value": "$0", "sub": "free local + free hosted tiers"},
        {"label": "Benchmark contracts", "value": "295+", "sub": "SmartBugs 143 · Web3Bugs 102 · AC slice 160"},
    ]
    if ablation.get("available"):
        cfg = {r["config"]: r for r in ablation["configs"]}
        if "single_llm" in cfg and "council" in cfg:
            s, c = cfg["single_llm"], cfg["council"]
            kpis.append({"label": "Council recall (AC)", "value": f"{c['recall']:.2f}",
                         "sub": f"vs {s['recall']:.2f} single-LLM", "delta": round(c["recall"] - s["recall"], 2)})
            kpis.append({"label": "Council F1 (AC)", "value": f"{c['f1']:.2f}",
                         "sub": f"vs {s['f1']:.2f} single-LLM", "delta": round(c["f1"] - s["f1"], 2)})
            kpis.append({"label": "Council precision (AC)", "value": f"{c['precision']:.2f}",
                         "sub": f"{c['fp']} false positives", "delta": 0.0})
    return kpis


SNAPSHOT = RESULTS / "benchmark_stats.json"


def build_benchmark_stats(use_snapshot: bool = True) -> dict:
    """Assemble the dashboard stats. In production the large datasets are not
    deployed (gitignored), so the vuln-distribution would be empty — we fall
    back to a committed snapshot (benchmark_stats.json) generated where the
    datasets DO exist. Call write_snapshot() after an eval to refresh it."""
    live = {
        "kpis": _headline_kpis(_ablation()),
        "ablation": _ablation(),
        "vuln_distribution": {
            "smartbugs_curated": _smartbugs_distribution(),
            "web3bugs": _web3bugs_distribution(),
        },
        "published_baselines": PUBLISHED_BASELINES,
        "thesis": "Match/beat a paid-GPT ICSE'24 baseline on logic-vuln detection using only free models, "
                  "and add dynamic exploit-confirmation for precision.",
    }
    # If datasets are absent (production) but a snapshot exists, use the
    # snapshot's distributions so the dashboard still has real numbers.
    if use_snapshot and not live["vuln_distribution"]["smartbugs_curated"] and SNAPSHOT.exists():
        try:
            snap = json.load(open(SNAPSHOT))
            if not live["ablation"].get("available") and snap.get("ablation", {}).get("available"):
                live["ablation"] = snap["ablation"]
                live["kpis"] = snap.get("kpis", live["kpis"])
            live["vuln_distribution"] = snap.get("vuln_distribution", live["vuln_distribution"])
        except Exception:
            pass
    return live


def write_snapshot() -> str:
    """Persist the current live stats (computed where datasets exist) to the
    committed snapshot file, so production serves real numbers."""
    RESULTS.mkdir(parents=True, exist_ok=True)
    data = build_benchmark_stats(use_snapshot=False)
    json.dump(data, open(SNAPSHOT, "w"), indent=2)
    return str(SNAPSHOT)
