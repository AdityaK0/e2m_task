import { ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";

import { Logo } from "@/components/ui/logo";

const HIGHLIGHTS = [
  "A live view of account health, ownership, and risk.",
  "Meeting notes turned into summaries, actions, and follow-ups.",
  "Role-based access for administrators and managers.",
];

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-white lg:grid lg:grid-cols-[minmax(0,45%)_minmax(0,1fr)]">
      <section className="relative hidden overflow-hidden border-r border-ink-200/80 bg-[#f5f5f2] p-10 lg:flex lg:flex-col lg:justify-between xl:p-14">
        <p
          className="pointer-events-none absolute -right-14 bottom-16 text-[19rem] leading-none font-semibold tracking-[-0.09em] text-ink-950/[0.035] select-none"
          aria-hidden="true"
        >
          E2M
        </p>

        <div className="relative">
          <Logo href="/login" />
        </div>

        <div className="relative max-w-[29rem] py-12">
          <div className="mb-6 flex items-center gap-3">
            <span className="h-px w-8 bg-brand-500" />
            <span className="text-[11px] font-semibold tracking-[0.16em] text-brand-700 uppercase">
              Customer Success &amp; AI Insights
            </span>
          </div>
          <h2 className="text-[40px] leading-[1.08] font-semibold tracking-[-0.035em] text-ink-950">
            Client context,
            <br />
            without the noise.
          </h2>
          <p className="mt-5 max-w-md text-[15px] leading-7 text-ink-600">
            E2M Client Insights brings customer accounts, meetings, AI analysis,
            risks, and follow-up actions into one calm, focused workspace.
          </p>

          <ul className="mt-9 space-y-4">
            {HIGHLIGHTS.map((item) => (
              <li key={item} className="flex items-start gap-3 text-[13px] leading-6 text-ink-600">
                <span className="mt-[0.45rem] size-1.5 shrink-0 bg-brand-500" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative flex items-center justify-between border-t border-ink-200/80 pt-5 text-[11px] text-ink-500">
          <span>© {new Date().getFullYear()} E2M Client Insights</span>
          <span className="inline-flex items-center gap-1">
            Private workspace <ArrowUpRight className="size-3" />
          </span>
        </div>
      </section>

      <section className="flex min-h-screen flex-col bg-white">
        <div className="flex items-center justify-between border-b border-ink-100 px-6 py-4 lg:hidden">
          <Logo href="/login" />
          <span className="text-[10px] font-medium tracking-[0.12em] text-ink-500 uppercase">
            Client Insights
          </span>
        </div>
        <div className="flex flex-1 items-center justify-center px-5 py-10 sm:px-8">
          <div className="w-full max-w-[400px] animate-slide-up">{children}</div>
        </div>
        <div className="px-6 py-5 text-center text-[11px] text-ink-400 lg:hidden">
          Customer Success &amp; AI Insights
        </div>
      </section>
    </div>
  );
}
