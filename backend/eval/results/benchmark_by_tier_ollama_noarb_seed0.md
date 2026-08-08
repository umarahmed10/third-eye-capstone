# ThirdEye benchmark by tier — backend=ollama_noarb, seed=0

232 scored contracts. Prediction: NO-GO=vulnerable, GO=safe, INCONCLUSIVE=abstain (excluded from P/R/F1).

## Per-tier

| tier | expected | n | scored | inconcl. | TP | FP | TN | FN | precision | recall | F1 | accuracy |
|---|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| Audited libraries (OZ/Solady) | safe | 37 | 37 | 0 | 0 | 20 | 17 | 0 | 0.000 | — | 0.000 | 0.459 |
| Audit-reviewed, clean | safe | 40 | 40 | 0 | 0 | 26 | 14 | 0 | 0.000 | — | 0.000 | 0.350 |
| Real-world, no bug reported | safe | 47 | 47 | 0 | 0 | 33 | 14 | 0 | 0.000 | — | 0.000 | 0.298 |
| Curated vulnerable (SmartBugs-style) | vulnerable | 47 | 47 | 0 | 44 | 0 | 0 | 3 | 1.000 | 0.936 | 0.967 | 0.936 |
| Injected vulnerability | vulnerable | 31 | 31 | 0 | 30 | 0 | 0 | 1 | 1.000 | 0.968 | 0.984 | 0.968 |
| Real audit-report findings | vulnerable | 30 | 30 | 0 | 26 | 0 | 0 | 4 | 1.000 | 0.867 | 0.929 | 0.867 |

## Aggregates

| slice | n | scored | inconcl. | TP | FP | TN | FN | precision | recall | F1 | accuracy |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| SAFE (all safe tiers) | 124 | 124 | 0 | 0 | 79 | 45 | 0 | 0.000 | — | 0.000 | 0.363 |
| VULN (all vuln tiers) | 108 | 108 | 0 | 100 | 0 | 0 | 8 | 1.000 | 0.926 | 0.962 | 0.926 |
| OVERALL | 232 | 232 | 0 | 100 | 79 | 45 | 8 | 0.559 | 0.926 | 0.697 | 0.625 |

## API-call accounting (per-user rate-limit sizing)

- Total LLM calls across the run: **879** over 232 contracts.
- Calls per contract: min=1, median=4.0, mean=3.79, p95=6, max=7.
- A single scan makes up to this many LLM calls. Size a per-user limit as (acceptable concurrent scans) x (p95 calls/contract). e.g. p95=6 calls/scan -> allowing 2 scans/user/min ~= 12 calls/user/min.
