import type { ReactNode } from "react";

import type { Tone } from "@/lib/labels";
import { cn } from "@/lib/utils";

const TONES: Record<Tone, string> = {
  neutral: "border-ink-200 bg-white text-ink-600",
  info: "border-ink-200 bg-ink-50 text-ink-600",
  success: "border-emerald-200/80 bg-emerald-50/70 text-emerald-700",
  warning: "border-amber-200/80 bg-amber-50/70 text-amber-700",
  danger: "border-rose-200/80 bg-rose-50/70 text-rose-700",
};

const DOTS: Record<Tone, string> = {
  neutral: "bg-ink-400",
  info: "bg-ink-400",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  danger: "bg-rose-500",
};

export function Badge({
  tone = "neutral",
  children,
  dot = false,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5  border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
        TONES[tone],
        className,
      )}
    >
      {dot ? <span className={cn("size-1.5 ", DOTS[tone])} /> : null}
      {children}
    </span>
  );
}
