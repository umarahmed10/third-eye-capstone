# ThirdEye benchmark by tier — backend=ollama, seed=1

90 scored contracts. Prediction: NO-GO=vulnerable, GO=safe, INCONCLUSIVE=abstain (excluded from P/R/F1).

## Per-tier

| tier | expected | n | scored | inconcl. | TP | FP | TN | FN | precision | recall | F1 | accuracy |
|---|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| Audited libraries (OZ/Solady) | safe | 15 | 9 | 6 | 0 | 5 | 4 | 0 | 0.000 | — | 0.000 | 0.444 |
| Audit-reviewed, clean | safe | 15 | 11 | 4 | 0 | 6 | 5 | 0 | 0.000 | — | 0.000 | 0.455 |
| Real-world, no bug reported | safe | 15 | 13 | 2 | 0 | 6 | 7 | 0 | 0.000 | — | 0.000 | 0.538 |
| Curated vulnerable (SmartBugs-style) | vulnerable | 15 | 14 | 1 | 13 | 0 | 0 | 1 | 1.000 | 0.929 | 0.963 | 0.929 |
| Injected vulnerability | vulnerable | 15 | 11 | 4 | 10 | 0 | 0 | 1 | 1.000 | 0.909 | 0.952 | 0.909 |
| Real audit-report findings | vulnerable | 15 | 13 | 2 | 8 | 0 | 0 | 5 | 1.000 | 0.615 | 0.762 | 0.615 |

## Aggregates

| slice | n | scored | inconcl. | TP | FP | TN | FN | precision | recall | F1 | accuracy |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| SAFE (all safe tiers) | 45 | 33 | 12 | 0 | 17 | 16 | 0 | 0.000 | — | 0.000 | 0.485 |
| VULN (all vuln tiers) | 45 | 38 | 7 | 31 | 0 | 0 | 7 | 1.000 | 0.816 | 0.899 | 0.816 |
| OVERALL | 90 | 71 | 19 | 31 | 17 | 16 | 7 | 0.646 | 0.816 | 0.721 | 0.662 |

## API-call accounting (per-user rate-limit sizing)

- Total LLM calls across the run: **341** over 90 contracts.
- Calls per contract: min=1, median=4.0, mean=3.79, p95=6, max=7.
- A single scan makes up to this many LLM calls. Size a per-user limit as (acceptable concurrent scans) x (p95 calls/contract). e.g. p95=6 calls/scan -> allowing 2 scans/user/min ~= 12 calls/user/min.
