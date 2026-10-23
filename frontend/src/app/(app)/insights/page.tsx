"use client";

import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  CheckSquare,
  Lightbulb,
  RotateCw,
  Search,
  ShieldAlert,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Alert } from "@/components/ui/alert";
import { buttonStyles } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { InsightStatusBadge, SentimentBadge } from "@/components/ui/status-badges";
import { insightsApi } from "@/lib/api/insights";
import { interactionsApi } from "@/lib/api/interactions";
import type {
  InsightConfig,
  Interaction,
  MeetingInsight,
} from "@/lib/api/types";
import { formatDateTime, formatRelative } from "@/lib/utils";

type Filter = "all" | "review" | "ready" | "awaiting";

interface InsightRow {
  interaction: Interaction;
  insight: MeetingInsight | null;
}

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: "all", label: "All" },
  { value: "review", label: "Needs review" },
  { value: "ready", label: "Ready" },
  { value: "awaiting", label: "Awaiting analysis" },
];

function rowBucket(row: InsightRow): Exclude<Filter, "all"> {
  if (!row.insight) return "awaiting";
  if (row.insight.status === "failed" || row.insight.status === "stale") {
    return "review";
  }
  if (row.insight.status === "completed") return "ready";
  return "awaiting";
}

function priority(row: InsightRow): number {
  const bucket = rowBucket(row);
  if (bucket === "review") return 0;
  if (bucket === "awaiting") return 1;
  return 2;
}

function InsightCard({ row }: { row: InsightRow }) {
  const { interaction, insight } = row;
  const failed = insight?.status === "failed";

  return (
    <Card className="flex h-full flex-col  ">
      <div className="flex-1 px-5 py-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {insight ? <InsightStatusBadge status={insight.status} /> : (
              <span className="inline-flex items-center  border border-ink-200 bg-white px-2 py-0.5 text-[11px] font-medium text-ink-500">
                Not analyzed
              </span>
            )}
            {insight?.sentiment ? (
              <SentimentBadge sentiment={insight.sentiment} />
            ) : null}
          </div>
          <span
            className="text-[11px] text-ink-400"
            title={formatDateTime(insight?.generated_at ?? interaction.occurred_at)}
          >
            {formatRelative(insight?.generated_at ?? interaction.occurred_at)}
          </span>
        </div>

        <Link
          href={`/interactions/${interaction.id}`}
          className="mt-4 block text-[15px] font-semibold tracking-[-0.01em] text-ink-950 transition-colors hover:text-brand-700"
        >
          {interaction.title}
        </Link>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-500">
          <span>{interaction.customer.name}</span>
          <span className="size-0.5  bg-ink-300" aria-hidden="true" />
          <span>{formatRelative(interaction.occurred_at)}</span>
        </p>

        {failed ? (
          <p className="mt-4  border border-rose-200 bg-rose-50/70 px-3 py-2.5 text-xs leading-5 text-rose-700">
            {insight?.error_message ||
              "Analysis failed. Open the meeting to retry generation."}
          </p>
        ) : insight?.summary ? (
          <p className="mt-4 line-clamp-3 text-[13px] leading-6 text-ink-600">
            {insight.summary}
          </p>
        ) : (
          <p className="mt-4 text-[13px] leading-6 text-ink-500">
            No AI analysis has been generated for this meeting yet.
          </p>
        )}

        {insight && (insight.action_item_count > 0 || insight.risk_count > 0) ? (
          <div className="mt-4 flex flex-wrap items-center gap-4 text-[11px] text-ink-500">
            <span className="inline-flex items-center gap-1.5">
              <CheckSquare className="size-3.5 text-ink-400" />
              {insight.action_item_count} action{" "}
              {insight.action_item_count === 1 ? "item" : "items"}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ShieldAlert className="size-3.5 text-ink-400" />
              {insight.risk_count} {insight.risk_count === 1 ? "risk" : "risks"}
            </span>
          </div>
        ) : null}
      </div>

      <div className="flex items-center justify-between border-t border-ink-100 px-5 py-3">
        <span className="inline-flex items-center gap-1.5 text-[11px] text-ink-400">
          <CalendarDays className="size-3.5" />
          {formatDateTime(interaction.occurred_at)}
        </span>
        <Link
          href={`/interactions/${interaction.id}`}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-ink-600 transition-colors hover:text-ink-950"
        >
          {insight ? "Open meeting" : "Analyze meeting"}
          <ArrowUpRight className="size-3" />
        </Link>
      </div>
    </Card>
  );
}

export default function InsightsPage() {
  const [rows, setRows] = useState<InsightRow[]>([]);
  const [config, setConfig] = useState<InsightConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(false);
      try {
        const [list, insightConfig] = await Promise.all([
          interactionsApi.list({ page_size: 24, sort: "-occurred_at" }),
          insightsApi.config(),
        ]);

        const results = await Promise.allSettled(
          list.items.map((interaction) => insightsApi.get(interaction.id)),
        );

        if (cancelled) return;
        setRows(
          list.items.map((interaction, index) => {
            const result = results[index];
            return {
              interaction,
              insight:
                result?.status === "fulfilled" ? result.value : null,
            };
          }),
        );
        setConfig(insightConfig);
      } catch (loadError) {
        if (cancelled) return;
        console.error(loadError);
        setError(true);
        toast.error("Failed to load insights");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const counts = useMemo(
    () =>
      rows.reduce<Record<Filter, number>>(
        (accumulator, row) => {
          accumulator.all += 1;
          accumulator[rowBucket(row)] += 1;
          return accumulator;
        },
        { all: 0, review: 0, ready: 0, awaiting: 0 },
      ),
    [rows],
  );

  const visibleRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows
      .filter((row) => filter === "all" || rowBucket(row) === filter)
      .filter((row) => {
        if (!query) return true;
        return (
          row.interaction.title.toLowerCase().includes(query) ||
          row.interaction.customer.name.toLowerCase().includes(query)
        );
      })
      .sort((a, b) => {
        const difference = priority(a) - priority(b);
        if (difference !== 0) return difference;
        return b.interaction.occurred_at.localeCompare(a.interaction.occurred_at);
      });
  }, [rows, filter, search]);

  const showEmpty = !loading && !error && visibleRows.length === 0;

  return (
    <div>
      <PageHeader
        eyebrow="Intelligence"
        title="AI Insights"
        description="Review summaries, risks, and follow-ups from your latest meetings. Open any meeting to generate, refresh, or inspect its analysis."
        actions={
          <Link
            href="/interactions"
            className={buttonStyles({ variant: "secondary" })}
          >
            Browse meetings
            <ArrowRight className="size-4" />
          </Link>
        }
      />

      {config && !config.configured ? (
        <Alert
          variant="warning"
          title="AI generation is not connected"
          className="mb-5 "
          action={
            <Link
              href="/interactions"
              className="text-xs font-medium underline underline-offset-4"
            >
              Open meetings
            </Link>
          }
        >
          Existing analyses remain available to review. Connect a provider to
          generate new insights for meeting notes.
        </Alert>
      ) : null}

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div
          className="flex items-center gap-1 overflow-x-auto  border border-ink-200 bg-white p-1"
          role="group"
          aria-label="Filter insights"
        >
          {FILTERS.map((item) => {
            const active = filter === item.value;
            return (
              <button
                key={item.value}
                type="button"
                onClick={() => setFilter(item.value)}
                aria-pressed={active}
                className={
                  active
                    ? "inline-flex h-7 shrink-0 items-center gap-1.5  bg-ink-950 px-2.5 text-[11px] font-medium text-white"
                    : "inline-flex h-7 shrink-0 items-center gap-1.5  px-2.5 text-[11px] font-medium text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900"
                }
              >
                {item.label}
                <span
                  className={
                    active
                      ? "text-[10px] text-white/55"
                      : "text-[10px] text-ink-400"
                  }
                >
                  {counts[item.value]}
                </span>
              </button>
            );
          })}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-ink-400" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search insights"
            aria-label="Search insights"
            className="h-9 pl-9 text-xs"
          />
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Card key={index} className="p-5">
              <div className="flex justify-between">
                <Skeleton className="h-5 w-20" />
                <Skeleton className="h-3 w-16" />
              </div>
              <Skeleton className="mt-5 h-4 w-2/3" />
              <Skeleton className="mt-2 h-3 w-1/3" />
              <Skeleton className="mt-5 h-14 w-full" />
            </Card>
          ))}
        </div>
      ) : error ? (
        <EmptyState
          icon={<TriangleAlert className="size-5" />}
          title="Unable to load insights"
          description="Check your connection or permissions, then try again."
          action={
            <button
              type="button"
              onClick={() => setReloadKey((key) => key + 1)}
              className={buttonStyles({ variant: "secondary" })}
            >
              <RotateCw className="size-4" />
              Try again
            </button>
          }
        />
      ) : showEmpty ? (
        <EmptyState
          icon={<Lightbulb className="size-5" />}
          title={search ? "No matching insights" : "Nothing here yet"}
          description={
            search
              ? "Try a different meeting title or customer name."
              : "Generate analysis from a meeting to see summaries, risks, and follow-ups here."
          }
          action={
            search ? (
              <button
                type="button"
                className={buttonStyles({ variant: "secondary" })}
                onClick={() => setSearch("")}
              >
                Clear search
              </button>
            ) : (
              <Link href="/interactions" className={buttonStyles()}>
                Open meetings
                <ArrowRight className="size-4" />
              </Link>
            )
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {visibleRows.map((row) => (
            <InsightCard key={row.interaction.id} row={row} />
          ))}
        </div>
      )}
    </div>
  );
}
