<img src="https://r2cdn.perplexity.ai/pplx-full-logo-primary-dark%402x.png" style="height:64px;margin-right:32px"/>

# so basically we only use the sol files and label them

Yes—at this stage, treating your **Solidity files as the dataset** and labeling them is enough, and it fits your current codebase well.[^1]

Concretely:

- Use only the `.sol` contracts from `thirdeye-datasets` (safe + vulnerable examples).
- For each file, assign labels like:
    - `class`: `safe` / `vulnerable`
    - `vuln_types`: e.g., `["reentrancy", "access_control"]`
    - maybe `expected_severity`: `LOW/MEDIUM/HIGH/CRITICAL`
- Store those labels in a simple structure:
    - either a CSV or JSON index (e.g., `datasets/index.json`), or
    - encode them in folder names (`datasets/reentrancy/*.sol`, `datasets/safe/*.sol`).

Your batch script then:

1. Reads a `.sol` file + its labels.
2. Calls the existing `run_full_analysis(code, similar)` pipeline.[^1]
3. Logs both:
    - the **ground‑truth labels** you assigned, and
    - the **predicted** vulnerabilities / verdict from ThirdEye.

That lets you say, very honestly in the presentation:
“We prepared a labelled corpus of Solidity contracts and ran our full ThirdEye pipeline on it to evaluate detection of reentrancy, access‑control, DOS, etc.”

<div align="center">⁂</div>

[^1]: thirdeye-code-export.txt

