"use client";

import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  MessageSquareText,
  Plus,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button, buttonStyles } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { CustomerStatusBadge } from "@/components/ui/status-badges";
import { useAuth } from "@/features/auth/hooks";
import { dashboardApi } from "@/lib/api/dashboard";
import type { DashboardSummary } from "@/lib/api/types";
import { CUSTOMER_STATUS_LABELS } from "@/lib/labels";
import { formatDateTime, formatRelative } from "@/lib/utils";

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-500",
  at_risk: "bg-amber-500",
  prospect: "bg-ink-400",
  onboarding: "bg-brand-500",
  churned: "bg-rose-500",
};

const SENTIMENT_COLORS: Record<string, string> = {
  Positive: "bg-emerald-500",
  Neutral: "bg-ink-400",
  Negative: "bg-rose-500",
};

function Metric({
  label,
  value,
  hint,
  href,
}: {
  label: string;
  value: number;
  hint: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group relative flex min-w-0 flex-col justify-between gap-8 px-5 py-5 transition-colors   hover:bg-ink-50/70 sm:px-6"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium text-ink-500">{label}</p>
        <ArrowUpRight className="size-3.5 text-ink-300 transition-colors group-hover:text-ink-600" />
      </div>
      <div>
        <p className="text-[30px] leading-none font-semibold tracking-[-0.04em] text-ink-950">
          {value.toLocaleString()}
        </p>
        <p className="mt-1.5 text-[11px] text-ink-400">{hint}</p>
      </div>
    </Link>
  );
}

function Bar({
  count,
  total,
  className,
}: {
  count: number;
  total: number;
  className: string;
}) {
  const width = total > 0 ? Math.max((count / total) * 100, count > 0 ? 4 : 0) : 0;
  return (
    <div className="h-1.5 overflow-hidden  bg-ink-100">
      <div
        className={`h-full  ${className}`}
        style={{ width: `${width}%` }}
        aria-hidden="true"
      />
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    dashboardApi
      .summary()
      .then(setData)
      .catch((error) => {
        toast.error("Failed to load overview");
        console.error(error);
      })
      .finally(() => setLoading(false));
  }, []);

  const statusTotal = data
    ? data.customers_by_status.reduce((sum, item) => sum + item.count, 0)
    : 0;
  const sentimentTotal = data
    ? data.sentiment_distribution.reduce((sum, item) => sum + item.count, 0)
    : 0;

  return (
    <div>
      <PageHeader
        eyebrow="Overview"
        title={`Welcome back, ${user?.name?.split(" ")[0] ?? "there"}`}
        description="A clear view of account health, recent meetings, and the follow-ups that need your attention."
        actions={
          <>
            <Link
              href="/interactions"
              className={buttonStyles({ variant: "secondary" })}
            >
              View meetings
            </Link>
            <Link href="/insights" className={buttonStyles()}>
              Review insights
              <ArrowRight className="size-4" />
            </Link>
          </>
        }
      />

      {loading ? (
        <div className="space-y-6">
          <div className="card grid grid-cols-2 divide-x divide-y divide-ink-100 overflow-hidden xl:grid-cols-4 xl:divide-y-0">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="px-6 py-5">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="mt-6 h-8 w-16" />
              </div>
            ))}
          </div>
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
            <div className="card h-80">
              <Skeleton className="mx-5 mt-5 h-4 w-32" />
            </div>
            <div className="card h-80">
              <Skeleton className="mx-5 mt-5 h-4 w-32" />
            </div>
          </div>
        </div>
      ) : !data ? (
        <EmptyState
          icon={<AlertTriangle className="size-5" />}
          title="Unable to load your overview"
          description="The summary could not be retrieved. Please refresh or check your permissions."
          action={
            <Button variant="secondary" onClick={() => window.location.reload()}>
              Retry
            </Button>
          }
        />
      ) : (
        <div className="space-y-6">
          <section className="card grid grid-cols-2 divide-x divide-y divide-ink-100 overflow-hidden xl:grid-cols-4 xl:divide-y-0">
            <Metric
              label="Total customers"
              value={data.total_customers}
              hint={`${data.active_customers} active`}
              href="/customers"
            />
            <Metric
              label="At risk"
              value={data.at_risk_customers}
              hint="Needs attention"
              href="/customers?status=at_risk"
            />
            <Metric
              label="Meetings this week"
              value={data.interactions_last_7_days}
              hint={`${data.total_interactions} total`}
              href="/interactions"
            />
            <Metric
              label="Insights ready"
              value={data.completed_insights}
              hint={`${data.insights_needing_review} need review`}
              href="/insights"
            />
          </section>

          <section className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
            <div className="space-y-6">
              <Card>
                <CardHeader
                  title="Priority accounts"
                  description="Accounts with elevated risk or limited momentum."
                  action={
                    <Link
                      href="/customers?status=at_risk"
                      className="inline-flex items-center gap-1 text-xs font-medium text-ink-500 transition-colors hover:text-ink-900"
                    >
                      View all
                      <ArrowUpRight className="size-3" />
                    </Link>
                  }
                />
                {data.at_risk_list.length === 0 ? (
                  <EmptyState
                    icon={<Users className="size-5" />}
                    title="No accounts need attention"
                    description="Your portfolio looks stable right now."
                  />
                ) : (
                  <div className="divide-y divide-ink-100">
                    {data.at_risk_list.slice(0, 5).map((item) => (
                      <Link
                        key={item.id}
                        href={`/customers/${item.id}`}
                        className="group flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-ink-50/80"
                      >
                        <span className="flex size-9 shrink-0 items-center justify-center  border border-amber-200/70 bg-amber-50 text-amber-700">
                          <AlertTriangle className="size-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-medium text-ink-900">
                            {item.name}
                          </p>
                          <p className="mt-0.5 truncate text-[11px] text-ink-500">
                            {item.assigned_manager || "Unassigned"}
                          </p>
                        </div>
                        <div className="flex items-center gap-4">
                          {item.health_score != null ? (
                            <span className="hidden text-[11px] text-ink-500 sm:inline">
                              Health {item.health_score}
                            </span>
                          ) : null}
                          <CustomerStatusBadge status={item.status} />
                        </div>
                        <ArrowUpRight className="size-3.5 text-ink-300 transition-colors group-hover:text-ink-700" />
                      </Link>
                    ))}
                  </div>
                )}
              </Card>

              <Card>
                <CardHeader
                  title="Recent meetings"
                  description="The latest conversations across your portfolio."
                  action={
                    <Link
                      href="/interactions"
                      className="inline-flex items-center gap-1 text-xs font-medium text-ink-500 transition-colors hover:text-ink-900"
                    >
                      All meetings
                      <ArrowUpRight className="size-3" />
                    </Link>
                  }
                />
                {data.recent_interactions.length === 0 ? (
                  <EmptyState
                    icon={<CalendarDays className="size-5" />}
                    title="No meetings yet"
                    description="Add your first meeting to start capturing decisions and follow-ups."
                    action={
                      <Link
                        href="/interactions"
                        className={buttonStyles({ variant: "secondary" })}
                      >
                        <Plus className="size-4" />
                        Add a meeting
                      </Link>
                    }
                  />
                ) : (
                  <div className="divide-y divide-ink-100">
                    {data.recent_interactions.slice(0, 5).map((item) => (
                      <Link
                        key={item.id}
                        href={`/interactions/${item.id}`}
                        className="group flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-ink-50/80"
                      >
                        <span className="flex size-9 shrink-0 items-center justify-center  border border-ink-200 bg-ink-50/60 text-ink-500">
                          <MessageSquareText className="size-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-medium text-ink-900">
                            {item.title}
                          </p>
                          <p className="mt-0.5 truncate text-[11px] text-ink-500">
                            {item.customer_name}
                          </p>
                        </div>
                        <div className="hidden text-right sm:block">
                          <p
                            className="text-[11px] font-medium text-ink-600"
                            title={formatDateTime(item.occurred_at)}
                          >
                            {formatRelative(item.occurred_at)}
                          </p>
                          <p className="mt-0.5 text-[10px] text-ink-400">
                            {item.has_insight ? "Insight ready" : "Not analyzed"}
                          </p>
                        </div>
                        <ArrowUpRight className="size-3.5 text-ink-300 transition-colors group-hover:text-ink-700" />
                      </Link>
                    ))}
                  </div>
                )}
              </Card>
            </div>

            <div className="space-y-6">
              <Card>
                <CardHeader
                  title="Portfolio"
                  description="Customers by lifecycle stage."
                />
                <CardContent className="space-y-4">
                  {data.customers_by_status.length === 0 ? (
                    <p className="py-4 text-center text-xs text-ink-500">
                      No customer data yet.
                    </p>
                  ) : (
                    data.customers_by_status.map((item) => (
                      <div key={item.status} className="space-y-2">
                        <div className="flex items-center justify-between gap-3 text-xs">
                          <span className="text-ink-600">
                            {CUSTOMER_STATUS_LABELS[item.status]}
                          </span>
                          <span className="font-medium text-ink-900">
                            {item.count}
                          </span>
                        </div>
                        <Bar
                          count={item.count}
                          total={statusTotal}
                          className={STATUS_COLORS[item.status] ?? "bg-ink-400"}
                        />
                      </div>
                    ))
                  )}
                  <Link
                    href="/customers"
                    className="flex items-center justify-between border-t border-ink-100 pt-4 text-xs font-medium text-ink-500 transition-colors hover:text-ink-900"
                  >
                    Open customer list
                    <ArrowUpRight className="size-3.5" />
                  </Link>
                </CardContent>
              </Card>

              <Card>
                <CardHeader
                  title="AI insight health"
                  description="Generated analysis across meetings."
                  action={
                    <Link
                      href="/insights"
                      className="text-xs font-medium text-ink-500 transition-colors hover:text-ink-900"
                    >
                      Open
                    </Link>
                  }
                />
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    <div className=" border border-ink-100 bg-ink-50/50 px-3 py-3">
                      <p className="text-lg font-semibold tracking-tight text-ink-950">
                        {data.completed_insights}
                      </p>
                      <p className="mt-0.5 text-[10px] text-ink-500">Ready</p>
                    </div>
                    <div className=" border border-ink-100 bg-ink-50/50 px-3 py-3">
                      <p className="text-lg font-semibold tracking-tight text-ink-950">
                        {data.insights_needing_review}
                      </p>
                      <p className="mt-0.5 text-[10px] text-ink-500">Review</p>
                    </div>
                    <div className=" border border-ink-100 bg-ink-50/50 px-3 py-3">
                      <p className="text-lg font-semibold tracking-tight text-ink-950">
                        {data.failed_insights}
                      </p>
                      <p className="mt-0.5 text-[10px] text-ink-500">Failed</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2.5  border border-ink-100 px-3.5 py-3">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-600" />
                    <p className="text-[11px] leading-5 text-ink-500">
                      {data.open_action_items} open action{" "}
                      {data.open_action_items === 1 ? "item" : "items"} across
                      your portfolio.
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader
                  title="Sentiment"
                  description="Across completed insights."
                />
                <CardContent className="space-y-4">
                  {sentimentTotal === 0 ? (
                    <p className="py-3 text-center text-xs text-ink-500">
                      Sentiment will appear after your first insight.
                    </p>
                  ) : (
                    data.sentiment_distribution.map((item) => (
                      <div key={item.sentiment} className="space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-ink-600">{item.sentiment}</span>
                          <span className="font-medium text-ink-900">
                            {item.count}
                          </span>
                        </div>
                        <Bar
                          count={item.count}
                          total={sentimentTotal}
                          className={
                            SENTIMENT_COLORS[item.sentiment] ?? "bg-ink-400"
                          }
                        />
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
