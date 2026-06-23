"""
Phase 3: a model-diverse specialist council, built as a genuine alternative
pipeline to run_full_analysis() — not a wrapper around it, not a fourth LLM
call stacked on top. Three single-purpose specialist agents (Reentrancy,
AccessControl, BusinessLogic), each pinned to a specific base model so the
council actually has architectural diversity, not just three prompts
against the same weights (that's the "echo chamber" failure mode this is
built to avoid). A pure-Python aggregation judge — no LLM call — decides
which findings are CONFIRMED based on cross-specialist agreement or a
single high-confidence finding backed by a real code quote.

services/llm.py's run_full_analysis() pipeline is completely untouched —
this is a new, independent entry point: run_council().
"""

import httpx
import os
import json
import re
import asyncio

from services.llm import OLLAMA_URL, GROQ_API_KEY, GROQ_URL, LLM_TIMEOUT, preanalyze_code

CEREBRAS_API_KEY = os.getenv("CEREBRAS_API_KEY", "")
CEREBRAS_MODEL = os.getenv("CEREBRAS_MODEL", "llama3.1-8b")
CEREBRAS_URL = "https://api.cerebras.ai/v1/chat/completions"
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")

# Two real, different local models (confirmed installed via `ollama list`
# this session: llama3.2:3b, qwen2.5-coder:7b). qwen2.5-coder is a
# code-specialized model — assigned to the two specialists whose job is
# spotting a precise code PATTERN (reentrancy's call-before-state-update,
# access control's missing-modifier check). BusinessLogic is more about
# holistic intent/semantics than a literal pattern, so the general-purpose
# model gets that one — genuine architectural diversity, not arbitrary.
OLLAMA_SPECIALIST_MODELS = {
    "reentrancy": "qwen2.5-coder:7b",
    "access_control": "qwen2.5-coder:7b",
    "business_logic": "llama3.2:3b",
}

# Hosted mirror of the same split: two providers (genuinely different
# model families, not just different account/keys for the same model),
# same 2-roles/1-role asymmetry as the Ollama assignment above.
GROQ_SPECIALIST_PROVIDERS = {
    "reentrancy": ("groq", GROQ_MODEL),
    "access_control": ("cerebras", CEREBRAS_MODEL),
    "business_logic": ("groq", GROQ_MODEL),
}


def specialist_assignments(backend: str) -> dict[str, tuple[str, str]]:
    """Returns {role: (provider, model)}. backend is "ollama" or "groq" —
    same shape eval/run_baselines.py's --llm-backend flag already uses."""
    if backend == "groq":
        return dict(GROQ_SPECIALIST_PROVIDERS)
    return {role: ("ollama", model) for role, model in OLLAMA_SPECIALIST_MODELS.items()}


# ─── Provider-level query functions (mirrors services/llm.py's pattern,
# but parameterized on an explicit model — llm.py's _query_ollama/_query_groq
# always use the single globally-detected/configured model, which is
# exactly what a council needs to NOT do) ───

async def _query_ollama_model(model: str, prompt: str, timeout: int | None = None) -> str:
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post(
                f"{OLLAMA_URL}/api/generate",
                json={"model": model, "prompt": prompt, "stream": False},
                timeout=timeout or LLM_TIMEOUT,
            )
            if resp.status_code == 200:
                return resp.json().get("response", "")
            return f"[LLM Error {resp.status_code}]"
        except httpx.TimeoutException:
            return "[LLM timeout]"
        except httpx.ConnectError:
            return "[Ollama not running]"
        except Exception as e:
            return f"[Error: {e}]"


async def _query_groq_model(model: str, prompt: str, timeout: int | None = None) -> str:
    if not GROQ_API_KEY:
        return "[Groq API key not configured]"
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post(
                GROQ_URL,
                headers={"Authorization": f"Bearer {GROQ_API_KEY}"},
                json={"model": model, "messages": [{"role": "user", "content": prompt}], "stream": False},
                timeout=timeout or LLM_TIMEOUT,
            )
            if resp.status_code == 200:
                return resp.json()["choices"][0]["message"]["content"]
            return f"[LLM Error {resp.status_code}: {resp.text[:200]}]"
        except httpx.TimeoutException:
            return "[LLM timeout]"
        except httpx.ConnectError:
            return "[Groq unreachable]"
        except Exception as e:
            return f"[Error: {e}]"


async def _query_cerebras_model(model: str, prompt: str, timeout: int | None = None) -> str:
    if not CEREBRAS_API_KEY:
        return "[Cerebras API key not configured]"
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post(
                CEREBRAS_URL,
                headers={"Authorization": f"Bearer {CEREBRAS_API_KEY}"},
                json={"model": model, "messages": [{"role": "user", "content": prompt}], "stream": False},
                timeout=timeout or LLM_TIMEOUT,
            )
            if resp.status_code == 200:
                return resp.json()["choices"][0]["message"]["content"]
            return f"[LLM Error {resp.status_code}: {resp.text[:200]}]"
        except httpx.TimeoutException:
            return "[LLM timeout]"
        except httpx.ConnectError:
            return "[Cerebras unreachable]"
        except Exception as e:
            return f"[Error: {e}]"


_PROVIDER_FUNCS = {
    "ollama": _query_ollama_model,
    "groq": _query_groq_model,
    "cerebras": _query_cerebras_model,
}


async def _query(provider: str, model: str, prompt: str, timeout: int | None = None) -> str:
    fn = _PROVIDER_FUNCS.get(provider)
    if fn is None:
        raise ValueError(f"unknown provider: {provider}")
    return await fn(model, prompt, timeout)


_ERROR_MARKERS = ("[LLM Error", "[LLM timeout]", "not running]", "unreachable]", "[Error:", "not configured]")


def _is_error_response(raw: str) -> bool:
    return any(marker in raw for marker in _ERROR_MARKERS)


# ─── Specialist prompts: one vulnerability class each, with a concrete
# few-shot pair (vulnerable example + safe counter-example) so the model
# has something to pattern-match against rather than free-associating ───

_REENTRANCY_PROMPT = """You are a security specialist with EXACTLY ONE job: detect reentrancy vulnerabilities in this Solidity contract. Ignore everything else — access control, business logic, integer issues, gas, style. Not your concern.

A reentrancy vulnerability exists when an external call (.call, .send, a low-level call, or any interaction with an address/contract that isn't fully trusted) happens BEFORE a state variable (balance, ownership flag, counter) is updated — the callee can re-enter and exploit the stale state.

VULNERABLE EXAMPLE (external call before state update):
```solidity
function withdraw(uint amount) public {{
    require(balances[msg.sender] >= amount);
    (bool ok, ) = msg.sender.call{{value: amount}}("");  // external call FIRST
    require(ok);
    balances[msg.sender] -= amount;  // state update AFTER — reentrant
}}
```

SAFE COUNTER-EXAMPLE (state update before external call — Checks-Effects-Interactions):
```solidity
function withdraw(uint amount) public {{
    require(balances[msg.sender] >= amount);
    balances[msg.sender] -= amount;  // state update FIRST
    (bool ok, ) = msg.sender.call{{value: amount}}("");  // external call AFTER — safe
    require(ok);
}}
```

Respond with ONLY a JSON object, no markdown fences, no explanation:
{{"type": "reentrancy", "severity": "critical|high|medium|low", "confidence": 0.0-1.0, "evidence_quote": "<verbatim line(s) of code from the contract below that demonstrate the vulnerability, or empty string>", "found": true|false}}

evidence_quote MUST be copied exactly from the contract below — not paraphrased, not summarized. If you cannot quote a specific vulnerable line, set found to false and evidence_quote to "".

```solidity
{code}
```

JSON:"""

_ACCESS_CONTROL_PROMPT = """You are a security specialist with EXACTLY ONE job: detect missing or broken access control in this Solidity contract. Ignore everything else — reentrancy, business logic, gas, style. Not your concern.

An access control vulnerability exists when a sensitive function (withdraw, mint, burn, selfdestruct, setOwner, pause, anything that moves funds or changes privileged state) has NO restriction on who can call it — no onlyOwner modifier, no require(msg.sender == owner), no role check — OR the check it does have is broken (e.g. uses tx.origin instead of msg.sender, which is itself an access-control bypass).

VULNERABLE EXAMPLE (no access control on a sensitive function):
```solidity
function withdrawAll() public {{
    payable(msg.sender).transfer(address(this).balance);  // ANYONE can drain the contract
}}
```

SAFE COUNTER-EXAMPLE (properly restricted):
```solidity
function withdrawAll() public onlyOwner {{
    payable(msg.sender).transfer(address(this).balance);  // restricted to owner — safe
}}
```

Respond with ONLY a JSON object, no markdown fences, no explanation:
{{"type": "access_control", "severity": "critical|high|medium|low", "confidence": 0.0-1.0, "evidence_quote": "<verbatim line(s) of code from the contract below that demonstrate the vulnerability, or empty string>", "found": true|false}}

evidence_quote MUST be copied exactly from the contract below — not paraphrased, not summarized. If you cannot quote a specific vulnerable line, set found to false and evidence_quote to "".

```solidity
{code}
```

JSON:"""

_BUSINESS_LOGIC_PROMPT = """You are a security specialist with EXACTLY ONE job: detect business-logic flaws in this Solidity contract — bugs in the contract's actual rules and calculations, NOT reentrancy and NOT access control (other specialists cover those; if you see them, ignore them).

A business-logic vulnerability is a flaw in the contract's intended behavior: incorrect math (e.g. a fee or interest calculation that lets users extract more than they should), missing validation that lets users bypass an intended rule (e.g. an auction accepting a bid lower than the current highest), predictable/manipulable randomness used for anything of value, or an invariant the contract assumes but never actually enforces.

VULNERABLE EXAMPLE (logic flaw — no validation that the bid actually exceeds the current one):
```solidity
function bid() public payable {{
    require(msg.value > 0);
    highestBidder = msg.sender;     // no check that msg.value > highestBid!
    highestBid = msg.value;
}}
```

SAFE COUNTER-EXAMPLE (the rule is actually enforced):
```solidity
function bid() public payable {{
    require(msg.value > highestBid, "bid too low");
    highestBidder = msg.sender;
    highestBid = msg.value;
}}
```

Respond with ONLY a JSON object, no markdown fences, no explanation:
{{"type": "business_logic", "severity": "critical|high|medium|low", "confidence": 0.0-1.0, "evidence_quote": "<verbatim line(s) of code from the contract below that demonstrate the flaw, or empty string>", "found": true|false}}

evidence_quote MUST be copied exactly from the contract below — not paraphrased, not summarized. If you cannot quote a specific vulnerable line, set found to false and evidence_quote to "".

```solidity
{code}
```

JSON:"""

_SPECIALIST_PROMPTS = {
    "reentrancy": _REENTRANCY_PROMPT,
    "access_control": _ACCESS_CONTROL_PROMPT,
    "business_logic": _BUSINESS_LOGIC_PROMPT,
}


def _parse_specialist_json(raw: str, role: str) -> dict:
    """Extract the specialist's JSON object. Any parse failure or error
    marker in the raw text is treated as found=False, not a guess —
    a specialist that can't produce valid output contributes nothing to
    the council rather than contributing a hallucinated finding."""
    if _is_error_response(raw):
        return {"type": role, "severity": "low", "confidence": 0.0, "evidence_quote": "", "found": False, "_error": raw}
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
                "found": bool(parsed.get("found", False)),
            }
    except Exception:
        pass
    return {"type": role, "severity": "low", "confidence": 0.0, "evidence_quote": "", "found": False}


def _normalize_for_quote_check(s: str) -> str:
    """Whitespace-insensitive normalization for the substring check —
    LLMs reliably reproduce the tokens of a quoted line but not always
    the exact indentation/line breaks. Collapsing runs of whitespace to
    a single space is the minimum normalization that doesn't let a
    fabricated quote pass; it does not fuzzy-match different code."""
    return re.sub(r"\s+", " ", s).strip()


def quote_appears_in_code(quote: str, code: str) -> bool:
    """The real substring check the spec requires — not just "is
    evidence_quote non-empty", but does it actually occur in the
    submitted source (whitespace-normalized both sides)."""
    if not quote or not quote.strip():
        return False
    return _normalize_for_quote_check(quote) in _normalize_for_quote_check(code)


async def _run_specialist(role: str, provider: str, model: str, code: str) -> dict:
    prompt = _SPECIALIST_PROMPTS[role].format(code=code)
    raw = await _query(provider, model, prompt, timeout=240)
    result = _parse_specialist_json(raw, role)
    result["role"] = role
    result["provider"] = provider
    result["model"] = model
    result["llm_error"] = _is_error_response(raw)
    return result


def _aggregate(specialist_results: list[dict], code: str) -> list[dict]:
    """Pure-Python judge, no LLM call. A finding is CONFIRMED if:
      - >=2 specialists independently returned found=True (cross-model
        agreement — the actual anti-echo-chamber signal), OR
      - exactly 1 specialist returned found=True with confidence >= 0.8
        AND a real, verifiable evidence_quote (substring-checked against
        the actual submitted code, not just "is it non-empty").
    Everything else (0 found, or 1 found below the bar) contributes no
    CONFIRMED finding — a lone unconvincing claim doesn't move the
    verdict, by design."""
    found = [r for r in specialist_results if r["found"]]
    confirmed: list[dict] = []

    if len(found) >= 2:
        confirmed = found
    elif len(found) == 1:
        r = found[0]
        if r["confidence"] >= 0.8 and quote_appears_in_code(r["evidence_quote"], code):
            confirmed = [r]

    return confirmed


async def run_council(code: str, similar_exploits: list | None = None, backend: str | None = None) -> dict:
    """Council entry point. Returns the same top-level schema as
    run_full_analysis() (final_verdict, vulnerabilities, summary,
    raven_note, contract_name, features_detected, stats) so the eval
    harness and frontend work unchanged — run_full_analysis() itself is
    not called or modified anywhere in this module.

    backend: "ollama" or "groq" — which provider set to use for the three
    specialists. Defaults to LLM_BACKEND from the environment (read fresh
    per call, not frozen at import time, so eval/run_baselines.py's
    --llm-backend flag can switch it per-run without import-order games)."""
    backend = backend or os.getenv("LLM_BACKEND", "ollama").lower()
    assignments = specialist_assignments(backend)
    features = preanalyze_code(code)

    specialist_results = await asyncio.gather(*[
        _run_specialist(role, provider, model, code)
        for role, (provider, model) in assignments.items()
    ])

    llm_error_detected = any(r["llm_error"] for r in specialist_results)
    confirmed = _aggregate(specialist_results, code)

    vulnerabilities = [
        {
            "type": r["type"],
            "line": None,
            "severity": r["severity"],
            "confidence": r["confidence"],
            "description": f"Confirmed by {r['role']} specialist ({r['model']}). Evidence: {r['evidence_quote'][:200]}",
            "source": f"council:{r['role']}",
            "model": r["model"],
            "provider": r["provider"],
        }
        for r in confirmed
    ]

    verdict = "NO-GO" if confirmed else "GO"
    name = features.get("contract_name") or "this contract"

    n_found = sum(1 for r in specialist_results if r["found"])
    if verdict == "GO":
        raven_note = f"The council looked at {name} from three angles and came back clean — no finding cleared the agreement bar."
    else:
        roles = ", ".join(sorted({r["role"] for r in confirmed}))
        raven_note = f"The council flagged {name} on: {roles}. {'Multiple specialists agreed' if len(confirmed) >= 2 or n_found >= 2 else 'One specialist found strong, quote-backed evidence'} — not a single model's hunch."

    summary = (
        f"Council analysis of {name}: {len(specialist_results)} specialists "
        f"({', '.join(sorted({r['model'] for r in specialist_results}))}) examined the contract, "
        f"{n_found} raised a finding, {len(confirmed)} were confirmed by the agreement gate."
    )

    return {
        "final_verdict": verdict,
        "vulnerabilities": vulnerabilities,
        "summary": summary,
        "raven_note": raven_note,
        "contract_name": features.get("contract_name", ""),
        "features_detected": {k: v for k, v in features.items() if v and k not in ("solidity_version", "contract_name")},
        "stats": {
            "models_run": len({r["model"] for r in specialist_results}),
            "specialists_run": len(specialist_results),
            "specialists_found": n_found,
            "specialists_confirmed": len(confirmed),
            "similar_in_db": len(similar_exploits) if similar_exploits else 0,
            "llm_error_detected": llm_error_detected,
        },
        "council_detail": specialist_results,
        "mode": "council",
    }
