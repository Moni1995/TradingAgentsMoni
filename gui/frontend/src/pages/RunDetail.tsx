import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { Badge, Button, Card, StatusBadge } from "../components/ui";
import { Markdown } from "../components/Markdown";
import { Tabs } from "../components/Tabs";

export function RunDetail() {
  const { id } = useParams<{ id: string }>();
  const run = useQuery({ queryKey: ["run", id], queryFn: () => api.getRun(id!) });

  if (run.isLoading) return <Card>Loading…</Card>;
  if (!run.data) return <Card>Not found.</Card>;
  const r = run.data;
  const inv = r.investment_debate;
  const risk = r.risk_debate;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">
            {r.ticker} <span className="text-slate-500 text-lg">on {r.trade_date}</span>
          </h1>
          <div className="mt-1 flex items-center gap-2 text-sm text-slate-400">
            <StatusBadge status={r.status} />
            {r.rating && <Badge color="blue">{r.rating}</Badge>}
            <span className="text-slate-500">{new Date(r.started_at).toLocaleString()}</span>
          </div>
        </div>
        <Link to="/history"><Button variant="ghost">Back to history</Button></Link>
      </div>

      <Tabs
        tabs={[
          { key: "decision", label: "Decision", content: (
            <div className="space-y-4">
              <Card title="Final trade decision">
                <Markdown>{r.final_trade_decision}</Markdown>
              </Card>
              <Card title="Trader plan">
                <Markdown>{r.trader_investment_plan}</Markdown>
              </Card>
              <Card title="Investment plan">
                <Markdown>{r.investment_plan}</Markdown>
              </Card>
            </div>
          )},
          { key: "analysts", label: "Analysts", content: (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card title="Market"><Markdown>{r.market_report}</Markdown></Card>
              <Card title="Sentiment"><Markdown>{r.sentiment_report}</Markdown></Card>
              <Card title="News"><Markdown>{r.news_report}</Markdown></Card>
              <Card title="Fundamentals"><Markdown>{r.fundamentals_report}</Markdown></Card>
            </div>
          )},
          { key: "debates", label: "Debates", content: (
            <div className="space-y-6">
              <section>
                <h3 className="text-sm font-medium text-slate-300 mb-2">Investment debate</h3>
                {inv ? (
                  <>
                    <Card className="mb-2" title="Bull"><Markdown>{inv.bull_history}</Markdown></Card>
                    <Card className="mb-2" title="Bear"><Markdown>{inv.bear_history}</Markdown></Card>
                    <Card title="Research Manager"><Markdown>{inv.judge_decision}</Markdown></Card>
                  </>
                ) : <Card><p className="text-sm text-slate-500 italic">No debate recorded.</p></Card>}
              </section>
              <section>
                <h3 className="text-sm font-medium text-slate-300 mb-2">Risk debate</h3>
                {risk ? (
                  <>
                    <Card className="mb-2" title="Aggressive"><Markdown>{risk.aggressive_history}</Markdown></Card>
                    <Card className="mb-2" title="Neutral"><Markdown>{risk.neutral_history}</Markdown></Card>
                    <Card className="mb-2" title="Conservative"><Markdown>{risk.conservative_history}</Markdown></Card>
                    <Card title="Portfolio Manager"><Markdown>{risk.judge_decision}</Markdown></Card>
                  </>
                ) : <Card><p className="text-sm text-slate-500 italic">No risk debate recorded.</p></Card>}
              </section>
            </div>
          )},
          { key: "config", label: "Config", content: (
            <Card>
              <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap">
                {JSON.stringify(r.config, null, 2)}
              </pre>
            </Card>
          )},
        ]}
      />
    </div>
  );
}
