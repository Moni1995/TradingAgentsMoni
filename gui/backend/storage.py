"""SQLite persistence for runs + the event replay buffer.

Raw sqlite3 (no ORM) is enough at this scale and keeps the dep list small.
All writes go through this module so the schema is in one place.
"""

from __future__ import annotations

import json
import sqlite3
import threading
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Iterator, Optional

from .paths import db_path, ensure_dirs, snapshots_dir


_SCHEMA = """
CREATE TABLE IF NOT EXISTS runs (
    id              TEXT PRIMARY KEY,
    ticker          TEXT NOT NULL,
    trade_date      TEXT NOT NULL,
    status          TEXT NOT NULL,
    config_json     TEXT NOT NULL,
    started_at      TEXT NOT NULL,
    finished_at     TEXT,
    decision        TEXT,
    rating          TEXT,
    error           TEXT,
    snapshot_path   TEXT
);

CREATE INDEX IF NOT EXISTS idx_runs_started ON runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_runs_ticker  ON runs(ticker);
CREATE INDEX IF NOT EXISTS idx_runs_status  ON runs(status);

CREATE TABLE IF NOT EXISTS run_events (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id    TEXT NOT NULL,
    ts        REAL NOT NULL,
    event_json TEXT NOT NULL,
    FOREIGN KEY(run_id) REFERENCES runs(id)
);

CREATE INDEX IF NOT EXISTS idx_events_run ON run_events(run_id, id);

CREATE TABLE IF NOT EXISTS config_kv (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
"""


# Single writer lock — SQLite serializes writes anyway, but holding a Python
# lock around RunManager's tee + REST writes avoids "database is locked"
# under concurrent WS replay reads.
_write_lock = threading.Lock()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def init_db() -> None:
    ensure_dirs()
    with _connect() as conn:
        conn.executescript(_SCHEMA)


@contextmanager
def _connect() -> Iterator[sqlite3.Connection]:
    conn = sqlite3.connect(db_path(), timeout=10.0, isolation_level=None)
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA foreign_keys = ON")
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()


# ---------- runs ----------


def create_run(run_id: str, ticker: str, trade_date: str, config: dict[str, Any]) -> str:
    started = _now_iso()
    with _write_lock, _connect() as conn:
        conn.execute(
            "INSERT INTO runs(id, ticker, trade_date, status, config_json, started_at) "
            "VALUES (?, ?, ?, 'running', ?, ?)",
            (run_id, ticker, trade_date, json.dumps(config), started),
        )
    return started


def mark_run_finished(
    run_id: str,
    *,
    decision: Optional[str],
    rating: Optional[str],
    snapshot_path: Optional[str],
) -> None:
    with _write_lock, _connect() as conn:
        conn.execute(
            "UPDATE runs SET status='completed', finished_at=?, decision=?, rating=?, "
            "snapshot_path=? WHERE id=?",
            (_now_iso(), decision, rating, snapshot_path, run_id),
        )


def mark_run_failed(run_id: str, error: str) -> None:
    with _write_lock, _connect() as conn:
        conn.execute(
            "UPDATE runs SET status='failed', finished_at=?, error=? WHERE id=?",
            (_now_iso(), error, run_id),
        )


def mark_run_cancelled(run_id: str) -> None:
    with _write_lock, _connect() as conn:
        conn.execute(
            "UPDATE runs SET status='cancelled', finished_at=? WHERE id=? AND status='running'",
            (_now_iso(), run_id),
        )


def get_active_run_id() -> Optional[str]:
    with _connect() as conn:
        row = conn.execute(
            "SELECT id FROM runs WHERE status='running' "
            "ORDER BY started_at DESC LIMIT 1"
        ).fetchone()
        return row["id"] if row else None


def list_runs(
    *,
    limit: int = 50,
    offset: int = 0,
    ticker: Optional[str] = None,
    status: Optional[str] = None,
) -> list[dict[str, Any]]:
    sql = ("SELECT id, ticker, trade_date, status, rating, decision, started_at, finished_at "
           "FROM runs")
    where, params = [], []
    if ticker:
        where.append("ticker = ?")
        params.append(ticker.upper())
    if status:
        where.append("status = ?")
        params.append(status)
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY started_at DESC LIMIT ? OFFSET ?"
    params += [limit, offset]
    with _connect() as conn:
        rows = conn.execute(sql, params).fetchall()
        out = []
        for r in rows:
            decision = r["decision"]
            preview = (decision[:200] + "…") if decision and len(decision) > 200 else decision
            out.append({
                "id": r["id"],
                "ticker": r["ticker"],
                "trade_date": r["trade_date"],
                "status": r["status"],
                "rating": r["rating"],
                "decision_preview": preview,
                "started_at": r["started_at"],
                "finished_at": r["finished_at"],
            })
        return out


def get_run(run_id: str) -> Optional[dict[str, Any]]:
    with _connect() as conn:
        row = conn.execute("SELECT * FROM runs WHERE id = ?", (run_id,)).fetchone()
        return dict(row) if row else None


# ---------- events (replay buffer) ----------


def append_event(run_id: str, event: dict[str, Any]) -> None:
    with _write_lock, _connect() as conn:
        conn.execute(
            "INSERT INTO run_events(run_id, ts, event_json) VALUES (?, ?, ?)",
            (run_id, float(event.get("ts", 0.0)), json.dumps(event)),
        )


def load_events(run_id: str) -> list[dict[str, Any]]:
    with _connect() as conn:
        rows = conn.execute(
            "SELECT event_json FROM run_events WHERE run_id = ? ORDER BY id",
            (run_id,),
        ).fetchall()
        return [json.loads(r["event_json"]) for r in rows]


# ---------- snapshot files ----------


def write_snapshot(run_id: str, snapshot: dict[str, Any]) -> str:
    path = snapshots_dir() / f"{run_id}.json"
    path.write_text(json.dumps(snapshot, indent=2, default=str), encoding="utf-8")
    return str(path)


def read_snapshot(run_id: str) -> Optional[dict[str, Any]]:
    path = snapshots_dir() / f"{run_id}.json"
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))
