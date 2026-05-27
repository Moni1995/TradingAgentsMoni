import { Link, useParams } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { api } from "../api/client";
import { useRunWs } from "../api/useRunWs";
import { useLive } from "../store/live";
import { Badge, Button, Card, StatusBadge } from "../components/ui";
import { Markdown } from "../components/Markdown";
import { Tabs } from "../components/Tabs";

export function LiveRun() {
  const { id } = useParams<{ id: string }>();
  useRunWs(id ?? null);

  const live = useLive();
  const cancel = useMutation({ mutationFn: () => api.cancelRun(id!) });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">
            {live.ticker ?? "—"} <span className="text-slate-500 text-lg">on {live.date ?? "—"}</span>
          </h1>
          <div className="mt-1 flex items-center gap-2 text-sm text-slate-400">
            <StatusBadge status={live.status} />
            {live.rating && <Badge color="blue">{live.rating}</Badge>}
            <span className="text-slate-500">run {id?.slice(0, 8)}</span>
          </div>
        </div>
        <div className="flex gap-2">
          {live.status === "running" && (
            <Button variant="danger" onClick={() => cancel.mutate()} disabled={cancel.isPending}>
              {cancel.isPending ? "Cancelling…" : "Cancel"}
            </Button>
          )}
          <Link to="/"><Button variant="ghost">New run</Button></Link>
        </div>
      </div>

      <Tabs
        tabs={[
          {
            key: "overview",
            label: "Overview",
            content: <Overview />,
          },
          {
            key: "analysts",
            label: "Analysts",
            content: <Analysts />,
          },
          {
            key: "debates",
            label: "Debates",
            content: <Debates />,
          },
          {
            key: "decision",
            label: "Trader & decision",
            content: <Decision />,
          },
          {
            key: "logs",
            label: `Logs (${live.logs.length})`,
            content: <Logs />,
          },
        ]}
      />
    </div>
  );
}

function Overview() {
  const live = useLive();
  if (live.status === "failed") {
    return (
      <Card title="Run failed">
        <pre className="text-sm text-rose-300 whitespace-pre-wrap">{live.error}</pre>
      </Card>
    );
  }
  if (live.status === "cancelled") return <Card>Cancelled.</Card>;
  if (live.decision) {
    return (
      <Card title={`Final decision${live.rating ? ` — ${live.rating}` : ""}`}>
        <Markdown>{live.decision}</Markdown>
      </Card>
    );
  }
  return (
    <Card>
      <p className="text-sm text-slate-400">
        Run in progress. Switch tabs to watch analyst reports and debates fill in as they happen.
      </p>
    </Card>
  );
}

function Analysts() {
  const reports = useLive((s) => s.reports);
  const items: { key: keyof typeof reports; title: string }[] = [
    { key: "market_report",       title: "Market" },
    { key: "sentiment_report",    title: "Sentiment" },
    { key: "news_report",         title: "News" },
    { key: "fundamentals_report", title: "Fundamentals" },
  ];
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {items.map((it) => (
        <Card key={it.key} title={it.title}>
          <Markdown>{reports[it.key]}</Markdown>
        </Card>
      ))}
    </div>
  );
}

function Debates() {
  const invest = useLive((s) => s.investment);
  const risk = useLive((s) => s.risk);
  return (
    <div className="space-y-6">
      <section>
        <h3 className="text-sm font-medium text-slate-300 mb-2">Investment debate (Bull vs Bear)</h3>
        {invest.length === 0
          ? <Card><p className="text-sm text-slate-500 italic">Not started yet.</p></Card>
          : invest.map((t, i) => (
              <Card key={i} className="mb-2" title={<span className="text-slate-100">{t.speaker}</span>}>
                <Markdown>{t.markdown}</Markdown>
              </Card>
            ))}
      </section>
      <section>
        <h3 className="text-sm font-medium text-slate-300 mb-2">Risk debate (Aggressive / Neutral / Conservative)</h3>
        {risk.length === 0
          ? <Card><p className="text-sm text-slate-500 italic">Not started yet.</p></Card>
          : risk.map((t, i) => (
              <Card key={i} className="mb-2" title={<span className="text-slate-100">{t.speaker}</span>}>
                <Markdown>{t.markdown}</Markdown>
              </Card>
            ))}
      </section>
    </div>
  );
}

function Decision() {
  const reports = useLive((s) => s.reports);
  return (
    <div className="space-y-4">
      <Card title="Trader investment plan">
        <Markdown>{reports.trader_investment_plan}</Markdown>
      </Card>
      <Card title="Investment plan (Research Manager)">
        <Markdown>{reports.investment_plan}</Markdown>
      </Card>
      <Card title="Final trade decision (Portfolio Manager)">
        <Markdown>{reports.final_trade_decision}</Markdown>
      </Card>
    </div>
  );
}

function Logs() {
  const logs = useLive((s) => s.logs);
  if (logs.length === 0) return <Card><p className="text-sm text-slate-500">No log entries yet.</p></Card>;
  return (
    <Card>
      <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap leading-relaxed">
        {logs.map((l) => `[${new Date(l.ts * 1000).toLocaleTimeString()}] ${l.level.toUpperCase()}  ${l.text}`).join("\n")}
      </pre>
    </Card>
  );
}
