import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { Card, Input, Select, StatusBadge } from "../components/ui";

export function HistoryList() {
  const [ticker, setTicker] = useState("");
  const [status, setStatus] = useState("");
  const runs = useQuery({
    queryKey: ["runs", ticker, status],
    queryFn: () => api.listRuns({ ticker: ticker || undefined, status: status || undefined }),
    refetchInterval: 5000,
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">History</h1>

      <Card>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Ticker</label>
            <Input value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())} placeholder="e.g. NVDA" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Status</label>
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Any</option>
              <option value="running">running</option>
              <option value="completed">completed</option>
              <option value="failed">failed</option>
              <option value="cancelled">cancelled</option>
            </Select>
          </div>
        </div>
      </Card>

      <Card>
        {runs.isLoading && <p className="text-sm text-slate-400">Loading…</p>}
        {runs.data && runs.data.length === 0 && (
          <p className="text-sm text-slate-500 italic">No runs match the filter.</p>
        )}
        <div className="divide-y divide-slate-800">
          {runs.data?.map((r) => (
            <Link
              key={r.id}
              to={r.status === "running" ? `/runs/${r.id}` : `/history/${r.id}`}
              className="block py-3 hover:bg-slate-800/50 -mx-4 px-4 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="font-medium text-slate-100">{r.ticker}</span>
                  <span className="text-sm text-slate-400">{r.trade_date}</span>
                  <StatusBadge status={r.status} />
                  {r.rating && <span className="text-xs text-blue-300">{r.rating}</span>}
                </div>
                <span className="text-xs text-slate-500">{new Date(r.started_at).toLocaleString()}</span>
              </div>
              {r.decision_preview && (
                <p className="mt-1 text-sm text-slate-300 line-clamp-2">{r.decision_preview}</p>
              )}
            </Link>
          ))}
        </div>
      </Card>
    </div>
  );
}
