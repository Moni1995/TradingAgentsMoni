import { Routes, Route, Navigate } from "react-router-dom";
import { Layout } from "./components/Layout";
import { NewRun } from "./pages/NewRun";
import { LiveRun } from "./pages/LiveRun";
import { HistoryList } from "./pages/HistoryList";
import { RunDetail } from "./pages/RunDetail";
import { Settings } from "./pages/Settings";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<NewRun />} />
        <Route path="runs/:id" element={<LiveRun />} />
        <Route path="history" element={<HistoryList />} />
        <Route path="history/:id" element={<RunDetail />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
