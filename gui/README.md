# TradingAgents GUI

Browser GUI for TradingAgents. FastAPI backend + React (Vite) frontend; a
multiprocess worker iterates `graph.graph.stream(...)` and pushes
`StreamEvent`s over a WebSocket so analyst reports and debates fill in live.

Design doc: [`../docs/plans/2026-05-27-trading-agents-gui-design.md`](../docs/plans/2026-05-27-trading-agents-gui-design.md).

## First-time setup

```powershell
# 1. Install backend deps (use the same env that has tradingagents installed)
pip install -e ".[gui]"

# 2. Install frontend deps + build it
cd gui/frontend
npm install
npm run build      # produces gui/frontend/dist; FastAPI auto-mounts it
cd ../..

# 3. Make sure your provider API key is in .env (same names the CLI uses):
#    OPENAI_API_KEY=...   ANTHROPIC_API_KEY=...   DASHSCOPE_CN_API_KEY=...   etc.
```

## Run (single-process prod-style)

```powershell
tradingagents-gui                               # console script
# or
python -m uvicorn gui.backend.app:app --port 8000
```

Open http://127.0.0.1:8000.

## Run (dev mode, hot reload)

Two terminals:

```powershell
# terminal 1 — backend (port 8000)
python -m uvicorn gui.backend.app:app --reload --port 8000

# terminal 2 — frontend (port 5173, proxies /api + /ws to :8000)
cd gui/frontend
npm run dev
```

Open http://127.0.0.1:5173.

## Data layout

- `~/.tradingagents-gui/runs.db` — SQLite: runs, replay event buffer, UI prefs.
- `~/.tradingagents-gui/snapshots/{run_id}.json` — full reports + debates per run.
- The existing `~/.tradingagents/memory/trading_memory.md` is left untouched —
  both CLI and GUI runs append to it via `TradingAgentsGraph`, so the
  reflection-on-next-run feature works regardless of which surface launched it.

Override the GUI's base dir with `TRADINGAGENTS_GUI_DIR=...`.

## Notes

- One run at a time in v1 — `POST /api/runs` returns 409 if another is in
  flight; the New Run page shows a "view live run" banner instead of the form.
- API keys are read from `.env` / process env. The GUI never writes secrets.
- Cancelling a run sends SIGTERM to the worker process.
