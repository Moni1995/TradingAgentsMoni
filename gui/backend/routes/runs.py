"""POST/GET /api/runs and friends."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException, Query, Response

from .. import storage
from ..run_manager import RunInFlightError, manager
from ..schemas import RunCreated, RunDetail, RunRequest, RunRow


router = APIRouter(prefix="/api/runs", tags=["runs"])


@router.post("", response_model=RunCreated, status_code=201)
async def create_run(req: RunRequest) -> RunCreated:
    try:
        run_id = await manager.start(req.model_dump())
    except RunInFlightError as e:
        raise HTTPException(409, detail={"error": "run_in_flight", "active_run_id": e.run_id})
    return RunCreated(run_id=run_id)


@router.get("/active")
async def active_run() -> Response:
    rid = manager.active_run_id()
    if rid is None:
        return Response(status_code=204)
    return Response(
        content=f'{{"run_id":"{rid}"}}',
        media_type="application/json",
    )


@router.post("/{run_id}/cancel")
async def cancel_run(run_id: str) -> dict:
    ok = await manager.cancel(run_id)
    if not ok:
        raise HTTPException(404, "run is not active")
    return {"ok": True}


@router.get("", response_model=list[RunRow])
def list_runs(
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    ticker: Optional[str] = None,
    status: Optional[str] = None,
) -> list[RunRow]:
    rows = storage.list_runs(limit=limit, offset=offset, ticker=ticker, status=status)
    return [RunRow(**r) for r in rows]


@router.get("/{run_id}", response_model=RunDetail)
def get_run(run_id: str) -> RunDetail:
    row = storage.get_run(run_id)
    if row is None:
        raise HTTPException(404, "run not found")

    import json
    snapshot = storage.read_snapshot(run_id) or {}
    config = json.loads(row["config_json"]) if row.get("config_json") else {}

    return RunDetail(
        id=row["id"],
        ticker=row["ticker"],
        trade_date=row["trade_date"],
        status=row["status"],
        rating=row.get("rating"),
        started_at=row["started_at"],
        finished_at=row.get("finished_at"),
        config=config,
        market_report=snapshot.get("market_report"),
        sentiment_report=snapshot.get("sentiment_report"),
        news_report=snapshot.get("news_report"),
        fundamentals_report=snapshot.get("fundamentals_report"),
        investment_debate=snapshot.get("investment_debate"),
        risk_debate=snapshot.get("risk_debate"),
        investment_plan=snapshot.get("investment_plan"),
        trader_investment_plan=snapshot.get("trader_investment_plan"),
        final_trade_decision=snapshot.get("final_trade_decision"),
    )
