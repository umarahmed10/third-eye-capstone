"""
Argus orchestrator — chains the phases into one pipeline with per-stage
toggles, which is exactly what the ablation table needs (single-LLM ->
+council -> +retrieval -> +arbitration -> +dynamic, one row each).

    retrieval grounding  (Phase 2, services/retrieval.py)
        -> model-diverse council  (Phase 3, services/council.py)
        -> evidence-anchored arbitration  (Phase 5, services/arbitration.py)
        -> dynamic exploit confirmation  (Phase 4, services/dynamic.py)

Each stage is independently switchable so a single code path produces every
ablation configuration — no divergent pipelines to keep in sync. The council
and run_full_analysis() modules are untouched; this only composes them.
"""

import os
from services.council import run_council


async def run_argus(
    code: str,
    backend: str | None = None,
    seed: int | None = None,
    use_retrieval: bool = True,
    use_arbitration: bool = True,
    use_dynamic: bool = True,
    arbitration_backend: str | None = None,
) -> dict:
    """Full Argus pipeline with ablation toggles.

    backend: council tier ("ollama" | "groq").
    arbitration_backend: judge tier — defaults to "cerebras" when a Cerebras
        key is configured (a strong judge is required; a local 8B judge was
        measured to adjudicate unreliably), else falls back to `backend`.
    Returns the council schema, augmented with retrieval/arbitration/dynamic
    detail and a `pipeline` block recording which stages ran."""
    backend = backend or os.getenv("LLM_BACKEND", "ollama").lower()
    stages = {"retrieval": False, "council": True, "arbitration": False, "dynamic": False}

    similar = []
    if use_retrieval:
        try:
            from services.retrieval import find_similar
            similar = await find_similar(code, k=3)
            stages["retrieval"] = True
        except Exception as e:
            similar = []
            stages["retrieval_error"] = str(e)[:200]

    result = await run_council(code, similar_exploits=similar, backend=backend, seed=seed)

    if use_arbitration and result.get("vulnerabilities"):
        from services.arbitration import run_arbitration
        ab = arbitration_backend
        if ab is None:
            ab = "cerebras" if os.getenv("CEREBRAS_API_KEY") else backend
        result = await run_arbitration(code, result, backend=ab, seed=seed)
        stages["arbitration"] = True
        stages["arbitration_backend"] = ab

    if use_dynamic:
        from services.dynamic import confirm_findings
        result = await confirm_findings(code, result)
        stages["dynamic"] = True

    result["pipeline"] = stages
    result["mode"] = "argus"
    return result
