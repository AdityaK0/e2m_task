import { cn } from "@/lib/utils";

export function HealthIndicator({
  score,
  sampleSize,
  window,
  compact = false,
}: {
  score: number | null;
  sampleSize: number;
  window: number;
  compact?: boolean;
}) {
  const details = (
    <span className="text-[10px] text-ink-400">
      Based on {sampleSize} of last {window} AI insights
    </span>
  );
  if (score === null || score === undefined) {
    return (
      <div className="flex flex-col gap-0.5">
        <span className="text-xs text-ink-400">No data yet</span>
        {details}
      </div>
    );
  }
  const tone =
    score >= 70
      ? { text: "text-emerald-700", bar: "bg-emerald-500", track: "bg-emerald-100" }
      : score >= 40
        ? { text: "text-amber-700", bar: "bg-amber-500", track: "bg-amber-100" }
        : { text: "text-rose-700", bar: "bg-rose-500", track: "bg-rose-100" };

  return (
    <div className="flex flex-col gap-1">
      <div className={cn("flex items-center gap-2", compact ? "min-w-20" : "min-w-28")}>
        <div className={cn("h-1.5 flex-1 overflow-hidden ", tone.track)}>
          <div className={cn("h-full ", tone.bar)} style={{ width: `${score}%` }} />
        </div>
        <span className={cn("text-xs font-semibold tabular-nums", tone.text)}>
          {score}
        </span>
      </div>
      {details}
    </div>
  );
}
