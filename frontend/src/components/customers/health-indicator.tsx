import { cn } from "@/lib/utils";

export function HealthIndicator({
  score,
  compact = false,
}: {
  score: number | null;
  compact?: boolean;
}) {
  if (score === null || score === undefined) {
    return <span className="text-xs text-ink-400">Not scored</span>;
  }
  const tone =
    score >= 70
      ? { text: "text-emerald-700", bar: "bg-emerald-500", track: "bg-emerald-100" }
      : score >= 40
        ? { text: "text-amber-700", bar: "bg-amber-500", track: "bg-amber-100" }
        : { text: "text-rose-700", bar: "bg-rose-500", track: "bg-rose-100" };

  return (
    <div className={cn("flex items-center gap-2", compact ? "min-w-16" : "min-w-28")}>
      <div className={cn("h-1.5 flex-1 overflow-hidden ", tone.track)}>
        <div className={cn("h-full ", tone.bar)} style={{ width: `${score}%` }} />
      </div>
      <span className={cn("text-xs font-semibold tabular-nums", tone.text)}>
        {score}
      </span>
    </div>
  );
}
