import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { Badge, Card } from "../components/ui";

export function Settings() {
  const providers = useQuery({ queryKey: ["providers"], queryFn: api.providers });
  const defaults = useQuery({ queryKey: ["defaults"], queryFn: api.defaults });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <Card title="API keys (read-only — set in .env)">
        <div className="space-y-2">
          {providers.data?.map((p) => (
            <div key={p.key} className="flex items-center justify-between border-b border-slate-800 pb-2 last:border-0">
              <div>
                <div className="text-sm font-medium">{p.label}</div>
                <div className="text-xs text-slate-500">{p.env_var || "no key required"}</div>
              </div>
              {p.env_var === null ? (
                <Badge color="slate">no auth</Badge>
              ) : p.key_present ? (
                <Badge color="emerald">detected</Badge>
              ) : (
                <Badge color="rose">missing</Badge>
              )}
            </div>
          ))}
        </div>
      </Card>

      <Card title="Defaults (from DEFAULT_CONFIG)">
        <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap">
          {defaults.data && JSON.stringify(defaults.data, null, 2)}
        </pre>
        <p className="text-xs text-slate-500 mt-2">
          These come from <code>tradingagents/default_config.py</code> with TRADINGAGENTS_* env-var overrides applied.
        </p>
      </Card>
    </div>
  );
}
