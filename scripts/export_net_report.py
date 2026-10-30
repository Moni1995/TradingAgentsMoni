"""Render scripts/_net_run_output.json into a single Markdown report."""
import json
from pathlib import Path
from datetime import datetime

src = Path("scripts/_net_run_output.json")
out = Path("reports/NET_2026-06-15.md")
out.parent.mkdir(parents=True, exist_ok=True)

d = json.loads(src.read_text(encoding="utf-8"))

SECTIONS = [
    ("Final Trade Decision", "final_trade_decision"),
    ("Trader Plan", "trader_investment_plan"),
    ("Investment Plan (Research Manager)", "investment_plan"),
    ("Market / Technicals Analyst", "market_report"),
    ("Fundamentals Analyst", "fundamentals_report"),
    ("News Analyst", "news_report"),
    ("Social / Sentiment Analyst", "sentiment_report"),
]

lines = [
    "# TradingAgents Report — NET (Cloudflare)",
    "",
    f"- **Trade date analyzed**: 2026-06-15",
    f"- **Generated**: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
    f"- **LLM provider**: DeepSeek (deepseek-chat, deep + quick)",
    f"- **Headline signal**: **{d.get('decision','?')}**",
    "",
    "---",
    "",
]

for title, key in SECTIONS:
    body = d.get(key) or "_(no content)_"
    lines += [f"## {title}", "", body.strip(), "", "---", ""]

out.write_text("\n".join(lines), encoding="utf-8")
print(f"wrote {out}  ({out.stat().st_size:,} bytes)")
