// Mirrors gui/backend/schemas.py. Kept by hand — small enough that codegen
// would be more setup than upkeep.

export type ReportField =
  | "market_report"
  | "sentiment_report"
  | "news_report"
  | "fundamentals_report"
  | "investment_plan"
  | "trader_investment_plan"
  | "final_trade_decision";

export type AnalystKey = "market" | "social" | "news" | "fundamentals";

export type RunStatus = "running" | "completed" | "failed" | "cancelled";

export interface ProviderInfo {
  key: string;
  label: string;
  env_var: string | null;
  key_present: boolean;
  quick_models: { label: string; value: string }[];
  deep_models:  { label: string; value: string }[];
}

export interface ConfigDefaults {
  llm_provider: string;
  deep_think_llm: string;
  quick_think_llm: string;
  max_debate_rounds: number;
  max_risk_discuss_rounds: number;
  checkpoint_enabled: boolean;
  output_language: string;
  google_thinking_level: string | null;
  openai_reasoning_effort: string | null;
  anthropic_effort: string | null;
}

export interface RunRequest {
  ticker: string;
  trade_date: string;
  asset_type: "stock" | "crypto";
  selected_analysts: AnalystKey[];
  llm_provider: string;
  deep_think_llm: string;
  quick_think_llm: string;
  backend_url?: string | null;
  max_debate_rounds: number;
  max_risk_discuss_rounds: number;
  checkpoint_enabled: boolean;
  output_language: string;
  google_thinking_level?: string | null;
  openai_reasoning_effort?: string | null;
  anthropic_effort?: string | null;
}

export interface RunRow {
  id: string;
  ticker: string;
  trade_date: string;
  status: RunStatus;
  rating: string | null;
  decision_preview: string | null;
  started_at: string;
  finished_at: string | null;
}

export interface RunDetail {
  id: string;
  ticker: string;
  trade_date: string;
  status: RunStatus;
  rating: string | null;
  started_at: string;
  finished_at: string | null;
  config: Record<string, unknown>;
  market_report: string | null;
  sentiment_report: string | null;
  news_report: string | null;
  fundamentals_report: string | null;
  investment_debate: { bull_history: string; bear_history: string; judge_decision: string } | null;
  risk_debate: {
    aggressive_history: string;
    conservative_history: string;
    neutral_history: string;
    judge_decision: string;
  } | null;
  investment_plan: string | null;
  trader_investment_plan: string | null;
  final_trade_decision: string | null;
}

// Tagged union of events the WS emits.
export type StreamEvent =
  | { t: "run_started"; ts: number; run_id: string; ticker: string; date: string; selected_analysts: AnalystKey[] }
  | { t: "report_updated"; ts: number; field: ReportField; markdown: string }
  | { t: "debate_turn"; ts: number; debate: "investment" | "risk"; speaker: string; markdown: string }
  | { t: "log"; ts: number; level: "info" | "warn" | "error"; text: string }
  | { t: "message"; ts: number; role: string; text: string }
  | { t: "run_finished"; ts: number; decision: string; rating: string; duration_ms: number }
  | { t: "run_failed"; ts: number; error: string; traceback?: string }
  | { t: "run_cancelled"; ts: number };
