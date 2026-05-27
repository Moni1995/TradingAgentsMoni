import { ReactNode, useState } from "react";

interface TabsProps { tabs: { key: string; label: ReactNode; content: ReactNode }[]; initial?: string }

export function Tabs({ tabs, initial }: TabsProps) {
  const [active, setActive] = useState(initial ?? tabs[0]?.key);
  return (
    <div>
      <div className="flex gap-1 border-b border-slate-800 mb-4">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActive(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              active === t.key
                ? "border-emerald-500 text-emerald-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div>{tabs.find((t) => t.key === active)?.content}</div>
    </div>
  );
}
