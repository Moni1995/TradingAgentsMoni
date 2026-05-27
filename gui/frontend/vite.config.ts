import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev proxies /api and /ws to the FastAPI server. In prod the frontend is
// built and served as static files by FastAPI itself (gui/frontend/dist),
// so the proxy is dev-only.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://127.0.0.1:8000", changeOrigin: true },
      "/ws":  { target: "ws://127.0.0.1:8000", ws: true },
    },
  },
});
