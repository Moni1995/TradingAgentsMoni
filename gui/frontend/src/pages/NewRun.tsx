import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api, ApiError } from "../api/client";
import type { AnalystKey, RunRequest } from "../api/types";
import { Badge, Button, Card, Input, Label, Select } from "../components/ui";

const ALL_ANALYSTS: { key: AnalystKey; label: string }[] = [
  { key: "market", label: "Market" },
  { key: "social", label: "Sentiment (Social)" },
  { key: "news", label: "News" },
  { key: "fundamentals", label: "Fundamentals" },
];

function today() { return new Date().toISOString().slice(0, 10); }

export function NewRun() {
  const nav = useNavigate();
  const providers = useQuery({ queryKey: ["providers"], queryFn: api.providers });
  const defaults = useQuery({ queryKey: ["defaults"], queryFn: api.defaults });
  const active = useQuery({ queryKey: ["active"], queryFn: api.activeRun, refetchInterval: 3000 });

  const [ticker, setTicker] = useState("NVDA");
  const [tradeDate, setTradeDate] = useState(today());
  const [assetType, setAssetType] = useState<"stock" | "crypto">("stock");
  const [analysts, setAnalysts] = useState<Set<AnalystKey>>(
    new Set(["market", "social", "news", "fundamentals"]),
  );
  const [provider, setProvider] = useState<string>("openai");
  const [deepModel, setDeepModel] = useState<string>("");
  const [quickModel, setQuickModel] = useState<string>("");
  const [debateRounds, setDebateRounds] = useState(1);
  const [riskRounds, setRiskRounds] = useState(1);
  const [checkpoint, setCheckpoint] = useState(false);

  // When defaults / providers load, seed the form once.
  useEffect(() => {
    if (defaults.data && !deepModel) {
      setProvider(defaults.data.llm_provider);
      setDeepModel(defaults.data.deep_think_llm);
      setQuickModel(defaults.data.quick_think_llm);
      setDebateRounds(defaults.data.max_debate_rounds);
      setRiskRounds(defaults.data.max_risk_discuss_rounds);
      setCheckpoint(defaults.data.checkpoint_enabled);
    }
  }, [defaults.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const currentProvider = useMemo(
    () => providers.data?.find((p) => p.key === provider),
    [providers.data, provider],
  );

  // Reset model selections when provider changes (don't carry openai models into anthropic).
  useEffect(() => {
    if (!currentProvider) return;
    const deepOk = currentProvider.deep_models.some((m) => m.value === deepModel);
    const quickOk = currentProvider.quick_models.some((m) => m.value === quickModel);
    if (!deepOk) setDeepModel(currentProvider.deep_models[0]?.value || "");
    if (!quickOk) setQuickModel(currentProvider.quick_models[0]?.value || "");
  }, [provider]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = useMutation({
    mutationFn: (req: RunRequest) => api.startRun(req),
    onSuccess: ({ run_id }) => nav(`/runs/${run_id}`),
  });

  if (active.data?.run_id) {
    return (
      <Card title="A run is already in progress">
        <p className="text-sm text-slate-300 mb-3">
          One run at a time. Open the live view to watch it, then come back to start another.
        </p>
        <Link to={`/runs/${active.data.run_id}`}>
          <Button>View live run</Button>
        </Link>
      </Card>
    );
  }

  const keyMissing = currentProvider && !currentProvider.key_present;

  function toggleAnalyst(key: AnalystKey) {
    setAnalysts((s) => {
      const out = new Set(s);
      if (out.has(key)) out.delete(key); else out.add(key);
      return out;
    });
  }

  function submit() {
    start.mutate({
      ticker: ticker.trim().toUpperCase(),
      trade_date: tradeDate,
      asset_type: assetType,
      selected_analysts: [...analysts],
      llm_provider: provider,
      deep_think_llm: deepModel,
      quick_think_llm: quickModel,
      max_debate_rounds: debateRounds,
      max_risk_discuss_rounds: riskRounds,
      checkpoint_enabled: checkpoint,
      output_language: defaults.data?.output_language || "English",
    });
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-slate-100">New analysis</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card title="Target">
          <div className="space-y-3">
            <div>
              <Label>Ticker</Label>
              <Input value={ticker} onChange={(e) => setTicker(e.target.value)} placeholder="NVDA" />
            </div>
            <div>
              <Label>Analysis date</Label>
              <Input type="date" value={tradeDate} onChange={(e) => setTradeDate(e.target.value)} />
            </div>
            <div>
              <Label>Asset type</Label>
              <Select value={assetType} onChange={(e) => setAssetType(e.target.value as "stock" | "crypto")}>
                <option value="stock">Stock</option>
                <option value="crypto">Crypto</option>
              </Select>
            </div>
          </div>
        </Card>

        <Card title="Analysts">
          <div className="space-y-2">
            {ALL_ANALYSTS.map((a) => (
              <label key={a.key} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={analysts.has(a.key)}
                  onChange={() => toggleAnalyst(a.key)}
                  className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-emerald-500 focus:ring-emerald-500"
                />
                <span className="text-sm">{a.label}</span>
              </label>
            ))}
            <p className="text-xs text-slate-500 mt-2">At least one analyst is required.</p>
          </div>
        </Card>
      </div>

      <Card title="LLM">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <Label>Provider</Label>
            <Select value={provider} onChange={(e) => setProvider(e.target.value)}>
              {providers.data?.map((p) => (
                <option key={p.key} value={p.key} disabled={!p.key_present}>
                  {p.label}{p.key_present ? "" : " (no API key)"}
                </option>
              ))}
            </Select>
            {keyMissing && currentProvider?.env_var && (
              <p className="text-xs text-rose-400 mt-1">
                Set <code>{currentProvider.env_var}</code> in .env and restart.
              </p>
            )}
          </div>
          <div>
            <Label>Deep model</Label>
            <Select value={deepModel} onChange={(e) => setDeepModel(e.target.value)}>
              {currentProvider?.deep_models.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Quick model</Label>
            <Select value={quickModel} onChange={(e) => setQuickModel(e.target.value)}>
              {currentProvider?.quick_models.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </Select>
          </div>
        </div>
      </Card>

      <Card title="Debate / checkpoint">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <div>
            <Label>Investment debate rounds</Label>
            <Input type="number" min={1} max={5} value={debateRounds}
                   onChange={(e) => setDebateRounds(parseInt(e.target.value) || 1)} />
          </div>
          <div>
            <Label>Risk debate rounds</Label>
            <Input type="number" min={1} max={5} value={riskRounds}
                   onChange={(e) => setRiskRounds(parseInt(e.target.value) || 1)} />
          </div>
          <label className="flex items-center gap-2 cursor-pointer pb-2">
            <input type="checkbox" checked={checkpoint} onChange={(e) => setCheckpoint(e.target.checked)}
                   className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-emerald-500 focus:ring-emerald-500" />
            <span className="text-sm">Enable checkpoint resume</span>
          </label>
        </div>
      </Card>

      {start.isError && (
        <Card>
          <Badge color="rose">Start failed</Badge>
          <p className="text-sm text-rose-300 mt-2">
            {start.error instanceof ApiError ? JSON.stringify(start.error.body) : String(start.error)}
          </p>
        </Card>
      )}

      <div className="flex justify-end">
        <Button
          onClick={submit}
          disabled={
            start.isPending || analysts.size === 0 || !ticker || !deepModel || !quickModel || !!keyMissing
          }
        >
          {start.isPending ? "Starting…" : "Start analysis"}
        </Button>
      </div>
    </div>
  );
}
