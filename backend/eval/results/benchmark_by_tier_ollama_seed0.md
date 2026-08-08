# ThirdEye benchmark by tier — backend=ollama, seed=0

1152 scored contracts. Prediction: NO-GO=vulnerable, GO=safe, INCONCLUSIVE=abstain (excluded from P/R/F1).

## Per-tier

| tier | expected | n | scored | inconcl. | TP | FP | TN | FN | precision | recall | F1 | accuracy |
|---|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| Audited libraries (OZ/Solady) | safe | 283 | 257 | 26 | 0 | 7 | 250 | 0 | 0.000 | — | 0.000 | 0.973 |
| Audit-reviewed, clean | safe | 625 | 609 | 16 | 0 | 12 | 597 | 0 | 0.000 | — | 0.000 | 0.980 |
| Real-world, no bug reported | safe | 217 | 217 | 0 | 0 | 0 | 217 | 0 | — | — | 0.000 | 1.000 |
| Curated vulnerable (SmartBugs-style) | vulnerable | 27 | 0 | 27 | 0 | 0 | 0 | 0 | — | — | — | — |
| Injected vulnerability | vulnerable | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — | — | — | — |
| Real audit-report findings | vulnerable | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — | — | — | — |

## Aggregates

| slice | n | scored | inconcl. | TP | FP | TN | FN | precision | recall | F1 | accuracy |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| SAFE (all safe tiers) | 1125 | 1083 | 42 | 0 | 19 | 1064 | 0 | 0.000 | — | 0.000 | 0.982 |
| VULN (all vuln tiers) | 27 | 0 | 27 | 0 | 0 | 0 | 0 | — | — | — | — |
| OVERALL | 1152 | 1083 | 69 | 0 | 19 | 1064 | 0 | 0.000 | — | 0.000 | 0.982 |

## API-call accounting (per-user rate-limit sizing)

- Total LLM calls across the run: **13142** over 1152 contracts.
- Calls per contract: min=1, median=10.0, mean=11.41, p95=24, max=147.
- A single scan makes up to this many LLM calls. Size a per-user limit as (acceptable concurrent scans) x (p95 calls/contract). e.g. p95=24 calls/scan -> allowing 2 scans/user/min ~= 48 calls/user/min.
