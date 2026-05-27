# TradingAgents GUI — Design

**Date:** 2026-05-27
**Status:** Approved
**Author:** Monique Otter (with Claude Code)

## Goal

Add a browser GUI for TradingAgents that achieves CLI parity for kicking off
runs, streams agent output live as the LangGraph executes, and provides a
run-history browser that can re-open past runs with their full analyst reports.

Local-first deployment, with a clean path to Tencent Lighthouse later.

## Out of scope (v1)

- Multi-user accounts, per-user run isolation.
- Charts, price overlays, P&L vs SPY.
- Token-level streaming (node-boundary streaming only — matches what
  LangGraph exposes today via `graph.stream()`).
- API-key entry UI in the browser. Keys live in `.env`.
- Parallel runs. `POST /api/runs` returns 409 if one is already active.
- Manual `reflect_and_remember` button. Can be added later.

## Non-modification principle

The existing `tradingagents/` package is **imported, not modified**. All GUI
code lives under a new `gui/` directory. If the GUI later needs richer
streaming hooks, those go in as a separate, deliberate change to
`tradingagents/`.

The existing CLI keeps working unchanged.

The existing decision-log file at `~/.tradingagents/memory/trading_memory.md`
is also left untouched. CLI and GUI runs both still append to it (because the
append happens inside `TradingAgentsGraph`), so the reflection-on-next-run
feature works regardless of which surface launched the run. The GUI's own
SQLite DB is a parallel record optimized for the history browser.

## Architecture

### Processes

```
┌────────────────────────────────────────────────────────────┐
│  Browser (React SPA, Vite dev: :5173)                      │
│   ├─ REST  → /api/* (TanStack Query)                       │
│   └─ WS    → /ws/runs/{run_id}                             │
└─────────────────────────┬──────────────────────────────────┘
                          │
┌─────────────────────────▼──────────────────────────────────┐
│  FastAPI app (uvicorn, :8000)                              │
│   • REST endpoints + WebSocket handler                     │
│   • RunManager: holds at most 1 active Worker handle       │
│   • SQLite (runs.db) + snapshot files                      │
└─────────────────────────┬──────────────────────────────────┘
                          │ multiprocessing.Queue + Pipe (control)
┌─────────────────────────▼──────────────────────────────────┐
│  Worker process (spawned per run, dies on completion)      │
│   • Imports TradingAgentsGraph                             │
│   • Iterates graph.graph.stream(init_state, ...)           │
│   • Emits StreamEvent JSON onto the queue per chunk        │
│   • Writes final snapshot JSON; updates SQLite             │
└────────────────────────────────────────────────────────────┘
```

### Why multiprocessing instead of asyncio

- **Cancellation is trivial** — kill the process. Cancelling a stuck LLM call
  inside an asyncio task is genuinely hard; cancellation often will not
  propagate through provider SDKs.
- **Provider mix safety** — this repo supports many LLM providers, not all of
  which use properly async clients. A sync call inside a node would block the
  whole event loop in an asyncio design.
- **Crash isolation** — a worker OOM or LLM-client crash kills only the worker,
  not the FastAPI server.
- **Windows-friendly** — `spawn` semantics require the worker entrypoint to be
  importable (no closures). That is the only minor cost.

## Repo layout

Additive — nothing existing moves.

```
TradingAgentsMoni/
├── tradingagents/           # untouched
├── cli/                     # untouched
├── gui/                     # NEW
│   ├── backend/
│   │   ├── app.py           # FastAPI + lifespan (init SQLite, mount routes/ws, serve frontend dist)
│   │   ├── routes/          # runs, history, config, providers
│   │   ├── ws.py            # WebSocket handler
│   │   ├── run_manager.py   # spawn/cancel worker, drain queue, broadcast to WS
│   │   ├── worker.py        # entrypoint for spawned process
│   │   ├── storage.py       # SQLite models + snapshot file IO
│   │   └── schemas.py       # Pydantic models / StreamEvent
│   └── frontend/
│       ├── package.json
│       ├── src/
│       │   ├── pages/       # NewRun, LiveRun, HistoryList, RunDetail, Settings
│       │   ├── components/  # ReportCard, DebatePane, ProviderForm, …
│       │   ├── api/         # REST client + WS hook
│       │   └── store/       # Zustand for live-run state
│       └── vite.config.ts   # dev-proxy /api + /ws → :8000
├── docs/plans/              # design + impl plan land here
└── pyproject.toml           # adds [project.optional-dependencies] "gui"
```

## Backend contract

### REST endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET`  | `/api/providers` | LLM providers + model catalog + which env keys are set (so the form can disable providers with no key). Source: `tradingagents/llm_clients/` + `os.environ`. |
| `GET`  | `/api/config/defaults` | Returns `DEFAULT_CONFIG` so the form can prefill. |
| `POST` | `/api/runs` | Body: `{ticker, trade_date, asset_type, selected_analysts[], llm_provider, deep_think_llm, quick_think_llm, max_debate_rounds, max_risk_discuss_rounds, online_tools, checkpoint_enabled}`. Returns `{run_id}`. Rejects with 409 if a run is in flight. |
| `POST` | `/api/runs/{id}/cancel` | SIGTERM to worker; row → `cancelled`. |
| `GET`  | `/api/runs` | History list — pagination, filter by ticker/status. |
| `GET`  | `/api/runs/{id}` | Run metadata + full snapshot (analyst reports, debates, plans, decision). |
| `GET`  | `/api/runs/active` | Returns the active run id if any, else 204. Used on page reload to reattach the WS. |
| `WS`   | `/ws/runs/{id}` | Live event stream. On connect, server replays the run's buffered event log first, then streams new events. |

### `StreamEvent` JSON schema

Single tagged-union envelope crosses the queue and the WebSocket. Keeps the
React reducer simple.

```ts
type StreamEvent =
  | { t: "run_started";  ts; run_id; ticker; date; selected_analysts: string[] }
  | { t: "node_started"; ts; node: string }                          // e.g. "market_analyst"
  | { t: "node_finished"; ts; node: string; duration_ms: number }
  | { t: "report_updated"; ts; field: ReportField; markdown: string }
  | { t: "debate_turn"; ts; debate: "investment"|"risk"; speaker: string; markdown: string }
  | { t: "message"; ts; role: "system"|"tool"; text: string }
  | { t: "log"; ts; level: "info"|"warn"|"error"; text: string }
  | { t: "run_finished"; ts; decision: string; rating: string; duration_ms: number }
  | { t: "run_failed"; ts; error: string }
  | { t: "run_cancelled"; ts };

type ReportField =
  | "market_report" | "sentiment_report" | "news_report" | "fundamentals_report"
  | "investment_plan" | "trader_investment_plan" | "final_trade_decision";
```

The worker's chunk-processing loop diffs each chunk against the last known
state and only emits events when content actually changed — adapting the
dedup pattern at [cli/main.py:1115](cli/main.py#L1115).

### Worker IPC

- `events_queue: multiprocessing.Queue` — child → parent, carries
  `StreamEvent` dicts.
- `control_pipe: multiprocessing.Pipe` — parent → child, currently unused
  (cancel is via SIGTERM); reserved so we can grow it without re-wiring.
- The parent **also tees events into the SQLite event log** as it drains, so a
  late-joining WebSocket client can replay.

## Storage

### SQLite (`~/.tradingagents-gui/runs.db`)

```sql
runs(id TEXT PK, ticker TEXT, trade_date TEXT, status TEXT,
     config_json TEXT, started_at, finished_at,
     decision TEXT, rating TEXT, snapshot_path TEXT)

run_events(id INTEGER PK, run_id TEXT, ts, event_json TEXT)  -- replay buffer

config_kv(key TEXT PK, value TEXT)                            -- UI prefs only, never API keys
```

### Snapshot files

`~/.tradingagents-gui/snapshots/{run_id}.json` — the full final `AgentState`
dict (analyst reports + debates + plans + decision). The history detail page
reads this for a complete re-open. Keeps the SQLite row small.

### Notes

- API keys are **never** persisted by the GUI. They come from `.env` / process
  env, exactly like the CLI today.
- The base directory (`~/.tradingagents-gui/`) is overridable via
  `TRADINGAGENTS_GUI_DIR` for tests and for the Tencent Lighthouse container.

## Frontend

### Stack

Vite, React 19, TypeScript, Tailwind CSS, shadcn/ui, TanStack Query (REST),
Zustand (live-run store), `react-markdown` + `remark-gfm`.

### Pages

| Route | Purpose |
|---|---|
| `/` → `NewRun` | Form: ticker, date (default = today), asset type, multi-select analysts, provider + deep/quick models (driven by `/api/providers`), debate/risk rounds sliders, `online_tools` + `checkpoint_enabled` toggles. "Start run" → POST `/api/runs` → navigate to `/runs/{id}`. If a run is already active, the page shows a banner "A run is in progress — [view it]" instead of the form. |
| `/runs/{id}` → `LiveRun` | Tabs: **Overview** (status + decision once done), **Analysts** (4 markdown cards: market / sentiment / news / fundamentals — each fills as `report_updated` events arrive), **Debates** (investment bull-vs-bear + risk aggressive/neutral/conservative as chat-style transcripts), **Trader & Decision**, **Logs**. WebSocket-driven; reducer applies `StreamEvent`s into a single Zustand store. Cancel button calls `/api/runs/{id}/cancel`. |
| `/history` → `HistoryList` | Table from `/api/runs` — ticker, date, status, rating, decision preview, started_at. Filter by ticker/status. |
| `/history/{id}` → `RunDetail` | Same tabs as `LiveRun` but populated from the snapshot file — read-only, no WS. |
| `/settings` | Show which env keys are detected (✓/✗), output language, default provider. **No key entry UI in v1** — explicit by design. |

## Config & API keys

- API keys: `.env` next to `gui/backend/`, loaded via `python-dotenv` at
  FastAPI startup. Same names the CLI uses (`OPENAI_API_KEY`,
  `DASHSCOPE_CN_API_KEY`, …). **GUI never writes secrets.**
- Per-run config: the POST `/api/runs` body becomes a dict overlay on
  `DEFAULT_CONFIG.copy()` passed to `TradingAgentsGraph(config=...,
  selected_analysts=...)`. Env-var overrides (`TRADINGAGENTS_*`) keep working
  as the global default; the per-run overlay wins for that one run.

## Deployment

- **Local dev**: `uvicorn gui.backend.app:app --reload` + `pnpm dev`. Vite
  proxies `/api` and `/ws` to `:8000`. One command via a top-level
  `dev.ps1`/`dev.sh`.
- **Local prod**: `pnpm build` produces `gui/frontend/dist/`. FastAPI mounts
  it as static at `/`. One process, one port.
- **Tencent Lighthouse**: Dockerfile adapted from the existing repo Dockerfile
  — adds a Node build stage for the frontend, copies `dist/` into the Python
  image, runs `uvicorn` behind Caddy (or nginx) for TLS. Bind FastAPI to
  `127.0.0.1` and let Caddy terminate. **Add a `BASIC_AUTH_PASSWORD` env-var
  gate before going public** — that is the only auth for v1.

## Testing strategy (overview — detail in impl plan)

- Backend unit tests for `RunManager` (lifecycle, 409 on concurrent run,
  cancel) and `storage.py` (round-trip events + snapshots).
- Integration test that spawns a worker against a stubbed
  `TradingAgentsGraph` (returns a scripted sequence of state chunks) and
  asserts the resulting `StreamEvent` sequence over the WebSocket.
- Frontend: a single Playwright happy-path test that loads `NewRun`,
  submits a run against a backend running the stubbed graph, and verifies
  the live tabs populate and the history page lists the completed run.

## Open questions for the implementation plan

- Exact event-diff algorithm in the worker (per-field hash vs full-state
  compare).
- Whether to ship a single `dev.ps1`/`dev.sh` script or document the two
  commands separately.
- Caddyfile + Dockerfile changes are deferred to a separate Lighthouse
  deployment task — not part of this v1 implementation.
