import { useEffect } from "react";
import { wsUrl } from "./client";
import { useLive } from "../store/live";
import type { StreamEvent } from "./types";

/** Open a WS for `runId` and pipe events into the live store. */
export function useRunWs(runId: string | null) {
  const apply = useLive((s) => s.apply);
  const reset = useLive((s) => s.reset);

  useEffect(() => {
    if (!runId) return;
    reset(runId);

    const ws = new WebSocket(wsUrl(runId));
    ws.onmessage = (m) => {
      try {
        const ev = JSON.parse(m.data) as StreamEvent;
        apply(ev);
      } catch (e) {
        console.warn("bad ws frame", e);
      }
    };
    ws.onerror = (e) => console.warn("ws error", e);
    return () => {
      ws.close();
    };
  }, [runId, apply, reset]);
}
