"""Worker process entrypoint.

Spawned per run by RunManager. Runs the LangGraph stream and pushes
StreamEvent dicts onto a multiprocessing.Queue. Module-level function (not a
closure) because Windows uses spawn semantics and the entrypoint must be
importable.
"""

from __future__ import annotations

import logging
import os
import time
import traceback
from multiprocessing import Queue
from typing import Any

from .schemas import evt

# tradingagents is imported *inside* run_worker so the parent process (FastAPI
# server) can start without dragging in langgraph / LLM SDKs at import time.
# The worker subprocess does the import in its own address space anyway.


logger = logging.getLogger(__name__)


# Field-level last-seen content. Used to suppress duplicate report_updated
# events when the stream re-emits unchanged state on later chunks. Reset per
# run (the worker process is short-lived).
_REPORT_FIELDS = (
    "market_report",
    "sentiment_report",
    "news_report",
    "fundamentals_report",
    "investment_plan",
    "trader_investment_plan",
    "final_trade_decision",
)


def _diff_reports(prev: dict[str, str], chunk: dict[str, Any], now: float) -> list[dict]:
    events = []
    for field in _REPORT_FIELDS:
        value = chunk.get(field)
        if not isinstance(value, str):
            continue
        v = value.strip()
        if v and v != prev.get(field, ""):
            prev[field] = v
            events.append(evt("report_updated", now, field=field, markdown=value))
    return events


def _diff_debate(
    prev: dict[str, str],
    chunk: dict[str, Any],
    debate: str,
    keys: tuple[str, ...],
    speaker_labels: dict[str, str],
    now: float,
) -> list[dict]:
    state = chunk.get(f"{debate}_debate_state") or {}
    events = []
    for k in keys:
        v = (state.get(k) or "").strip()
        if v and v != prev.get(f"{debate}:{k}", ""):
            prev[f"{debate}:{k}"] = v
            events.append(evt(
                "debate_turn",
                now,
                debate=debate,
                speaker=speaker_labels[k],
                markdown=v,
            ))
    return events


_INVEST_SPEAKERS = {
    "bull_history": "Bull Researcher",
    "bear_history": "Bear Researcher",
    "judge_decision": "Research Manager",
}
_RISK_SPEAKERS = {
    "aggressive_history": "Aggressive Analyst",
    "conservative_history": "Conservative Analyst",
    "neutral_history": "Neutral Analyst",
    "judge_decision": "Portfolio Manager",
}


def _build_snapshot(merged: dict[str, Any]) -> dict[str, Any]:
    """Pick the fields the history view cares about. Drops messages/internals."""
    invest = merged.get("investment_debate_state") or {}
    risk = merged.get("risk_debate_state") or {}
    return {
        "ticker": merged.get("company_of_interest"),
        "trade_date": merged.get("trade_date"),
        "asset_type": merged.get("asset_type"),
        "market_report": merged.get("market_report") or None,
        "sentiment_report": merged.get("sentiment_report") or None,
        "news_report": merged.get("news_report") or None,
        "fundamentals_report": merged.get("fundamentals_report") or None,
        "investment_debate": {
            "bull_history": invest.get("bull_history", ""),
            "bear_history": invest.get("bear_history", ""),
            "judge_decision": invest.get("judge_decision", ""),
        } if invest else None,
        "risk_debate": {
            "aggressive_history": risk.get("aggressive_history", ""),
            "conservative_history": risk.get("conservative_history", ""),
            "neutral_history": risk.get("neutral_history", ""),
            "judge_decision": risk.get("judge_decision", ""),
        } if risk else None,
        "investment_plan": merged.get("investment_plan") or None,
        "trader_investment_plan": merged.get("trader_investment_plan") or None,
        "final_trade_decision": merged.get("final_trade_decision") or None,
    }


def run_worker(
    run_id: str,
    request: dict[str, Any],
    queue: Queue,
) -> None:
    """Worker process entrypoint.

    Parent kills this process via SIGTERM for cancellation.
    """
    started = time.time()
    last_reports: dict[str, str] = {}
    last_debate: dict[str, str] = {}
    merged_state: dict[str, Any] = {}

    try:
        from tradingagents.default_config import DEFAULT_CONFIG
        from tradingagents.graph.trading_graph import TradingAgentsGraph

        # Build config from DEFAULT_CONFIG + request overrides.
        config = DEFAULT_CONFIG.copy()
        for key in (
            "llm_provider", "deep_think_llm", "quick_think_llm", "backend_url",
            "max_debate_rounds", "max_risk_discuss_rounds", "checkpoint_enabled",
            "output_language", "google_thinking_level", "openai_reasoning_effort",
            "anthropic_effort",
        ):
            if request.get(key) is not None:
                config[key] = request[key]

        selected = request.get("selected_analysts") or ["market", "social", "news", "fundamentals"]
        ticker = request["ticker"].upper()
        trade_date = request["trade_date"]
        asset_type = request.get("asset_type", "stock")

        queue.put(evt(
            "run_started",
            time.time(),
            run_id=run_id,
            ticker=ticker,
            date=trade_date,
            selected_analysts=list(selected),
        ))

        # Construct the graph. This can take a few seconds (LLM client init).
        queue.put(evt("log", time.time(), level="info", text="Initializing graph and LLM clients..."))
        graph = TradingAgentsGraph(
            selected_analysts=list(selected),
            debug=False,
            config=config,
        )

        init_state = graph.propagator.create_initial_state(
            ticker, trade_date, asset_type=asset_type,
            past_context=graph.memory_log.get_past_context(ticker),
        )
        args = graph.propagator.get_graph_args()

        queue.put(evt("log", time.time(), level="info", text="Streaming graph execution..."))

        # stream_mode="values" → each chunk is full state; merge fold for snapshot.
        for chunk in graph.graph.stream(init_state, **args):
            merged_state.update(chunk)
            now = time.time()
            for e in _diff_reports(last_reports, chunk, now):
                queue.put(e)
            for e in _diff_debate(last_debate, chunk, "investment",
                                  ("bull_history", "bear_history", "judge_decision"),
                                  _INVEST_SPEAKERS, now):
                queue.put(e)
            for e in _diff_debate(last_debate, chunk, "risk",
                                  ("aggressive_history", "conservative_history",
                                   "neutral_history", "judge_decision"),
                                  _RISK_SPEAKERS, now):
                queue.put(e)

        # Final accounting outside the stream loop (memory log + signal extraction
        # only happens in the public .propagate(); we replicate the relevant
        # tail here so the GUI doesn't depend on .propagate()'s synchronous
        # return value).
        decision_text = (merged_state.get("final_trade_decision") or "").strip()
        try:
            rating = graph.process_signal(decision_text) if decision_text else None
        except Exception as e:
            logger.warning("signal processing failed: %s", e)
            rating = None

        if decision_text:
            try:
                graph.memory_log.store_decision(
                    ticker=ticker,
                    trade_date=trade_date,
                    final_trade_decision=decision_text,
                )
            except Exception as e:
                logger.warning("memory_log.store_decision failed: %s", e)

        snapshot = _build_snapshot(merged_state)
        snapshot["decision"] = decision_text or None
        snapshot["rating"] = rating

        queue.put(evt(
            "run_finished",
            time.time(),
            decision=decision_text,
            rating=rating or "",
            duration_ms=int((time.time() - started) * 1000),
            snapshot=snapshot,
        ))

    except SystemExit:
        # SIGTERM from parent on cancel.
        queue.put(evt("run_cancelled", time.time()))
    except Exception as e:
        logger.exception("worker failure")
        queue.put(evt(
            "run_failed",
            time.time(),
            error=f"{type(e).__name__}: {e}",
            traceback=traceback.format_exc(),
        ))
    finally:
        # Sentinel so the parent's drain loop knows we're done writing.
        queue.put(None)
