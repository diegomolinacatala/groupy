import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  accent?: string;
}

export function StatCard({ icon: Icon, label, value, accent }: StatCardProps) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 shadow-card">
      <span
        className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
        style={{
          backgroundColor: accent ? `${accent}1a` : "var(--color-surface-2)",
          color: accent ?? "var(--color-muted)",
        }}
      >
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <div className="text-xl font-semibold leading-none text-ink">
          {value}
        </div>
        <div className="mt-1 truncate text-xs text-muted">{label}</div>
      </div>
    </div>
  );
}
