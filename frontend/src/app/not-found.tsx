import Link from "next/link";

import { buttonStyles } from "@/components/ui/button";
import { LogoMark } from "@/components/ui/logo";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-[#f8f8f7] px-6 text-center">
      <LogoMark className="size-11" />
      <p className="mt-8 text-[11px] font-medium tracking-[0.14em] text-ink-400 uppercase">
        404
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-[-0.025em] text-ink-950">
        Page not found
      </h1>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-ink-500">
        The page you are looking for may have moved or no longer exists.
      </p>
      <Link
        href="/dashboard"
        className={buttonStyles({ className: "mt-6" })}
      >
        Back to overview
      </Link>
    </main>
  );
}
