import { cn } from "@/lib/utils/cn";

interface StatCardProps {
  label: string;
  value: string | number;
  detail?: string;
  tone?: "default" | "danger";
}

/** Editorial stat: overline label over a large serif figure. */
export function StatCard({ label, value, detail, tone = "default" }: StatCardProps) {
  return (
    <div className="px-5 py-4">
      <p className="type-overline mb-2">{label}</p>
      <div
        className={cn(
          "type-display text-3xl leading-none md:text-4xl",
          tone === "danger" ? "text-danger" : "text-ink",
        )}
      >
        {value}
      </div>
      {detail && <p className="mt-1.5 text-xs text-muted">{detail}</p>}
    </div>
  );
}
