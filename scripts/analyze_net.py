"""One-off: run TradingAgents on NET for 2026-06-15 and dump the final decision."""
import os, json, sys, traceback
from datetime import datetime

os.environ.setdefault("TRADINGAGENTS_LLM_PROVIDER", "deepseek")
os.environ.setdefault("TRADINGAGENTS_DEEP_THINK_LLM", "deepseek-chat")
os.environ.setdefault("TRADINGAGENTS_QUICK_THINK_LLM", "deepseek-chat")
os.environ.setdefault("TRADINGAGENTS_MAX_DEBATE_ROUNDS", "1")
os.environ.setdefault("TRADINGAGENTS_MAX_RISK_ROUNDS", "1")

from tradingagents.graph.trading_graph import TradingAgentsGraph
from tradingagents.default_config import DEFAULT_CONFIG

print(f"[{datetime.now().isoformat()}] starting NET analysis", flush=True)
cfg = DEFAULT_CONFIG.copy()
print("provider:", cfg["llm_provider"], "deep:", cfg["deep_think_llm"], "quick:", cfg["quick_think_llm"], flush=True)

try:
    ta = TradingAgentsGraph(debug=False, config=cfg)
    final_state, decision = ta.propagate("NET", "2026-06-15")
    print(f"[{datetime.now().isoformat()}] finished — decision: {decision}", flush=True)

    out = {
        "decision": decision,
        "market_report": final_state.get("market_report"),
        "sentiment_report": final_state.get("sentiment_report"),
        "news_report": final_state.get("news_report"),
        "fundamentals_report": final_state.get("fundamentals_report"),
        "investment_plan": final_state.get("investment_plan"),
        "trader_investment_plan": final_state.get("trader_investment_plan"),
        "final_trade_decision": final_state.get("final_trade_decision"),
    }
    with open("scripts/_net_run_output.json", "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2)
    print("wrote scripts/_net_run_output.json", flush=True)
except Exception:
    traceback.print_exc()
    sys.exit(1)
