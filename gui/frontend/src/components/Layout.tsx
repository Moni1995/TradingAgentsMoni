import { NavLink, Outlet } from "react-router-dom";

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `px-3 py-2 text-sm font-medium rounded-md transition-colors ${
    isActive ? "bg-slate-800 text-emerald-400" : "text-slate-300 hover:text-slate-100 hover:bg-slate-800/60"
  }`;

export function Layout() {
  return (
    <div className="flex flex-col h-full">
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-10">
        <div className="mx-auto max-w-6xl px-4 py-2 flex items-center gap-6">
          <div className="text-lg font-semibold text-emerald-400">TradingAgents</div>
          <nav className="flex gap-1">
            <NavLink to="/" end className={linkClass}>New Run</NavLink>
            <NavLink to="/history" className={linkClass}>History</NavLink>
            <NavLink to="/settings" className={linkClass}>Settings</NavLink>
          </nav>
        </div>
      </header>
      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-6xl px-4 py-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
