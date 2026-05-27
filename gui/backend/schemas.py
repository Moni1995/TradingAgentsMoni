"""Pydantic models for REST + the StreamEvent envelope crossing the WS."""

from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


ReportField = Literal[
    "market_report",
    "sentiment_report",
    "news_report",
    "fundamentals_report",
    "investment_plan",
    "trader_investment_plan",
    "final_trade_decision",
]


AnalystKey = Literal["market", "social", "news", "fundamentals"]


class RunRequest(BaseModel):
    """Body for POST /api/runs."""

    ticker: str = Field(..., min_length=1, max_length=20)
    trade_date: str = Field(..., description="YYYY-MM-DD")
    asset_type: Literal["stock", "crypto"] = "stock"
    selected_analysts: list[AnalystKey] = Field(
        default_factory=lambda: ["market", "social", "news", "fundamentals"]
    )

    llm_provider: str = "openai"
    deep_think_llm: str = "gpt-5.4"
    quick_think_llm: str = "gpt-5.4-mini"
    backend_url: Optional[str] = None

    max_debate_rounds: int = Field(1, ge=1, le=5)
    max_risk_discuss_rounds: int = Field(1, ge=1, le=5)

    checkpoint_enabled: bool = False
    output_language: str = "English"

    # Pass-through provider-specific reasoning knobs (None = use provider default).
    google_thinking_level: Optional[str] = None
    openai_reasoning_effort: Optional[str] = None
    anthropic_effort: Optional[str] = None


class RunCreated(BaseModel):
    run_id: str


class RunRow(BaseModel):
    """A row in the history list."""

    id: str
    ticker: str
    trade_date: str
    status: Literal["running", "completed", "failed", "cancelled"]
    rating: Optional[str] = None
    decision_preview: Optional[str] = None
    started_at: str
    finished_at: Optional[str] = None


class RunDetail(BaseModel):
    """Full run, including the snapshot fields."""

    id: str
    ticker: str
    trade_date: str
    status: str
    rating: Optional[str] = None
    started_at: str
    finished_at: Optional[str] = None
    config: dict[str, Any]

    market_report: Optional[str] = None
    sentiment_report: Optional[str] = None
    news_report: Optional[str] = None
    fundamentals_report: Optional[str] = None
    investment_debate: Optional[dict[str, Any]] = None
    risk_debate: Optional[dict[str, Any]] = None
    investment_plan: Optional[str] = None
    trader_investment_plan: Optional[str] = None
    final_trade_decision: Optional[str] = None


class ProviderInfo(BaseModel):
    key: str
    label: str
    env_var: Optional[str]
    key_present: bool
    quick_models: list[dict[str, str]]
    deep_models: list[dict[str, str]]


# StreamEvent — kept as a free-form dict on the wire (server hand-builds them
# in worker.py); we expose a small builder so schema drift is localized.

def evt(t: str, ts: float, **fields: Any) -> dict[str, Any]:
    """Build a StreamEvent dict with the conventional shape."""
    return {"t": t, "ts": ts, **fields}
