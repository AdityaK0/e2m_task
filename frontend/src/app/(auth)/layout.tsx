import { ArrowUpRight, CheckCircle2, Sparkles } from "lucide-react";
import type { ReactNode } from "react";

import { Logo } from "@/components/ui/logo";

const HIGHLIGHTS = [
  "Meeting notes transformed into structured actions",
  "Account health and risk signals in one view",
  "Role-based access that fits your team",
];

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[minmax(0,46%)_minmax(0,1fr)]">
      <section className="relative hidden overflow-hidden bg-ink-950 bg-[radial-gradient(circle_at_15%_10%,rgba(99,102,241,0.30),transparent_42%),radial-gradient(circle_at_90%_90%,rgba(20,184,166,0.18),transparent_45%)] p-10 lg:flex lg:flex-col lg:justify-between xl:p-14">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,.7) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.7) 1px, transparent 1px)",
            backgroundSize: "42px 42px",
          }}
        />
        <div className="relative">
          <Logo href="/login" className="[&_span.text-ink-900]:text-white [&_span.text-ink-400]:text-white/40" />
        </div>

        <div className="relative max-w-md">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-[11px] font-medium text-brand-200">
            <Sparkles className="size-3.5" />
            Built for modern success teams
          </div>
          <h2 className="text-4xl leading-[1.1] font-semibold tracking-tight text-white xl:text-[44px]">
            Every customer
            <br />
            conversation,
            <br />
            <span className="bg-gradient-to-r from-brand-300 to-mint-500 bg-clip-text text-transparent">
              turned into action.
            </span>
          </h2>
          <p className="mt-5 text-sm leading-relaxed text-white/50">
            Northstar turns raw meeting notes into summaries, sentiment, action items,
            and account risks — so nothing important gets lost.
          </p>

          <ul className="mt-8 space-y-3">
            {HIGHLIGHTS.map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-[13px] text-white/65">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-mint-500" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative flex items-center justify-between text-[11px] text-white/30">
          <span>© {new Date().getFullYear()} Northstar CS</span>
          <span className="inline-flex items-center gap-1">
            Private workspace <ArrowUpRight className="size-3" />
          </span>
        </div>
      </section>

      <section className="flex min-h-screen flex-col">
        <div className="flex items-center justify-between px-6 py-5 lg:hidden">
          <Logo href="/login" />
          <span className="text-[11px] text-ink-400">Customer Success</span>
        </div>
        <div className="flex flex-1 items-center justify-center px-5 py-8 sm:px-8">
          <div className="w-full max-w-[420px] animate-slide-up">{children}</div>
        </div>
        <div className="px-6 py-5 text-center text-[11px] text-ink-400 lg:hidden">
          Northstar CS · AI-powered customer success
        </div>
      </section>
    </div>
  );
}
