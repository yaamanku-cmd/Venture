import os
import sys
import time
import asyncio
from typing import Optional, Dict, Any
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict
import joblib
import pandas as pd
from backend.database import (
    init_db,
    save_transaction,
    get_db_stats,
    get_recent_transactions,
    mark_reviewed,
)

MODEL_PATH = os.environ.get("MODEL_PATH", "fraud_model.joblib")
FRAUD_THRESHOLD = float(os.environ.get("FRAUD_THRESHOLD", "0.5"))

# Global application state
_bundle = None
_model = None
_feature_names = []
_model_type = "unloaded"
_stats = {"total": 0, "fraud": 0, "legit": 0}
_ws_clients: set[WebSocket] = set()

def load_model():
    global _bundle, _model, _feature_names, _model_type
    if not os.path.exists(MODEL_PATH):
        raise FileNotFoundError(
            f"Model file '{MODEL_PATH}' was not found. "
            "Please run 'python train_model.py' to generate the model bundle before starting the API."
        )
    print(f"Loading fraud detection model bundle from '{MODEL_PATH}'...")
    _bundle = joblib.load(MODEL_PATH)
    _model = _bundle["model"]
    _feature_names = _bundle["feature_names"]
    _model_type = _bundle.get("model_type", "unknown")
    print(f"Model loaded successfully! Type: {_model_type}, Features: {len(_feature_names)}")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize SQLite Database & hydrate persistent stats
    init_db()
    db_stats = get_db_stats()
    _stats["total"] = db_stats["total"]
    _stats["fraud"] = db_stats["fraud"]
    _stats["legit"] = db_stats["legit"]
    print(f"[Database] Loaded persistent state: {_stats['total']} total ({_stats['fraud']} fraud, {_stats['legit']} legit).")

    load_model()
    yield
    _ws_clients.clear()


app = FastAPI(
    title="Real-Time Fraud Detection Engine",
    description="Low-latency inference API with WebSocket telemetry feed",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS configuration allowing Vite dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://localhost:8000",
        "*",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class TransactionInput(BaseModel):
    model_config = ConfigDict(extra="allow")
    Time: Optional[float] = 0.0
    Amount: Optional[float] = 0.0
    Class: Optional[int] = None

def _score(payload: dict) -> tuple[str, float]:
    # CRITICAL: Rebuild DataFrame strictly using _feature_names order to prevent column drift
    row = {feat: float(payload.get(feat, 0.0)) for feat in _feature_names}
    X = pd.DataFrame([row], columns=_feature_names)
    proba = float(_model.predict_proba(X)[0, 1])
    verdict = "Fraud" if proba >= FRAUD_THRESHOLD else "Legitimate"
    return verdict, proba

async def _broadcast_event(event: dict):
    if not _ws_clients:
        return
    dead_clients = set()
    for ws in list(_ws_clients):
        try:
            await ws.send_json(event)
        except Exception:
            dead_clients.add(ws)
    for ws in dead_clients:
        _ws_clients.discard(ws)

@app.post("/predict")
async def predict_transaction(txn: TransactionInput):
    if _model is None:
        raise HTTPException(status_code=503, detail="Model is not loaded.")

    payload = txn.model_dump()
    
    # CRITICAL: Pop 'Class' ground truth so it NEVER reaches the inference model
    ground_truth_raw = payload.pop("Class", None)
    if ground_truth_raw is not None:
        ground_truth = "Fraud" if int(ground_truth_raw) == 1 else "Legitimate"
    else:
        ground_truth = None

    verdict, proba = _score(payload)

    # Persist transaction into SQLite database
    txn_time = float(payload.get("Time", 0.0))
    txn_amount = float(payload.get("Amount", 0.0))
    txn_timestamp = time.time()

    db_record = save_transaction(
        time_val=txn_time,
        amount=txn_amount,
        fraud_probability=proba,
        verdict=verdict,
        ground_truth=ground_truth,
        timestamp=txn_timestamp,
    )

    # Update in-memory running stats
    _stats["total"] += 1
    if verdict == "Fraud":
        _stats["fraud"] += 1
    else:
        _stats["legit"] += 1

    response = {
        "id": db_record.id,
        "verdict": verdict,
        "fraud_probability": round(proba, 6),
        "amount": round(txn_amount, 2),
        "time": txn_time,
        "ground_truth": ground_truth,
        "timestamp": txn_timestamp,
        "is_reviewed": db_record.is_reviewed,
        "stats": {
            "total": _stats["total"],
            "fraud": _stats["fraud"],
            "legit": _stats["legit"],
            "fraud_rate": round((_stats["fraud"] / _stats["total"]) * 100, 2),
        },
    }

    # Asynchronously push to connected WebSocket dashboard clients
    asyncio.create_task(_broadcast_event(response))

    return response

@app.get("/api/transactions")
def list_transactions(limit: int = 40, verdict: Optional[str] = None):
    """Retrieve persisted transactions from SQLite database."""
    return get_recent_transactions(limit=limit, verdict_filter=verdict)

@app.get("/api/database/status")
def get_database_status():
    """Retrieve database connection status and storage statistics."""
    stats = get_db_stats()
    return {
        "connected": True,
        "type": "SQLite (WAL Mode)",
        "database_file": "fraud_shield.db",
        "total_persisted_transactions": stats["total"],
        "fraud_flagged": stats["fraud"],
        "approved_legit": stats["legit"],
        "fraud_rate": stats["fraud_rate"],
    }

@app.post("/api/transactions/{transaction_id}/review")
def review_transaction(transaction_id: int, notes: Optional[str] = None):
    """Allow analyst to mark a transaction as reviewed in the database."""
    record = mark_reviewed(transaction_id, notes)
    if not record:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return record


@app.get("/stats")
def get_stats():
    total = _stats["total"]
    fraud = _stats["fraud"]
    legit = _stats["legit"]
    rate = round((fraud / total * 100), 2) if total > 0 else 0.0
    return {
        "total": total,
        "fraud": fraud,
        "legit": legit,
        "fraud_rate": rate,
    }

@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "model_loaded": _model is not None,
        "model_type": _model_type,
        "feature_count": len(_feature_names),
        "connected_clients": len(_ws_clients),
        "fraud_threshold": FRAUD_THRESHOLD,
    }

@app.websocket("/ws/feed")
async def websocket_feed(websocket: WebSocket):
    await websocket.accept()
    _ws_clients.add(websocket)
    try:
        # Push initial sync state
        total = _stats["total"]
        fraud = _stats["fraud"]
        legit = _stats["legit"]
        rate = round((fraud / total * 100), 2) if total > 0 else 0.0
        await websocket.send_json({
            "type": "sync",
            "stats": {
                "total": total,
                "fraud": fraud,
                "legit": legit,
                "fraud_rate": rate,
            },
            "connected_at": time.time(),
        })
        while True:
            # Keep socket open and await any client ping/message
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        _ws_clients.discard(websocket)
    except Exception:
        _ws_clients.discard(websocket)

# --- TinyFish Agent Bridge Endpoints ---
from backend.tinyfish_service import tinyfish_bridge

class TinyFishRunRequest(BaseModel):
    goal: Optional[str] = "Audit live transaction feed, verify risk probability alignment, and check for high-risk anomalies."
    url: Optional[str] = "http://localhost:5173"

class TinyFishKeyRequest(BaseModel):
    api_key: str

@app.get("/api/tinyfish/status")
def get_tinyfish_status():
    status = tinyfish_bridge.get_status()
    status["backend_live"] = True
    status["total_transactions_scored"] = _stats["total"]
    return status

@app.post("/api/tinyfish/agent/run")
def run_tinyfish_agent(req: TinyFishRunRequest):
    current_stats = {
        "total": _stats["total"],
        "fraud": _stats["fraud"],
        "legit": _stats["legit"],
        "fraud_rate": round((_stats["fraud"] / max(1, _stats["total"])) * 100, 2),
    }
    result = tinyfish_bridge.run_agent_monitoring(
        goal=req.goal or "Audit live transaction feed, verify risk probability alignment, and check for high-risk anomalies.",
        url=req.url or "http://localhost:5173",
        backend_stats=current_stats,
    )
    return result

@app.post("/api/tinyfish/config")
def set_tinyfish_key(req: TinyFishKeyRequest):
    success = tinyfish_bridge.set_api_key(req.api_key)
    return {
        "success": success,
        "status": tinyfish_bridge.get_status(),
    }

# --- Static Frontend Serving for Render Deployment ---
if os.path.exists("frontend/dist"):
    from fastapi.staticfiles import StaticFiles
    from starlette.responses import FileResponse

    if os.path.exists("frontend/dist/assets"):
        app.mount("/assets", StaticFiles(directory="frontend/dist/assets"), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        if full_path.startswith(("api", "predict", "stats", "health", "ws", "docs", "openapi.json")):
            raise HTTPException(status_code=404, detail="Not Found")
        target = os.path.join("frontend/dist", full_path)
        if os.path.isfile(target):
            return FileResponse(target)
        return FileResponse("frontend/dist/index.html")


