"""Spawn the worker, drain its event queue, broadcast to WS clients, tee to DB.

One active run at a time. The drain runs on an asyncio executor thread because
multiprocessing.Queue.get() is blocking and we don't want to spin a tight loop.
"""

from __future__ import annotations

import asyncio
import logging
import multiprocessing as mp
import uuid
from dataclasses import dataclass, field
from typing import Any, Optional

from . import storage
from .worker import run_worker


logger = logging.getLogger(__name__)


@dataclass
class _ActiveRun:
    run_id: str
    process: mp.Process
    queue: "mp.Queue"
    # Subscribers: each WS client owns an asyncio.Queue we forward events into.
    subscribers: set[asyncio.Queue] = field(default_factory=set)
    finished: asyncio.Event = field(default_factory=asyncio.Event)


class RunManager:
    """Holds at most one in-flight run."""

    def __init__(self) -> None:
        self._active: Optional[_ActiveRun] = None
        # Single lock guards _active + subscribers mutation.
        self._lock = asyncio.Lock()
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        # Use spawn explicitly: matches Windows default, makes Linux/macOS
        # behavior identical, and avoids fork-time CUDA/SSL footguns.
        self._ctx = mp.get_context("spawn")

    def bind_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    # ---------- lifecycle ----------

    async def start(self, request: dict[str, Any]) -> str:
        async with self._lock:
            if self._active is not None and self._active.process.is_alive():
                raise RunInFlightError(self._active.run_id)

            run_id = uuid.uuid4().hex
            storage.create_run(
                run_id=run_id,
                ticker=request["ticker"].upper(),
                trade_date=request["trade_date"],
                config=request,
            )

            queue: mp.Queue = self._ctx.Queue()
            process = self._ctx.Process(
                target=run_worker,
                args=(run_id, request, queue),
                name=f"ta-worker-{run_id[:8]}",
                daemon=False,
            )
            process.start()

            active = _ActiveRun(run_id=run_id, process=process, queue=queue)
            self._active = active

            # Drain on a background executor thread so we don't block the loop.
            asyncio.create_task(self._drain(active))
            return run_id

    async def cancel(self, run_id: str) -> bool:
        async with self._lock:
            active = self._active
            if active is None or active.run_id != run_id:
                return False
            if active.process.is_alive():
                active.process.terminate()
            storage.mark_run_cancelled(run_id)
            return True

    def active_run_id(self) -> Optional[str]:
        if self._active is None:
            return None
        return self._active.run_id if self._active.process.is_alive() else None

    # ---------- WS subscriptions ----------

    async def subscribe(self, run_id: str) -> Optional[asyncio.Queue]:
        async with self._lock:
            active = self._active
            if active is None or active.run_id != run_id:
                return None
            q: asyncio.Queue = asyncio.Queue(maxsize=256)
            active.subscribers.add(q)
            return q

    async def unsubscribe(self, run_id: str, q: asyncio.Queue) -> None:
        async with self._lock:
            active = self._active
            if active is None or active.run_id != run_id:
                return
            active.subscribers.discard(q)

    async def wait_finished(self, run_id: str) -> None:
        active = self._active
        if active and active.run_id == run_id:
            await active.finished.wait()

    # ---------- drain loop ----------

    async def _drain(self, active: _ActiveRun) -> None:
        """Move events from the worker's mp.Queue onto the wire + into SQLite."""
        loop = asyncio.get_running_loop()
        try:
            while True:
                # Blocking get on a thread so the asyncio loop stays responsive.
                event = await loop.run_in_executor(None, active.queue.get)
                if event is None:  # sentinel
                    break
                # Tee to SQLite (replay buffer).
                try:
                    storage.append_event(active.run_id, event)
                except Exception as e:
                    logger.warning("append_event failed: %s", e)

                # Terminal events update the runs row.
                t = event.get("t")
                if t == "run_finished":
                    snap = event.pop("snapshot", None) or {}
                    snap_path = None
                    try:
                        snap_path = storage.write_snapshot(active.run_id, snap)
                    except Exception as e:
                        logger.warning("write_snapshot failed: %s", e)
                    storage.mark_run_finished(
                        active.run_id,
                        decision=event.get("decision") or None,
                        rating=event.get("rating") or None,
                        snapshot_path=snap_path,
                    )
                elif t == "run_failed":
                    storage.mark_run_failed(active.run_id, event.get("error", "unknown"))
                elif t == "run_cancelled":
                    storage.mark_run_cancelled(active.run_id)

                # Fan out to subscribers (drop on slow consumers — they get
                # SQLite replay on reconnect).
                async with self._lock:
                    subs = list(active.subscribers)
                for q in subs:
                    try:
                        q.put_nowait(event)
                    except asyncio.QueueFull:
                        logger.warning("subscriber queue full, dropping event")
        finally:
            # Make sure the child reaps; SIGTERM if still alive.
            if active.process.is_alive():
                active.process.join(timeout=5.0)
                if active.process.is_alive():
                    active.process.terminate()
                    active.process.join(timeout=2.0)
            active.finished.set()
            # Push a sentinel-None to each subscriber so their consumer loop
            # can exit cleanly without a separate is-done check.
            async with self._lock:
                subs = list(active.subscribers)
                if self._active is active:
                    self._active = None
            for q in subs:
                try:
                    q.put_nowait(None)
                except asyncio.QueueFull:
                    pass


class RunInFlightError(Exception):
    """Raised when start() is called while another run is active."""

    def __init__(self, run_id: str) -> None:
        super().__init__(f"run {run_id} is in flight")
        self.run_id = run_id


# Module-level singleton, mounted into FastAPI app.state on startup.
manager = RunManager()
