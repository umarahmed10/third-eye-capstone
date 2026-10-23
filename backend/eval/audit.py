"""Audit EVERY checkpoint tree for contamination, and say which claims survive.

WHY. On 2026-10-09 we found that A2's safe arm was 145/176 INCONCLUSIVE from a
backend outage -- PAPER_FACTS had already caught that one and marked it
UNSOUND. On 2026-10-23 we found the SAME defect in the VULNERABLE arm, which
PAPER_FACTS marks SOUND and whose numbers are in the abstract: of 20 paired
rows scored in both arms, exactly ONE had an intact council in both.

The lesson is not "check the ctx arms". It is that contamination was found
twice, by hand, in the two places someone happened to look. This script looks
everywhere, every time, so the question "is this number clean?" is answered by
running something rather than by remembering.

THE BIAS DIRECTION IS THE POINT. A specialist that errored can only fail to
raise a flag, never invent one. So contamination does not add noise
symmetrically -- it pushes verdicts toward GO. In an arm measuring RECALL that
depresses recall; if the contaminated arm is the one you are arguing is worse,
the contamination manufactures your result. That is why a "sound" label has to
mean intact-council, not merely terminal, wherever two arms are COMPARED.

Usage:
    python -m eval.audit               # everything
    python -m eval.audit --json out.json
"""

from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path

CKPT = Path(__file__).resolve().parent / "checkpoints"
TERMINAL = ("GO", "NO-GO")


def load_tree(pattern: str) -> dict[str, list[dict]]:
    out: dict[str, list[dict]] = {}
    for d in sorted(CKPT.glob(pattern)):
        if not d.is_dir() or d.name in ("_transient", "_poisoned", "_pre8b", "_8b_run"):
            continue
        rows = []
        for f in sorted(d.glob("*.json")):
            try:
                rows.append(json.load(open(f, encoding="utf-8")))
            except Exception:  # noqa: BLE001
                rows.append({"_unreadable": True})
        if rows:
            out[str(d.relative_to(CKPT))] = rows
    return out


def classify(rows: list[dict]) -> dict:
    """Three tiers, because they answer different questions.

    terminal      -- has a usable verdict at all
    intact        -- terminal AND no specialist errored (required for PAIRED
                     comparisons, where a missing specialist in one arm makes
                     the pair non-comparable)
    asym_sound    -- terminal under the asymmetric rule: NO-GO is sound even
                     with errors, GO is not. Correct for single-arm detection
                     questions, WRONG for paired ones.
    """
    n = len(rows)
    unreadable = sum(1 for r in rows if r.get("_unreadable"))
    verdicts = Counter((r.get("verdict") or "?") for r in rows)
    terminal = [r for r in rows if (r.get("verdict") or "").upper() in TERMINAL]
    intact = [r for r in terminal if not r.get("specialists_errored")]
    asym = [r for r in terminal
            if (r.get("verdict") or "").upper() == "NO-GO" or not r.get("specialists_errored")]
    return {
        "n": n,
        "unreadable": unreadable,
        "verdicts": dict(verdicts),
        "terminal": len(terminal),
        "intact_council": len(intact),
        "asym_sound": len(asym),
        "contaminated_pct": round(100 * (len(terminal) - len(intact)) / len(terminal), 1) if terminal else None,
    }


def paired(a: list[dict], b: list[dict]) -> dict:
    """What a PAIRED comparison actually has to work with."""
    A = {r.get("contract_id"): r for r in a if r.get("contract_id")}
    B = {r.get("contract_id"): r for r in b if r.get("contract_id")}
    common = set(A) & set(B)
    both_term = [c for c in common
                 if (A[c].get("verdict") or "").upper() in TERMINAL
                 and (B[c].get("verdict") or "").upper() in TERMINAL]
    both_intact = [c for c in both_term
                   if not A[c].get("specialists_errored") and not B[c].get("specialists_errored")]
    return {"common": len(common), "scored_both": len(both_term),
            "intact_both": len(both_intact),
            "usable_pct": round(100 * len(both_intact) / len(both_term), 1) if both_term else None}


def verdict_line(label: str, s: dict) -> str:
    c = s["contaminated_pct"]
    flag = ""
    if c is not None:
        flag = "  CLEAN" if c == 0 else (f"  {c}% contaminated" if c < 25 else f"  *** {c}% CONTAMINATED ***")
    return (f"  {label:<34} n={s['n']:<5} terminal={s['terminal']:<5} "
            f"intact={s['intact_council']:<5} asym={s['asym_sound']:<5}{flag}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", type=Path, default=None)
    a = ap.parse_args()

    report = {}
    print("=" * 94)
    print("CHECKPOINT CONTAMINATION AUDIT")
    print("  terminal = has a verdict | intact = no specialist errored | asym = NO-GO-or-clean-GO")
    print("=" * 94)

    for pat in ("benchmark/*/seed*", "ctx_*", "parity_*", "web3bugs", "arb_sweep", "ablation/*/*"):
        trees = load_tree(pat)
        if not trees:
            continue
        print(f"\n[{pat}]")
        for name, rows in trees.items():
            s = classify(rows)
            report[name] = s
            print(verdict_line(name, s))

    # The paired comparisons the paper actually reports.
    print("\n" + "=" * 94)
    print("PAIRED COMPARISONS — what the claim can legitimately rest on")
    print("=" * 94)
    pairs = [("ctx_ctx4k", "ctx_ctx16k", "FINDING 3 vulnerable arm (recall 12.5% -> 81.2%, p=0.0162)"),
             ("ctx_ctx4k_safe", "ctx_ctx16k_safe", "FINDING 3 safe arm (already marked UNSOUND)"),
             ("parity_full3b", "parity_full8b", "model capacity on the hot role (p=0.0303)")]
    for x, y, what in pairs:
        tx, ty = load_tree(x), load_tree(y)
        if not tx or not ty:
            print(f"\n  {what}\n    (missing one arm)")
            continue
        p = paired(list(tx.values())[0], list(ty.values())[0])
        report[f"paired:{x}|{y}"] = p
        warn = ""
        if p["intact_both"] is not None and p["intact_both"] < 20:
            warn = "   <-- TOO FEW INTACT PAIRS TO SUPPORT A CLAIM"
        print(f"\n  {what}")
        print(f"    common={p['common']}  scored in both={p['scored_both']}  "
              f"INTACT IN BOTH={p['intact_both']} ({p['usable_pct']}%)" + warn)

    print("\n" + "=" * 94)
    print("Rule of thumb: a PAIRED claim needs intact_both, not scored_both. A dead")
    print("specialist can only suppress a flag, so contamination biases toward GO --")
    print("which in a recall comparison MANUFACTURES the effect rather than hiding it.")
    if a.json:
        json.dump(report, open(a.json, "w"), indent=2)
        print(f"\nwrote {a.json}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
