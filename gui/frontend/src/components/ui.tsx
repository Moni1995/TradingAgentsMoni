import { ReactNode } from "react";

export function Card({ title, children, className = "" }: { title?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-slate-800 bg-slate-900/60 ${className}`}>
      {title && <div className="border-b border-slate-800 px-4 py-2 text-sm font-medium text-slate-300">{title}</div>}
      <div className="p-4">{children}</div>
    </div>
  );
}

export function Button({
  children, variant = "primary", className = "", ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" }) {
  const styles = {
    primary: "bg-emerald-600 hover:bg-emerald-500 text-white",
    ghost:   "bg-slate-800 hover:bg-slate-700 text-slate-100",
    danger:  "bg-rose-600 hover:bg-rose-500 text-white",
  }[variant];
  return (
    <button
      {...rest}
      className={`rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <label className="block text-sm font-medium text-slate-300 mb-1">{children}</label>;
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none ${props.className || ""}`}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none ${props.className || ""}`}
    />
  );
}

export function Badge({ children, color = "slate" }: { children: ReactNode; color?: "slate" | "emerald" | "amber" | "rose" | "blue" }) {
  const c = {
    slate:   "bg-slate-800 text-slate-300",
    emerald: "bg-emerald-900/50 text-emerald-300",
    amber:   "bg-amber-900/50 text-amber-300",
    rose:    "bg-rose-900/50 text-rose-300",
    blue:    "bg-blue-900/50 text-blue-300",
  }[color];
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${c}`}>{children}</span>;
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, "emerald" | "amber" | "rose" | "slate" | "blue"> = {
    completed: "emerald", running: "blue", failed: "rose", cancelled: "amber",
  };
  return <Badge color={map[status] || "slate"}>{status}</Badge>;
}
