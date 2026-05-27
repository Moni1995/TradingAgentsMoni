import { create } from "zustand";
import type { ReportField, RunStatus, StreamEvent } from "../api/types";

interface DebateTurn { ts: number; speaker: string; markdown: string }

interface LiveState {
  runId: string | null;
  status: RunStatus | "idle";
  startedAt: number | null;
  ticker: string | null;
  date: string | null;

  reports: Partial<Record<ReportField, string>>;
  investment: DebateTurn[];
  risk: DebateTurn[];
  logs: { ts: number; level: string; text: string }[];

  decision: string | null;
  rating: string | null;
  error: string | null;

  reset: (runId: string) => void;
  apply: (ev: StreamEvent) => void;
}

export const useLive = create<LiveState>((set) => ({
  runId: null,
  status: "idle",
  startedAt: null,
  ticker: null,
  date: null,
  reports: {},
  investment: [],
  risk: [],
  logs: [],
  decision: null,
  rating: null,
  error: null,

  reset: (runId) =>
    set({
      runId,
      status: "running",
      startedAt: Date.now(),
      ticker: null, date: null,
      reports: {}, investment: [], risk: [], logs: [],
      decision: null, rating: null, error: null,
    }),

  apply: (ev) => set((s) => {
    switch (ev.t) {
      case "run_started":
        return { ticker: ev.ticker, date: ev.date, status: "running" };
      case "report_updated":
        return { reports: { ...s.reports, [ev.field]: ev.markdown } };
      case "debate_turn":
        return ev.debate === "investment"
          ? { investment: [...s.investment, { ts: ev.ts, speaker: ev.speaker, markdown: ev.markdown }] }
          : { risk:       [...s.risk,       { ts: ev.ts, speaker: ev.speaker, markdown: ev.markdown }] };
      case "log":
        return { logs: [...s.logs, { ts: ev.ts, level: ev.level, text: ev.text }] };
      case "message":
        return { logs: [...s.logs, { ts: ev.ts, level: "info", text: `[${ev.role}] ${ev.text}` }] };
      case "run_finished":
        return { status: "completed", decision: ev.decision, rating: ev.rating };
      case "run_failed":
        return { status: "failed", error: ev.error };
      case "run_cancelled":
        return { status: "cancelled" };
    }
  }),
}));
