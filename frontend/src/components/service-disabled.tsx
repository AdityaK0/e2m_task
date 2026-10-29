import { LogoMark } from "@/components/ui/logo";

export function ServiceDisabled() {
  return (
    <main className="relative flex min-h-dvh flex-col overflow-hidden bg-[#f8f8f7]">
      <div
        className="pointer-events-none absolute -top-48 left-1/2 h-[34rem] w-[34rem] -translate-x-1/2 rounded-full bg-white/80 blur-3xl"
        aria-hidden="true"
      />

      <header className="relative z-10 flex items-center justify-between px-5 py-5 sm:px-8">
        <div className="flex items-center gap-3">
          <LogoMark className="size-9" />
          <div>
            <p className="text-sm font-semibold tracking-[-0.02em] text-ink-950">
              E2M <span className="font-medium text-ink-500">Insights</span>
            </p>
            <p className="text-[10px] tracking-wide text-ink-400">
              Customer Success &amp; AI Insights
            </p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 bg-white px-2.5 py-1 text-[10px] font-medium text-ink-500 shadow-sm">
          <span className="size-1.5 rounded-full bg-ink-400" aria-hidden="true" />
          Live environment offline
        </span>
      </header>

      <section className="relative z-10 flex flex-1 items-center justify-center px-5 py-12 sm:px-8">
        <div className="w-full max-w-xl">
          <p className="text-[11px] font-semibold tracking-[0.16em] text-ink-400 uppercase">
            Project status
          </p>
          <h1 className="mt-4 text-3xl leading-tight font-semibold tracking-[-0.035em] text-ink-950 sm:text-4xl">
            Project completed and reviewed.
          </h1>
          <p className="mt-5 max-w-lg text-sm leading-7 text-ink-500">
            This project was completed as part of the E2M assessment and has
            now been reviewed by the E2M team.
          </p>
          <p className="mt-3 max-w-lg text-sm leading-7 text-ink-500">
            The live environment has been taken offline to avoid unnecessary
            hosting costs. No API requests are being made.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-ink-200/80 pt-5 text-xs text-ink-400">
            <span>E2M Insights</span>
            <span aria-hidden="true">/</span>
            <span>Source and documentation remain available in the repository.</span>
          </div>
        </div>
      </section>
    </main>
  );
}
