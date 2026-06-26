from dotenv import load_dotenv
load_dotenv()  # must run before any local import that reads env vars at module-import time (db.py, services/llm.py)

from fastapi import FastAPI, HTTPException, Depends, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel
from services.llm import run_full_analysis, get_raven_greeting
from services.council import run_council
from services.report import generate_pdf_report
from services.vectordb import store_analysis, find_similar
from db import (
    init_db, create_user, authenticate_user, create_session,
    get_sessions, add_message, get_messages, rename_session,
    get_session_analyses,
)
from services.llm import check_ollama
import hashlib, json, os, secrets
from pathlib import Path

DATASET_INDEX = Path(__file__).parent / "datasets" / "index.json"

ALLOWED_ORIGINS = [
    o.strip() for o in os.getenv("ALLOWED_ORIGINS", "http://localhost:5173").split(",") if o.strip()
]

app = FastAPI(title="ThirdEye", version="3.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS, allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"],
)

@app.on_event("startup")
async def startup():
    await init_db()

# ── Auth ──
class AuthReq(BaseModel):
    username: str
    password: str

@app.post("/api/register")
async def register(req: AuthReq):
    if len(req.username) < 3 or len(req.password) < 4:
        raise HTTPException(400, "Username min 3 chars, password min 4")
    user = await create_user(req.username, req.password)
    if not user:
        raise HTTPException(409, "Username taken")
    token = secrets.token_hex(32)
    return {"token": token, "user_id": user["id"], "username": user["username"]}

@app.post("/api/login")
async def login(req: AuthReq):
    user = await authenticate_user(req.username, req.password)
    if not user:
        raise HTTPException(401, "Invalid credentials")
    token = secrets.token_hex(32)
    return {"token": token, "user_id": user["id"], "username": user["username"]}

# ── Sessions (chats) ──
class SessionReq(BaseModel):
    user_id: int

@app.post("/api/sessions")
async def new_session(req: SessionReq):
    s = await create_session(req.user_id)
    return s

@app.get("/api/sessions/{user_id}")
async def list_sessions(user_id: int):
    return await get_sessions(user_id)

class RenameReq(BaseModel):
    title: str

@app.patch("/api/sessions/{session_id}")
async def patch_session(session_id: int, req: RenameReq):
    await rename_session(session_id, req.title)
    return {"ok": True}

@app.get("/api/sessions/{session_id}/messages")
async def session_messages(session_id: int):
    return await get_messages(session_id)

# ── Analysis ──
class AnalyzeReq(BaseModel):
    code: str
    # Optional so the tool works as a zero-friction "paste and scan" flow
    # (sample contracts, anonymous trial) without forcing a logged-in session.
    # When present, the analysis is persisted to that session/history.
    session_id: int | None = None
    user_id: int | None = None

@app.post("/api/analyze")
async def analyze(req: AnalyzeReq):
    code = req.code.strip()
    if len(code) < 10:
        raise HTTPException(422, "Code too short")

    if req.session_id:
        await add_message(req.session_id, "user", code)

    # Check ChromaDB for similar past analyses
    similar = find_similar(code)

    # Run full analysis
    result = await run_full_analysis(code, similar)

    # Store in ChromaDB for future reference
    try:
        code_hash = hashlib.sha256(code.encode()).hexdigest()[:12]
        store_analysis(code_hash, code, result)
    except:
        pass

    if req.session_id:
        await add_message(req.session_id, "assistant", json.dumps(result))
        msgs = await get_messages(req.session_id)
        if len(msgs) <= 2:  # First exchange — auto-title
            await rename_session(req.session_id, _generate_title(code))

    return result

@app.post("/api/analyze/council")
async def analyze_council(req: AnalyzeReq):
    code = req.code.strip()
    if len(code) < 10:
        raise HTTPException(422, "Code too short")

    if req.session_id:
        await add_message(req.session_id, "user", code)
    similar = find_similar(code)
    result = await run_council(code, similar)
    result["mode"] = "council"

    try:
        code_hash = hashlib.sha256(code.encode()).hexdigest()[:12]
        store_analysis(code_hash, code, result)
    except:
        pass

    if req.session_id:
        await add_message(req.session_id, "assistant", json.dumps(result))
        msgs = await get_messages(req.session_id)
        if len(msgs) <= 2:
            await rename_session(req.session_id, _generate_title(code))

    return result


class ArgusReq(BaseModel):
    code: str
    session_id: str | None = None
    user_id: str | None = None
    use_retrieval: bool = True
    use_arbitration: bool = True
    use_dynamic: bool = True


@app.post("/api/analyze/argus")
async def analyze_argus(req: ArgusReq):
    """Full Argus pipeline: retrieval -> model-diverse council -> evidence-
    anchored arbitration -> dynamic confirmation. Per-stage toggles let the
    same endpoint produce any ablation configuration."""
    code = req.code.strip()
    if len(code) < 10:
        raise HTTPException(422, "Code too short")

    from services.pipeline import run_argus
    if req.session_id:
        await add_message(req.session_id, "user", code)
    result = await run_argus(
        code,
        use_retrieval=req.use_retrieval,
        use_arbitration=req.use_arbitration,
        use_dynamic=req.use_dynamic,
    )
    try:
        code_hash = hashlib.sha256(code.encode()).hexdigest()[:12]
        store_analysis(code_hash, code, result)
    except Exception:
        pass
    if req.session_id:
        await add_message(req.session_id, "assistant", json.dumps(result))
        msgs = await get_messages(req.session_id)
        if len(msgs) <= 2:
            await rename_session(req.session_id, _generate_title(code))
    return result


@app.post("/api/analyze/council/stream")
async def analyze_council_stream(req: AnalyzeReq):
    """Server-Sent Events stream of the council so the UI shows each specialist
    resolving live instead of a blind spinner. Emits `start`, one
    `specialist_done` per specialist as it finishes, then `final` with the full
    result. Backend tier is taken from LLM_BACKEND (env)."""
    from fastapi.responses import StreamingResponse
    from services.council import run_council_stream

    code = req.code.strip()
    if len(code) < 10:
        raise HTTPException(422, "Code too short")

    async def event_gen():
        final_result = None
        async for ev in run_council_stream(code):
            if ev.get("event") == "final":
                final_result = ev["result"]
            yield f"data: {json.dumps(ev)}\n\n"
        # Persist the final result the same way the non-streaming endpoint does.
        if final_result is not None:
            try:
                if req.session_id:
                    await add_message(req.session_id, "user", code)
                    await add_message(req.session_id, "assistant", json.dumps(final_result))
                code_hash = hashlib.sha256(code.encode()).hexdigest()[:12]
                store_analysis(code_hash, code, final_result)
            except Exception:
                pass

    return StreamingResponse(event_gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.get("/api/stats/benchmark")
async def benchmark_stats():
    """Real benchmark/KPI data for the results dashboard: per-stage ablation,
    dataset vulnerability distributions (the 'most common vulns in the wild'),
    and the published baselines we compare against. Computed from on-disk eval
    artifacts + dataset manifests — no mocked numbers. Degrades gracefully if
    an artifact is missing."""
    from services.stats import build_benchmark_stats
    return build_benchmark_stats()


@app.get("/api/dynamic/reference-poc")
async def dynamic_reference_poc():
    """Run the bundled Foundry reentrancy PoC and return the real exploit
    witness — powers the 'How It Works' dynamic-confirmation demo. Honest about
    whether Foundry is installed."""
    from services.dynamic import run_reference_poc, foundry_available
    import asyncio as _aio
    result = await _aio.to_thread(run_reference_poc)
    result["foundry_installed"] = foundry_available()
    return result


@app.get("/api/samples")
async def list_sample_contracts():
    """Curated pre-verified sample contracts for the demo/trial section — each
    with its expected verdict so users can one-click load and scan."""
    from services.samples import list_samples
    return list_samples()


@app.get("/api/retrieval/status")
async def retrieval_status_endpoint():
    """Diagnostics for the exploit-corpus retrieval layer (corpus size, which
    embedding/store backend is active)."""
    from services.retrieval import retrieval_status
    return retrieval_status()

# ── Report ──
class ReportReq(BaseModel):
    code: str
    result: dict

@app.post("/api/report")
async def download_report(req: ReportReq):
    try:
        pdf_bytes = generate_pdf_report(req.code, req.result)
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": "attachment; filename=ThirdEye_Audit_Report.pdf"},
        )
    except Exception as e:
        raise HTTPException(500, f"Report failed: {str(e)}")

# ── Status ──
@app.get("/api/ollama-status")
async def ollama_status():
    return await check_ollama()

@app.get("/api/similar/{code_hash}")
async def get_similar(code_hash: str):
    return find_similar(code_hash)

@app.get("/")
def root():
    return {"msg": "ThirdEye v3 API", "docs": "/docs"}

@app.get("/health")
def health():
    return {"status": "healthy"}


# ── Dataset ──
_dataset_run_status: dict = {"running": False, "progress": 0, "total": 0, "message": ""}

@app.get("/api/dataset/index")
def dataset_index():
    if not DATASET_INDEX.exists():
        raise HTTPException(404, "Dataset index not found. Run dataset_runner.py first.")
    with open(DATASET_INDEX) as f:
        data = json.load(f)
    # Strip large analysis_result from list view for performance
    contracts = []
    for c in data.get("contracts", []):
        contracts.append({
            "id": c["id"],
            "filename": c["filename"],
            "contract_name": c["contract_name"],
            "xlsx_name": c.get("xlsx_name", ""),
            "source": c["source"],
            "auto_label": c["auto_label"],
            "vuln_types": c.get("vuln_types", []),
            "expected_severity": c.get("expected_severity"),
            "solidity_version": c.get("solidity_version", ""),
            "etherscan_address": c.get("etherscan_address", ""),
            "analysis_result": c.get("analysis_result"),
            "comparison": c.get("comparison"),
            "analysis_timestamp": c.get("analysis_timestamp"),
        })
    return {
        "source": data.get("source"),
        "total": data.get("total", len(contracts)),
        "last_run": data.get("last_run"),
        "run_stats": data.get("run_stats"),
        "contracts": contracts,
    }


@app.get("/api/dataset/stats")
def dataset_stats():
    if not DATASET_INDEX.exists():
        return {"total": 0, "vulnerable": 0, "likely_safe": 0, "analyzed": 0, "accuracy": None}
    with open(DATASET_INDEX) as f:
        data = json.load(f)
    contracts = data.get("contracts", [])
    vulnerable = sum(1 for c in contracts if c.get("auto_label") == "vulnerable")
    likely_safe = sum(1 for c in contracts if c.get("auto_label") == "likely_safe")
    analyzed = sum(1 for c in contracts if c.get("analysis_result") is not None)
    vuln_type_counts: dict = {}
    for c in contracts:
        for vt in c.get("vuln_types", []):
            vuln_type_counts[vt] = vuln_type_counts.get(vt, 0) + 1
    return {
        "total": len(contracts),
        "vulnerable": vulnerable,
        "likely_safe": likely_safe,
        "analyzed": analyzed,
        "run_stats": data.get("run_stats"),
        "last_run": data.get("last_run"),
        "vuln_type_distribution": vuln_type_counts,
    }


@app.get("/api/dataset/run-status")
def dataset_run_status():
    return _dataset_run_status


@app.post("/api/dataset/run")
async def dataset_run(background_tasks: BackgroundTasks, static_only: bool = True, limit: int | None = None):
    if _dataset_run_status["running"]:
        raise HTTPException(409, "Dataset runner already in progress")
    background_tasks.add_task(_run_dataset_bg, static_only=static_only, limit=limit)
    return {"ok": True, "message": f"Dataset run started ({'static-only' if static_only else 'full pipeline'})"}


async def _run_dataset_bg(static_only: bool, limit: int | None):
    global _dataset_run_status
    _dataset_run_status = {"running": True, "progress": 0, "total": 0, "message": "Starting..."}
    try:
        import importlib.util, sys
        runner_path = Path(__file__).parent / "dataset_runner.py"
        spec = importlib.util.spec_from_file_location("dataset_runner", runner_path)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)

        data = mod.load_index()
        contracts = data["contracts"]
        if limit:
            contracts = contracts[:limit]
        _dataset_run_status["total"] = len(contracts)

        from datetime import datetime
        correct = 0
        processed = 0
        for i, entry in enumerate(contracts):
            _dataset_run_status["progress"] = i + 1
            _dataset_run_status["message"] = f"Analyzing {entry['id']} ({entry['contract_name']})"
            result = await mod.analyze_contract(entry, static_only=static_only)
            if result:
                entry["analysis_result"] = result
                entry["analysis_timestamp"] = datetime.utcnow().isoformat()
                entry["comparison"] = mod.compare_verdict(entry, result)
                if entry["comparison"]["match"]:
                    correct += 1
                processed += 1

        data["contracts"] = contracts
        data["last_run"] = datetime.utcnow().isoformat()
        if static_only:
            data["run_stats"] = {
                "total_processed": processed,
                "correct_verdicts": None,
                "accuracy": None,
                "mode": "smoke_test",
                "note": "smoke_test mode makes no prediction — it only verifies the pipeline parses "
                        "every contract without crashing. It does not produce an accuracy number.",
            }
        else:
            data["run_stats"] = {
                "total_processed": processed,
                "correct_verdicts": correct,
                "accuracy": round(correct / processed, 3) if processed else 0,
                "mode": "full_pipeline",
            }
        mod.save_index(data)
        mod.write_csv(contracts)
        _dataset_run_status = {"running": False, "progress": processed, "total": processed,
                               "message": f"Done. {processed} contracts analyzed. Accuracy: {round(correct/processed*100 if processed else 0,1)}%"}
    except Exception as e:
        _dataset_run_status = {"running": False, "progress": 0, "total": 0, "message": f"Error: {e}"}

def _generate_title(code: str) -> str:
    """Generate a short chat title from contract code."""
    code_lower = code.lower()
    # Try to find contract name
    for line in code.split("\n"):
        if "contract " in line and "{" in line:
            name = line.split("contract")[1].split("{")[0].split("is")[0].strip()
            if name:
                return f"Audit: {name}"
    # Fallback patterns
    if "erc20" in code_lower or "transfer" in code_lower:
        return "Token Contract Audit"
    if "erc721" in code_lower or "nft" in code_lower:
        return "NFT Contract Audit"
    if "selfdestruct" in code_lower:
        return "Self-Destruct Contract"
    if "reentrancy" in code_lower or "withdraw" in code_lower:
        return "Withdrawal Contract Audit"
    return "Smart Contract Audit"
