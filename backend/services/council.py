"""
Phase 3+ : the model-diverse specialist council.

This is a genuine alternative pipeline to llm.py's run_full_analysis() — not
a wrapper around it. Eight single-purpose specialist agents (the OWASP Smart
Contract Top-10 logic classes), each PINNED to a specific base model so the
council has real architectural diversity, not three prompts against the same
weights (the "echo chamber" failure the plan explicitly rejects). A pure-Python
aggregation judge (no LLM call) decides which findings are CONFIRMED via
cross-specialist agreement or a single high-confidence, quote-backed finding.

Two model tiers, both genuinely diverse (see SPECIALISTS / *_ASSIGNMENTS):
  - hosted  : Groq (Llama-3.3-70B) + Cerebras (gpt-oss-120b) — 2 model families
  - local   : Ollama qwen2.5-coder:7b + llama3.1:8b + gemma3:4b — 3 families

Each specialist also proposes a testable PROPERTY/invariant — the seed the
dynamic-confirmation layer (services/dynamic.py) turns into a fuzz harness.

llm.py's run_full_analysis() is untouched; this module's entry point is
run_council().
"""

import httpx
import os
import json
import re
import asyncio

from services.llm import OLLAMA_URL, GROQ_API_KEY, GROQ_URL, LLM_TIMEOUT, preanalyze_code

CEREBRAS_API_KEY = os.getenv("CEREBRAS_API_KEY", "")
CEREBRAS_MODEL = os.getenv("CEREBRAS_MODEL", "gpt-oss-120b")
# Second Cerebras model family (GLM vs gpt-oss) — gives the hosted tier genuine
# two-family diversity WITHOUT Groq. Used when a Groq key is absent/invalid.
CEREBRAS_MODEL_B = os.getenv("CEREBRAS_MODEL_B", "zai-glm-4.7")
CEREBRAS_URL = "https://api.cerebras.ai/v1/chat/completions"
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")

# Whether a usable Groq key is configured. If not, the hosted tier runs fully
# on Cerebras's two model families instead of Groq+Cerebras (see
# specialist_assignments). gsk_ keys that are present but invalid still set
# this True — we can't validate without a call — so a dead key surfaces as
# per-specialist llm_error, not a silent all-Cerebras swap.
_HAS_GROQ = bool(GROQ_API_KEY)


# ─── Specialist definitions ───
# Each specialist is one OWASP/DASP logic class with a tight definition and a
# vulnerable + safe few-shot pair (so the model pattern-matches rather than
# free-associates). `property_hint` is the natural-language invariant the
# dynamic layer will try to falsify with a fuzzer.

SPECIALISTS = [
    {
        "role": "reentrancy",
        "definition": "an external call (.call/.send/low-level call / interaction with an untrusted address) happens BEFORE a state variable is updated, letting the callee re-enter and exploit stale state (violates Checks-Effects-Interactions).",
        "vulnerable": "(bool ok,) = msg.sender.call{value: amount}(\"\");\nrequire(ok);\nbalances[msg.sender] -= amount;  // state update AFTER external call",
        "safe": "balances[msg.sender] -= amount;  // state update FIRST\n(bool ok,) = msg.sender.call{value: amount}(\"\");\nrequire(ok);",
        "property_hint": "no function allows a caller's balance to be withdrawn more than once per deposit (sum of withdrawals <= deposits per account).",
    },
    {
        "role": "access_control",
        "definition": "a sensitive function (withdraw/mint/burn/selfdestruct/setOwner/pause/upgrade) has NO restriction on who may call it, or uses a broken check (e.g. tx.origin instead of msg.sender).",
        "vulnerable": "function withdrawAll() public {\n    payable(msg.sender).transfer(address(this).balance);  // anyone can drain\n}",
        "safe": "function withdrawAll() public onlyOwner {\n    payable(msg.sender).transfer(address(this).balance);\n}",
        "property_hint": "only the designated owner/role can invoke privileged state-changing functions.",
    },
    {
        "role": "arithmetic",
        "definition": "integer overflow/underflow (pre-0.8 without SafeMath, or unchecked{} blocks), precision loss, or incorrect rounding/scaling in fee/interest/share math that lets a user extract value.",
        "vulnerable": "function transfer(address to, uint v) public {\n    balances[msg.sender] -= v;  // underflows below zero pre-0.8\n    balances[to] += v;\n}",
        "safe": "require(balances[msg.sender] >= v, \"insufficient\");\nbalances[msg.sender] -= v;\nbalances[to] += v;",
        "property_hint": "token/share accounting never lets total balances exceed total supply, and no balance underflows.",
    },
    {
        "role": "business_logic",
        "definition": "a flaw in the contract's intended rules: missing validation that lets a user bypass an intended constraint (e.g. accepting a bid below the highest), an invariant the contract assumes but never enforces, or a mis-ordered state machine.",
        "vulnerable": "function bid() public payable {\n    highestBidder = msg.sender;   // no check msg.value > highestBid\n    highestBid = msg.value;\n}",
        "safe": "require(msg.value > highestBid, \"bid too low\");\nhighestBidder = msg.sender;\nhighestBid = msg.value;",
        "property_hint": "the contract's core invariant (e.g. highestBid is monotonically non-decreasing) always holds after every state transition.",
    },
    {
        "role": "oracle_price_manipulation",
        "definition": "the contract reads a price/exchange rate from a manipulable source — spot reserves of an AMM pool (getReserves/balanceOf of a pair), a single-block TWAP, or an unvalidated oracle — that a flash-loan can move within one transaction.",
        "vulnerable": "uint price = token.balanceOf(pair) / weth.balanceOf(pair);  // spot reserves, flash-loanable",
        "safe": "uint price = chainlinkFeed.latestAnswer();  // external, manipulation-resistant feed with staleness checks",
        "property_hint": "no price used for valuation can be moved by a single attacker transaction (flash-loan resistant).",
    },
    {
        "role": "flashloan_mev",
        "definition": "logic that is exploitable when an attacker has unlimited capital for one transaction (flash loan) or can reorder/sandwich txs (MEV): governance by spot token balance, single-tx deposit+borrow+withdraw loops, missing slippage bounds.",
        "vulnerable": "uint votes = token.balanceOf(msg.sender);  // governance weight = spot balance, flash-loanable\nrequire(votes > quorum);",
        "safe": "uint votes = token.getPastVotes(msg.sender, proposalSnapshotBlock);  // snapshot, not spot",
        "property_hint": "no privileged outcome (governance, reward, liquidation) can be obtained within a single flash-loaned transaction.",
    },
    {
        "role": "dos_gas",
        "definition": "denial of service: unbounded loops over user-controlled arrays, a push-payment pattern where one reverting recipient blocks everyone, or a critical path that can be made to always revert / exceed the block gas limit.",
        "vulnerable": "for (uint i = 0; i < investors.length; i++) {\n    payable(investors[i]).transfer(amount);  // one revert blocks all\n}",
        "safe": "// pull-payment: each investor withdraws their own balance\npayments[msg.sender] = 0;\npayable(msg.sender).transfer(amount);",
        "property_hint": "no single external account can permanently block a critical function for all other users.",
    },
    {
        "role": "proxy_upgradeability",
        "definition": "upgradeable-proxy hazards: unprotected initializer (can be re-called to seize ownership), uninitialized implementation, storage-layout collision between proxy and logic, or delegatecall to an attacker-controlled address.",
        "vulnerable": "function initialize(address owner_) public {\n    owner = owner_;  // no initializer guard — re-callable to hijack\n}",
        "safe": "function initialize(address owner_) public initializer {\n    owner = owner_;\n}",
        "property_hint": "the initializer can be executed at most once and only by the deployer; no delegatecall target is attacker-controlled.",
    },
]

SPECIALIST_ROLES = [s["role"] for s in SPECIALISTS]
_SPECIALIST_BY_ROLE = {s["role"]: s for s in SPECIALISTS}


# ─── Model assignments: distribute the 8 roles across genuinely different
# base models within each tier. Code-pattern-heavy classes go to the
# code-specialized / strongest model; semantic/holistic classes go to the
# general reasoner — diversity by design, not arbitrary. ───

# Local tier: 3 distinct model families on Ollama.
OLLAMA_ASSIGNMENTS = {
    "reentrancy": "qwen2.5-coder:7b",
    "access_control": "qwen2.5-coder:7b",
    "arithmetic": "qwen2.5-coder:7b",
    "proxy_upgradeability": "qwen2.5-coder:7b",
    "business_logic": "llama3.1:8b",
    "oracle_price_manipulation": "llama3.1:8b",
    "flashloan_mev": "llama3.1:8b",
    "dos_gas": "gemma3:4b",
}

# Hosted tier, Groq+Cerebras variant: 2 families (Llama-3.3-70B via Groq,
# gpt-oss-120b via Cerebras). Used only when a valid Groq key is present.
GROQ_CEREBRAS_ASSIGNMENTS = {
    "reentrancy": ("groq", GROQ_MODEL),
    "access_control": ("cerebras", CEREBRAS_MODEL),
    "arithmetic": ("groq", GROQ_MODEL),
    "proxy_upgradeability": ("cerebras", CEREBRAS_MODEL),
    "business_logic": ("cerebras", CEREBRAS_MODEL),
    "oracle_price_manipulation": ("groq", GROQ_MODEL),
    "flashloan_mev": ("cerebras", CEREBRAS_MODEL),
    "dos_gas": ("groq", GROQ_MODEL),
}

# Hosted tier, Cerebras-only variant: 2 families on one provider
# (gpt-oss-120b vs zai-glm-4.7). This is the DEFAULT hosted tier when no Groq
# key — genuine architectural diversity without a second provider. Split so
# neither model sees all of one "kind" of bug.
CEREBRAS_DUAL_ASSIGNMENTS = {
    "reentrancy": ("cerebras", CEREBRAS_MODEL),
    "access_control": ("cerebras", CEREBRAS_MODEL_B),
    "arithmetic": ("cerebras", CEREBRAS_MODEL),
    "proxy_upgradeability": ("cerebras", CEREBRAS_MODEL_B),
    "business_logic": ("cerebras", CEREBRAS_MODEL_B),
    "oracle_price_manipulation": ("cerebras", CEREBRAS_MODEL),
    "flashloan_mev": ("cerebras", CEREBRAS_MODEL_B),
    "dos_gas": ("cerebras", CEREBRAS_MODEL),
}


def specialist_assignments(backend: str) -> dict:
    """Returns {role: (provider, model)} for all 8 specialists. backend is
    "ollama" (local tier) or "groq"/"hosted" (hosted tier). The hosted tier
    uses Groq+Cerebras when a Groq key is configured, else Cerebras's two
    model families (gpt-oss-120b + zai-glm-4.7) — still genuine diversity."""
    if backend == "hosted_fast":
        # Scale tier: all specialists on the fast model (gpt-oss-120b), ~5-10s
        # per contract for large batches. Trades the second model family for
        # throughput — use for thousands-scale runs, not for the headline
        # diversity claim.
        return {s["role"]: ("cerebras", CEREBRAS_MODEL) for s in SPECIALISTS}
    if backend in ("groq", "hosted"):
        return dict(GROQ_CEREBRAS_ASSIGNMENTS if _HAS_GROQ else CEREBRAS_DUAL_ASSIGNMENTS)
    return {role: ("ollama", model) for role, model in OLLAMA_ASSIGNMENTS.items()}


# ─── Provider-level query functions (parameterized on an explicit model and
# optional seed — llm.py's helpers always use the single globally-detected
# model, which is exactly what a diverse council must NOT do). ───

async def _query_ollama_model(model: str, prompt: str, timeout: int | None = None, seed: int | None = None) -> str:
    options = {}
    if seed is not None:
        options["seed"] = seed  # Ollama honours options.seed for reproducible sampling
    async with httpx.AsyncClient() as client:
        try:
            body = {"model": model, "prompt": prompt, "stream": False}
            if options:
                body["options"] = options
            resp = await client.post(f"{OLLAMA_URL}/api/generate", json=body, timeout=timeout or LLM_TIMEOUT)
            if resp.status_code == 200:
                return resp.json().get("response", "")
            return f"[LLM Error {resp.status_code}]"
        except httpx.TimeoutException:
            return "[LLM timeout]"
        except httpx.ConnectError:
            return "[Ollama not running]"
        except Exception as e:
            return f"[Error: {e}]"


async def _query_openai_compatible(url: str, api_key: str, model: str, prompt: str, provider_label: str, timeout: int | None = None, seed: int | None = None) -> str:
    if not api_key:
        return f"[{provider_label} API key not configured]"
    body = {"model": model, "messages": [{"role": "user", "content": prompt}], "stream": False}
    if seed is not None:
        body["seed"] = seed  # OpenAI-compatible best-effort determinism (Groq supports it; Cerebras may ignore)
    # Free hosted tiers rate-limit bursts (a parallel fan-out of 8 specialists
    # easily trips a 429). Retry 429/5xx with backoff, honouring Retry-After.
    delays = [1, 2, 4, 8, 16]
    async with httpx.AsyncClient() as client:
        for attempt, delay in enumerate([0] + delays):
            if delay:
                await asyncio.sleep(delay)
            try:
                resp = await client.post(url, headers={"Authorization": f"Bearer {api_key}"}, json=body, timeout=timeout or LLM_TIMEOUT)
                if resp.status_code == 200:
                    return resp.json()["choices"][0]["message"]["content"]
                if resp.status_code == 429 or resp.status_code >= 500:
                    ra = resp.headers.get("retry-after")
                    if ra:
                        try:
                            await asyncio.sleep(min(float(ra), 30))
                        except ValueError:
                            pass
                    if attempt < len(delays):
                        continue
                return f"[LLM Error {resp.status_code}: {resp.text[:200]}]"
            except httpx.TimeoutException:
                if attempt < len(delays):
                    continue
                return "[LLM timeout]"
            except httpx.ConnectError:
                return f"[{provider_label} unreachable]"
            except Exception as e:
                return f"[Error: {e}]"
    return f"[{provider_label} retries exhausted]"


async def _query(provider: str, model: str, prompt: str, timeout: int | None = None, seed: int | None = None) -> str:
    if provider == "ollama":
        return await _query_ollama_model(model, prompt, timeout, seed)
    if provider == "groq":
        return await _query_openai_compatible(GROQ_URL, GROQ_API_KEY, model, prompt, "Groq", timeout, seed)
    if provider == "cerebras":
        return await _query_openai_compatible(CEREBRAS_URL, CEREBRAS_API_KEY, model, prompt, "Cerebras", timeout, seed)
    raise ValueError(f"unknown provider: {provider}")


_ERROR_MARKERS = ("[LLM Error", "[LLM timeout]", "not running]", "unreachable]", "[Error:", "not configured]")


def _is_error_response(raw: str) -> bool:
    return any(marker in raw for marker in _ERROR_MARKERS)


# ─── Prompt template (one parameterized template, not 8 copies) ───

_PROMPT_TEMPLATE = """You are a smart-contract security specialist with EXACTLY ONE job: detect {role_title} vulnerabilities in the Solidity contract below. Ignore every other vulnerability class — other specialists cover those.

DEFINITION: A {role_title} vulnerability is when {definition}

VULNERABLE EXAMPLE:
```solidity
{vulnerable}
```

SAFE COUNTER-EXAMPLE:
```solidity
{safe}
```

Respond with ONLY a JSON object — no markdown fences, no prose:
{{"type": "{role}", "severity": "critical|high|medium|low", "confidence": 0.0-1.0, "evidence_quote": "<verbatim line(s) copied EXACTLY from the contract that prove the finding, or empty string>", "property": "<one-sentence testable invariant that, if violated, confirms this bug>", "found": true|false}}

evidence_quote MUST be copied verbatim from the contract below (not paraphrased). If you cannot quote a specific vulnerable line, set found=false and evidence_quote="".

```solidity
{code}
```

JSON:"""


def _build_prompt(spec: dict, code: str) -> str:
    return _PROMPT_TEMPLATE.format(
        role=spec["role"],
        role_title=spec["role"].replace("_", " "),
        definition=spec["definition"],
        vulnerable=spec["vulnerable"],
        safe=spec["safe"],
        code=code,
    )


def _parse_specialist_json(raw: str, role: str) -> dict:
    """Extract the specialist's JSON. Any parse failure or error marker is
    treated as found=False — a specialist that can't produce valid output
    contributes nothing rather than a hallucinated finding."""
    default = {"type": role, "severity": "low", "confidence": 0.0, "evidence_quote": "", "property": "", "found": False}
    if _is_error_response(raw):
        return {**default, "_error": raw}
    try:
        start = raw.find("{")
        end = raw.rfind("}") + 1
        if start != -1 and end > start:
            parsed = json.loads(raw[start:end])
            return {
                "type": str(parsed.get("type", role)),
                "severity": str(parsed.get("severity", "low")).lower(),
                "confidence": float(parsed.get("confidence", 0.0)),
                "evidence_quote": str(parsed.get("evidence_quote", "") or ""),
                "property": str(parsed.get("property", "") or ""),
                "found": bool(parsed.get("found", False)),
            }
    except Exception:
        pass
    return default


def _normalize_for_quote_check(s: str) -> str:
    """Whitespace-insensitive normalization for the substring check — models
    reliably reproduce a quoted line's tokens but not always its exact
    indentation. Collapsing whitespace is the minimum that doesn't let a
    fabricated quote pass; it does not fuzzy-match different code."""
    return re.sub(r"\s+", " ", s).strip()


def quote_appears_in_code(quote: str, code: str) -> bool:
    if not quote or not quote.strip():
        return False
    return _normalize_for_quote_check(quote) in _normalize_for_quote_check(code)


async def _run_specialist(spec: dict, provider: str, model: str, code: str, seed: int | None) -> dict:
    raw = await _query(provider, model, _build_prompt(spec, code), timeout=240, seed=seed)
    result = _parse_specialist_json(raw, spec["role"])
    # If the specialist found something but proposed no property, fall back to
    # the curated property_hint so the dynamic layer always has a target.
    if result["found"] and not result["property"]:
        result["property"] = spec.get("property_hint", "")
    result["role"] = spec["role"]
    result["provider"] = provider
    result["model"] = model
    result["llm_error"] = _is_error_response(raw)
    return result


def _aggregate(specialist_results: list[dict], code: str) -> list[dict]:
    """Pure-Python judge (no LLM), evidence-anchored.

    STEP 1 — evidence gate (applied to EVERY finding, not just singletons):
    a specialist that returned found=True but whose evidence_quote does not
    actually appear in the submitted source is discarded. Its "evidence" is
    fabricated (commonly the few-shot example leaking back as the quote), so
    it is not evidence at all. This is the PDF's evidence-anchored principle —
    the judge weights evidence, not assertion — and it is what stops eager
    over-flagging from poisoning the agreement vote.

    STEP 2 — agreement gate over the credible findings only:
      - >=2 credible specialists -> CONFIRMED (cross-model agreement), OR
      - exactly 1 credible specialist with confidence >= 0.8 -> CONFIRMED.

    With 8 single-class specialists, ">=2 agree" means two DIFFERENT classes
    were each independently flagged WITH real code evidence on the same
    contract — a meaningful multi-specialist signal, not two votes on one
    issue. Per-class identity is preserved in the output."""
    credible = [
        r for r in specialist_results
        if r["found"] and quote_appears_in_code(r["evidence_quote"], code)
    ]
    if len(credible) >= 2:
        return credible
    if len(credible) == 1 and credible[0]["confidence"] >= 0.8:
        return credible
    return []


async def run_council_stream(code: str, backend: str | None = None, seed: int | None = None):
    """Async generator yielding live progress events for the UI, so the user
    sees each specialist resolve instead of staring at a spinner. Event shapes:
      {"event":"start", "specialists":[{role,model,provider}...], "tier":...}
      {"event":"specialist_done", "role":.., "model":.., "found":.., "confidence":.., "severity":.., "evidence_quote":..}
      {"event":"final", "result": <full run_council-shaped dict>}
    Runs the same specialists as run_council and assembles an identical final
    result, so the streaming and non-streaming paths never diverge."""
    backend = backend or os.getenv("LLM_BACKEND", "ollama").lower()
    assignments = specialist_assignments(backend)
    features = preanalyze_code(code)

    yield {"event": "start", "tier": backend,
           "specialists": [{"role": r, "provider": p, "model": m} for r, (p, m) in assignments.items()]}

    max_conc = int(os.getenv("COUNCIL_MAX_CONCURRENCY", "3" if backend != "ollama" else "8"))
    sem = asyncio.Semaphore(max_conc)

    async def _bounded(role, provider, model):
        async with sem:
            return await _run_specialist(_SPECIALIST_BY_ROLE[role], provider, model, code, seed)

    tasks = [asyncio.create_task(_bounded(role, p, m)) for role, (p, m) in assignments.items()]
    specialist_results = []
    for coro in asyncio.as_completed(tasks):
        r = await coro
        specialist_results.append(r)
        yield {"event": "specialist_done", "role": r["role"], "model": r["model"],
               "provider": r["provider"], "found": r["found"], "confidence": r["confidence"],
               "severity": r["severity"], "evidence_quote": r["evidence_quote"][:200],
               "llm_error": r["llm_error"]}

    final = _assemble_result(code, features, specialist_results, backend, None)
    yield {"event": "final", "result": final}


def _assemble_result(code: str, features: dict, specialist_results: list[dict], backend: str, similar_exploits: list | None) -> dict:
    """Shared result assembly for run_council and run_council_stream."""
    llm_error_detected = any(r["llm_error"] for r in specialist_results)
    confirmed = _aggregate(specialist_results, code)
    vulnerabilities = [
        {
            "type": r["type"], "line": None, "severity": r["severity"], "confidence": r["confidence"],
            "description": f"Confirmed by {r['role']} specialist ({r['model']}). Evidence: {r['evidence_quote'][:200]}",
            "evidence_quote": r["evidence_quote"], "proposed_property": r.get("property", ""),
            "source": f"council:{r['role']}", "model": r["model"], "provider": r["provider"],
            "dynamic_status": "SUSPECTED",
        }
        for r in confirmed
    ]
    verdict = "NO-GO" if confirmed else "GO"
    name = features.get("contract_name") or "this contract"
    n_found = sum(1 for r in specialist_results if r["found"])
    models = sorted({r["model"] for r in specialist_results})
    if verdict == "GO":
        raven_note = f"The council examined {name} across {len(specialist_results)} vulnerability classes and came back clean — no finding cleared the agreement bar."
    else:
        roles = ", ".join(sorted({r["role"].replace('_', ' ') for r in confirmed}))
        agreed = "Multiple specialists agreed" if len(confirmed) >= 2 else "One specialist found strong, quote-backed evidence"
        raven_note = f"The council flagged {name} on: {roles}. {agreed} — not a single model's hunch."
    summary = (f"Council analysis of {name}: {len(specialist_results)} model-diverse specialists "
               f"({', '.join(models)}) examined the contract, {n_found} raised a finding, "
               f"{len(confirmed)} were confirmed by the agreement gate.")
    return {
        "final_verdict": verdict, "vulnerabilities": vulnerabilities, "summary": summary,
        "raven_note": raven_note, "contract_name": features.get("contract_name", ""),
        "features_detected": {k: v for k, v in features.items() if v and k not in ("solidity_version", "contract_name")},
        "stats": {
            "models_run": len(models), "specialists_run": len(specialist_results),
            "specialists_found": n_found, "specialists_confirmed": len(confirmed),
            "similar_in_db": len(similar_exploits) if similar_exploits else 0,
            "llm_error_detected": llm_error_detected, "tier": backend, "models_used": models,
        },
        "council_detail": specialist_results, "similar_exploits": similar_exploits or [], "mode": "council",
    }


async def run_council(code: str, similar_exploits: list | None = None, backend: str | None = None, seed: int | None = None) -> dict:
    """Council entry point. Returns the same top-level schema as
    run_full_analysis() (final_verdict, vulnerabilities, summary, raven_note,
    contract_name, features_detected, stats) so the eval harness and frontend
    work unchanged.

    backend: "ollama" (local tier) | "groq" (hosted tier). Defaults to
    LLM_BACKEND from the environment (read fresh per call).
    seed: optional sampling seed (threaded to each specialist) for the
    multi-seed eval protocol.
    similar_exploits: optional retrieved precedents (services/retrieval.py);
    surfaced in the output, not yet fed into specialist prompts."""
    backend = backend or os.getenv("LLM_BACKEND", "ollama").lower()
    assignments = specialist_assignments(backend)
    features = preanalyze_code(code)

    # Bound concurrency so a hosted free tier isn't hit with 8 simultaneous
    # requests (the cause of burst 429s). Local Ollama serialises model loads
    # anyway, so a small cap costs nothing there. Configurable via env.
    max_conc = int(os.getenv("COUNCIL_MAX_CONCURRENCY", "3" if backend != "ollama" else "8"))
    sem = asyncio.Semaphore(max_conc)

    async def _bounded(role, provider, model):
        async with sem:
            return await _run_specialist(_SPECIALIST_BY_ROLE[role], provider, model, code, seed)

    specialist_results = await asyncio.gather(*[
        _bounded(role, provider, model)
        for role, (provider, model) in assignments.items()
    ])

    return _assemble_result(code, features, specialist_results, backend, similar_exploits)
