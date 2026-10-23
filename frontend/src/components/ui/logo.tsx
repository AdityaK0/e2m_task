import Link from "next/link";

import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "relative inline-flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 via-brand-600 to-brand-800 shadow-lg shadow-brand-900/25",
        className,
      )}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" className="size-5 text-white" fill="none">
        <path
          d="M12 2.5 14.4 9.6 21.5 12l-7.1 2.4L12 21.5l-2.4-7.1L2.5 12l7.1-2.4L12 2.5Z"
          fill="currentColor"
          fillOpacity="0.95"
        />
        <circle cx="12" cy="12" r="2.1" fill="#312e81" />
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
    <Link href={href} className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      {!compact ? (
        <span className="leading-none">
          <span className="block text-[15px] font-semibold tracking-tight text-ink-900">
            Northstar
          </span>
          <span className="mt-1 block text-[10px] font-medium tracking-[0.18em] text-ink-400 uppercase">
            Customer Success
          </span>
        </span>
      ) : null}
    </Link>
  );
}
