"""WS /ws/runs/{id}.

Protocol: on connect, replay all buffered events from SQLite first, then
forward new events as the worker produces them. Connection stays open until
either the client disconnects or the run terminates and the subscriber sees
the sentinel None.
"""

from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from . import storage
from .run_manager import manager


logger = logging.getLogger(__name__)

router = APIRouter()


@router.websocket("/ws/runs/{run_id}")
async def stream(ws: WebSocket, run_id: str) -> None:
    await ws.accept()

    # 1. Replay buffer (cheap if run is small; bounded by SQLite read).
    try:
        for ev in storage.load_events(run_id):
            await ws.send_json(ev)
    except Exception as e:
        logger.warning("replay failed: %s", e)
        await ws.send_json({"t": "log", "level": "warn", "text": f"replay failed: {e}"})

    # 2. Subscribe for live events if the run is still active.
    sub = await manager.subscribe(run_id)
    if sub is None:
        # Run is already complete — replay was the entire story.
        await ws.close()
        return

    try:
        while True:
            # Race the worker producing an event vs the client disconnecting.
            recv_task = asyncio.create_task(ws.receive_text())
            send_task = asyncio.create_task(sub.get())
            done, pending = await asyncio.wait(
                {recv_task, send_task}, return_when=asyncio.FIRST_COMPLETED,
            )
            for p in pending:
                p.cancel()

            if send_task in done:
                ev = send_task.result()
                if ev is None:  # sentinel: drain loop is done
                    break
                await ws.send_json(ev)
            if recv_task in done:
                # Client message → treat any frame as a ping; raise on disconnect.
                try:
                    recv_task.result()
                except WebSocketDisconnect:
                    break
                except Exception:
                    break
    except WebSocketDisconnect:
        pass
    finally:
        await manager.unsubscribe(run_id, sub)
        try:
            await ws.close()
        except Exception:
            pass
