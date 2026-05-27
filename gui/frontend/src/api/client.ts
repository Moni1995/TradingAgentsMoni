import type {
  ConfigDefaults, ProviderInfo, RunDetail, RunRequest, RunRow,
} from "./types";

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  if (!res.ok) {
    let body: unknown = null;
    try { body = await res.json(); } catch { body = await res.text(); }
    throw new ApiError(res.status, body);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export class ApiError extends Error {
  constructor(public status: number, public body: unknown) {
    super(`HTTP ${status}: ${typeof body === "string" ? body : JSON.stringify(body)}`);
  }
}

export const api = {
  providers: () => http<ProviderInfo[]>("/api/providers"),
  defaults:  () => http<ConfigDefaults>("/api/config/defaults"),

  startRun: (req: RunRequest) =>
    http<{ run_id: string }>("/api/runs", { method: "POST", body: JSON.stringify(req) }),
  cancelRun: (id: string) =>
    http<{ ok: boolean }>(`/api/runs/${id}/cancel`, { method: "POST" }),
  activeRun: () => http<{ run_id: string } | undefined>("/api/runs/active"),

  listRuns: (q: { ticker?: string; status?: string } = {}) => {
    const params = new URLSearchParams();
    if (q.ticker) params.set("ticker", q.ticker);
    if (q.status) params.set("status", q.status);
    return http<RunRow[]>(`/api/runs?${params.toString()}`);
  },
  getRun: (id: string) => http<RunDetail>(`/api/runs/${id}`),
};

// Build a WS URL that works whether served by FastAPI (prod) or by Vite (dev).
export function wsUrl(runId: string): string {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}/ws/runs/${runId}`;
}
