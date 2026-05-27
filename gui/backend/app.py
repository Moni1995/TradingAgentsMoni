"""FastAPI entrypoint."""

from __future__ import annotations

import asyncio
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception:
    pass

from . import storage
from .routes import providers as providers_routes
from .routes import runs as runs_routes
from .run_manager import manager
from .ws import router as ws_router


logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI):
    storage.init_db()
    manager.bind_loop(asyncio.get_running_loop())
    yield


app = FastAPI(title="TradingAgents GUI", lifespan=lifespan)

# Vite dev server origin; tightened to "*" only because everything is local.
# In Lighthouse prod the frontend is served by FastAPI itself, so CORS doesn't fire.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(providers_routes.router)
app.include_router(runs_routes.router)
app.include_router(ws_router)


@app.get("/api/health")
def health() -> dict:
    return {"ok": True}


# Serve the built frontend in prod. The dist dir is created by `pnpm build`.
_FRONTEND_DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
if _FRONTEND_DIST.exists():
    app.mount("/", StaticFiles(directory=str(_FRONTEND_DIST), html=True), name="frontend")


def run() -> None:
    """Entry point for `tradingagents-gui` console script."""
    import uvicorn

    host = os.environ.get("TRADINGAGENTS_GUI_HOST", "127.0.0.1")
    port = int(os.environ.get("TRADINGAGENTS_GUI_PORT", "8000"))
    uvicorn.run("gui.backend.app:app", host=host, port=port, reload=False)


if __name__ == "__main__":
    run()
