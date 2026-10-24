# -*- coding: utf-8 -*-
"""Generate the site's project-history data from the real git log.

Written rather than hand-authored because a hand-written timeline drifts from
what actually happened, and this project's whole argument is about claims that
drift from their evidence. Every entry here is a commit that exists.

Note on dates: the repository's first commit is 2026-05-25. Any description of
this project as starting earlier is wrong, and the generated file carries the
true span so the page cannot claim otherwise.

    python scripts/build_history.py
"""
import json
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "frontend" / "src" / "site" / "history.json"

# Conventional-commit prefixes -> the kind of work it was.
KIND = [
    (r"^(audit|security|guard|integrity)", "integrity"),
    (r"^(fix|hotfix)", "fix"),
    (r"^(feat|add)", "feature"),
    (r"^(docs?|paper)", "writing"),
    (r"^(test|probe)", "testing"),
    (r"^(eval|bench|baselines?|validate|parity|ablation)", "evaluation"),
    (r"^(refactor|chore|build|deps?)", "maintenance"),
]

# Commits that mark a real turning point. Matched on the subject line, so a
# reworded commit drops out of this list rather than silently mislabelling one.
MILESTONES = {
    "Initial commit": "Project starts — full-stack auditor scaffold",
    "static-routed council": "The router lands: stop asking all 8 specialists every time",
    "fail-closed": "Fail-closed verdict — a broken run can no longer return GO",
    "evidence": "Evidence gate: a finding must quote the source to survive",
    "arbitration": "Adversarial arbitration added as the precision lever",
    "asymmetr": "Asymmetric terminal rule — GO with errors is unsound, NO-GO is not",
    "dead": "Dead-arm detector — a stage that produced nothing is no longer 'finished'",
    "C3": "Out-of-sample validation refutes our own tuned configuration",
    "local-only": "Tool goes local-only: no key, no network, nothing leaves the machine",
}


def sh(*args: str) -> str:
    return subprocess.run(
        ["git", *args], cwd=ROOT, capture_output=True, text=True, check=True
    ).stdout


def classify(subject: str) -> str:
    low = subject.lower()
    for pattern, kind in KIND:
        if re.match(pattern, low):
            return kind
    return "other"


_SEEN: set[str] = set()


def milestone_for(subject: str) -> str | None:
    """First commit to match each key wins.

    A milestone is when a thing LANDED. Matching every later commit that
    mentions it produced "Adversarial arbitration added" four times on four
    different days, which reads as four events and was one. Commits arrive in
    chronological order (--reverse), so the first match is the real date.
    """
    low = subject.lower()
    for key, label in MILESTONES.items():
        if key.lower() in low and key not in _SEEN:
            _SEEN.add(key)
            return label
    return None


def main() -> int:
    raw = sh("log", "--reverse", "--date=short", "--format=%H%x1f%ad%x1f%s")
    commits = []
    for line in raw.splitlines():
        if not line.strip():
            continue
        sha, date, subject = line.split("\x1f", 2)
        commits.append(
            {
                "sha": sha[:7],
                "date": date,
                "subject": subject,
                "kind": classify(subject),
                "milestone": milestone_for(subject),
            }
        )

    if not commits:
        print("no commits found", file=sys.stderr)
        return 1

    # Month buckets, so the page can show the shape of the work over time.
    months: dict[str, dict] = {}
    for c in commits:
        key = c["date"][:7]
        m = months.setdefault(key, {"month": key, "n": 0, "kinds": {}, "milestones": []})
        m["n"] += 1
        m["kinds"][c["kind"]] = m["kinds"].get(c["kind"], 0) + 1
        if c["milestone"]:
            m["milestones"].append({"sha": c["sha"], "date": c["date"], "label": c["milestone"]})

    data = {
        "first_commit": commits[0]["date"],
        "last_commit": commits[-1]["date"],
        "total": len(commits),
        "months": [months[k] for k in sorted(months)],
        # Full log, so the page can show every iteration, not just highlights.
        "commits": commits,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, indent=2), encoding="utf-8")
    print(f"{len(commits)} commits, {data['first_commit']} -> {data['last_commit']}")
    print(f"wrote {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
