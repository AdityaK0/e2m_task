import Link from "next/link";

import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "relative inline-flex size-9 shrink-0 items-center justify-center bg-ink-950 text-white",
        className,
      )}
      aria-hidden="true"
    >
      <svg viewBox="0 0 32 32" className="size-[72%]" fill="none">
        <rect x="7" y="8" width="14" height="3" rx="1" fill="currentColor" />
        <rect x="7" y="14.5" width="9" height="3" rx="1" fill="currentColor" />
        <rect x="7" y="21" width="14" height="3" rx="1" fill="currentColor" />
        <rect x="22.5" y="8" width="3" height="3" rx="0.75" fill="#6b9fff" />
      </svg>
    </span>
  );
}

export function Logo({
  href = "/dashboard",
  compact = false,
  className,
}: {
  href?: string;
  compact?: boolean;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn("inline-flex items-center gap-2.5", className)}
      aria-label="E2M Insights"
    >
      <LogoMark />
      {!compact ? (
        <span className="text-[15px] leading-none font-semibold tracking-[-0.02em] text-ink-950">
          E2M <span className="font-medium text-ink-500">Insights</span>
        </span>
      ) : null}
    </Link>
  );
}
