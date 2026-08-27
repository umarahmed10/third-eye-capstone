# ThirdEye benchmark by tier — backend=ollama_noarb, seed=0

1089 scored contracts. Prediction: NO-GO=vulnerable, GO=safe, INCONCLUSIVE=abstain (excluded from P/R/F1).

## Per-tier

| tier | expected | n | scored | inconcl. | TP | FP | TN | FN | precision | recall | F1 | accuracy |
|---|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| Audited libraries (OZ/Solady) | safe | 166 | 166 | 0 | 0 | 39 | 127 | 0 | 0.000 | — | 0.000 | 0.765 |
| Audit-reviewed, clean | safe | 214 | 214 | 0 | 0 | 95 | 119 | 0 | 0.000 | — | 0.000 | 0.556 |
| Real-world, no bug reported | safe | 191 | 191 | 0 | 0 | 80 | 111 | 0 | 0.000 | — | 0.000 | 0.581 |
| Curated vulnerable (SmartBugs-style) | vulnerable | 214 | 214 | 0 | 185 | 0 | 0 | 29 | 1.000 | 0.864 | 0.927 | 0.864 |
| Injected vulnerability | vulnerable | 153 | 153 | 0 | 137 | 0 | 0 | 16 | 1.000 | 0.895 | 0.945 | 0.895 |
| Real audit-report findings | vulnerable | 151 | 151 | 0 | 109 | 0 | 0 | 42 | 1.000 | 0.722 | 0.838 | 0.722 |

## Aggregates

| slice | n | scored | inconcl. | TP | FP | TN | FN | precision | recall | F1 | accuracy |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| SAFE (all safe tiers) | 571 | 571 | 0 | 0 | 214 | 357 | 0 | 0.000 | — | 0.000 | 0.625 |
| VULN (all vuln tiers) | 518 | 518 | 0 | 431 | 0 | 0 | 87 | 1.000 | 0.832 | 0.908 | 0.832 |
| OVERALL | 1089 | 1089 | 0 | 431 | 214 | 357 | 87 | 0.668 | 0.832 | 0.741 | 0.724 |

## API-call accounting (per-user rate-limit sizing)

- Total LLM calls across the run: **4125** over 1089 contracts.
- Calls per contract: min=1, median=4, mean=3.79, p95=6, max=8.
- A single scan makes up to this many LLM calls. Size a per-user limit as (acceptable concurrent scans) x (p95 calls/contract). e.g. p95=6 calls/scan -> allowing 2 scans/user/min ~= 12 calls/user/min.
