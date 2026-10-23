"use client";

import {
  Activity,
  AlertTriangle,
  CalendarClock,
  ChevronRight,
  MessageSquareText,
  Sparkles,
  Users,
  Workflow,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { CustomerStatusBadge, InsightStatusBadge } from "@/components/ui/status-badges";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/features/auth/hooks";
import { dashboardApi } from "@/lib/api/dashboard";
import type { DashboardSummary } from "@/lib/api/types";
import { INSIGHT_STATUS_TONES } from "@/lib/labels";
import { formatDateTime, formatRelative } from "@/lib/utils";
import { toast } from "sonner";

function Metric({
  label,
  value,
  icon: Icon,
  accent = "brand",
  href,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  accent?: "brand" | "success" | "warning" | "info";
  href?: string;
}) {
  const accents = {
    brand: "bg-brand-50 text-brand-600 ring-brand-500/10",
    success: "bg-emerald-50 text-emerald-600 ring-emerald-500/10",
    warning: "bg-amber-50 text-amber-600 ring-amber-500/10",
    info: "bg-sky-50 text-sky-600 ring-sky-500/10",
  };
  const content = (
    <div className="card group flex items-center justify-between gap-4 px-5 py-4 transition-all hover:-translate-y-[1px] hover:shadow-float">
      <div>
        <p className="text-xs text-ink-500">{label}</p>
        <p className="mt-2 text-3xl font-semibold tracking-tight text-ink-900">{value}</p>
      </div>
      <div
        className={`flex size-11 items-center justify-center rounded-2xl ring-1 ${accents[accent]}`}
      >
        <Icon className="size-5" />
      </div>
    </div>
  );
  if (href) {
    return (
      <Link href={href} className="block">
        {content}
      </Link>
    );
  }
  return content;
}

function Bar({ count, total, className }: { count: number; total: number; className: string }) {
  const width = total > 0 ? Math.max((count / total) * 100, count > 0 ? 6 : 0) : 0;
  return (
    <div className="h-2 overflow-hidden rounded-full bg-ink-100">
      <div
        className={`h-full rounded-full ${className}`}
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
        toast.error("Failed to load dashboard");
        console.error(error);
      })
      .finally(() => setLoading(false));
  }, []);

  const statusTotal = data
    ? data.customers_by_status.reduce((sum, item) => sum + item.count, 0)
    : 0;

  return (
    <div>
      <PageHeader
        eyebrow="Overview"
        title={`Welcome back, ${user?.name?.split(" ")[0] ?? "there"}`}
        description="Track account health, recent conversations, and AI insights in one place."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={() => { window.location.href = "/interactions"; }}>
              View interactions
            </Button>
            <Button leftIcon={<Users className="size-4" />} onClick={() => { window.location.href = "/customers"; }}>
              Go to customers
            </Button>
          </div>
        }
      />

      {loading ? (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="card h-[104px] px-5 py-4">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="mt-4 h-8 w-16" />
              </div>
            ))}
          </div>
          <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
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
          title="Unable to load dashboard"
          description="The dashboard summary could not be retrieved. Please refresh or check permissions."
          action={
            <Button variant="secondary" onClick={() => window.location.reload()}>
              Retry
            </Button>
          }
        />
      ) : (
        <div className="space-y-6">
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Metric
              label="Total customers"
              value={data.total_customers}
              icon={Users}
              href="/customers"
            />
            <Metric
              label="Active customers"
              value={data.active_customers}
              icon={Activity}
              accent="success"
              href="/customers?status=active"
            />
            <Metric
              label="At-risk customers"
              value={data.at_risk_customers}
              icon={AlertTriangle}
              accent="warning"
              href="/customers?status=at_risk"
            />
            <Metric
              label="Interactions (7d)"
              value={data.interactions_last_7_days}
              icon={MessageSquareText}
              accent="info"
              href="/interactions"
            />
          </section>

          <section className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)]">
            <Card className="overflow-hidden">
              <CardHeader
                title="Customers by status"
                description="Distribution across your portfolio"
              />
              <CardContent className="space-y-4">
                {data.customers_by_status.map((item) => {
                  const label =
                    item.status === "at_risk"
                      ? "At risk"
                      : item.status === "churned"
                      ? "Churned"
                      : item.status === "prospect"
                      ? "Prospect"
                      : item.status === "onboarding"
                      ? "Onboarding"
                      : "Active";
                  const colors: Record<string, string> = {
                    active: "bg-emerald-500",
                    at_risk: "bg-amber-500",
                    prospect: "bg-sky-500",
                    onboarding: "bg-violet-500",
                    churned: "bg-rose-500",
                  };
                  return (
                    <div key={item.status} className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <span
                            className={`size-2 rounded-full ${colors[item.status] ?? "bg-ink-400"}`}
                          />
                          <span className="text-ink-700">{label}</span>
                        </div>
                        <span className="font-medium text-ink-900">{item.count}</span>
                      </div>
                      <Bar
                        count={item.count}
                        total={statusTotal}
                        className={colors[item.status] ?? "bg-ink-400"}
                      />
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <Card>
              <CardHeader
                title="AI insights"
                description="Generation health across meetings"
                action={
                  <Sparkles className="size-4 text-brand-500" />
                }
              />
              <CardContent className="space-y-3">
            <button
              type="button"
              onClick={() => { window.location.href = "/interactions"; }}
              className="flex w-full items-center justify-between rounded-xl border border-ink-100 px-3.5 py-2.5 transition hover:bg-ink-50"
            >
              <div className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-emerald-500" />
                <span className="text-sm text-ink-700">Completed</span>
              </div>
              <span className="text-sm font-semibold text-ink-900">
                {data.completed_insights}
              </span>
            </button>
            <button
              type="button"
              onClick={() => { window.location.href = "/interactions"; }}
              className="flex w-full items-center justify-between rounded-xl border border-ink-100 px-3.5 py-2.5 transition hover:bg-ink-50"
            >
              <div className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-rose-500" />
                <span className="text-sm text-ink-700">Failed</span>
              </div>
              <span className="text-sm font-semibold text-ink-900">
                {data.failed_insights}
              </span>
            </button>
            <button
              type="button"
              onClick={() => { window.location.href = "/interactions"; }}
              className="flex w-full items-center justify-between rounded-xl border border-ink-100 px-3.5 py-2.5 transition hover:bg-ink-50"
            >
              <div className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-amber-500" />
                <span className="text-sm text-ink-700">Needs refresh</span>
              </div>
              <span className="text-sm font-semibold text-ink-900">
                {data.stale_insights}
              </span>
            </button>
                <div className="mt-4 rounded-xl bg-gradient-to-br from-brand-50 to-transparent px-3.5 py-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-ink-800">Insights needing review</p>
                    <p className="text-sm font-semibold text-brand-700">
                      {data.insights_needing_review}
                    </p>
                  </div>
                  <p className="mt-1 text-xs text-ink-500">
                    Stale or failed insights that may benefit from regeneration.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader
                title="Sentiment"
                description="Across completed insights"
              />
              <CardContent className="space-y-3">
                {data.sentiment_distribution.map((item) => {
                  const total = data.sentiment_distribution.reduce(
                    (sum, entry) => sum + entry.count,
                    0,
                  );
                  const colors: Record<string, string> = {
                    Positive: "bg-emerald-500",
                    Neutral: "bg-ink-400",
                    Negative: "bg-rose-500",
                  };
                  return (
                    <div key={item.sentiment} className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-ink-700">{item.sentiment}</span>
                        <span className="font-medium text-ink-900">{item.count}</span>
                      </div>
                      <Bar
                        count={item.count}
                        total={total}
                        className={colors[item.sentiment] ?? "bg-ink-400"}
                      />
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <Card>
              <CardHeader
                title="Recent interactions"
                description="Latest meetings and conversations"
                action={
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { window.location.href = "/interactions"; }}
                    className="gap-1"
                  >
                    All interactions
                    <ChevronRight className="size-4" />
                  </Button>
                }
              />
            {data.recent_interactions.length === 0 ? (
              <EmptyState
                icon={<MessageSquareText className="size-5" />}
                title="No interactions yet"
                description="Add your first meeting or call to start generating insights."
                action={
                  <Button onClick={() => { window.location.href = "/interactions"; }}>
                    Create interaction
                  </Button>
                }
              />
            ) : (
                <div className="divide-y divide-ink-100">
                  {data.recent_interactions.map((item) => (
                    <Link
                      key={item.id}
                      href={`/interactions/${item.id}`}
                      className="flex items-center gap-4 px-5 py-4 transition hover:bg-ink-50"
                    >
                      <div className="flex size-10 items-center justify-center rounded-2xl border border-ink-200 bg-white">
                        <CalendarClock className="size-4 text-ink-500" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink-900">
                          {item.title}
                        </p>
                        <p className="mt-0.5 flex items-center gap-2 text-xs text-ink-500">
                          <span className="truncate">{item.customer_name}</span>
                          <span>·</span>
                          <span>{formatDateTime(item.occurred_at)}</span>
                        </p>
                      </div>
                      <div className="hidden items-center gap-2 sm:flex">
                        <InsightStatusBadge
                          status={item.has_insight ? "completed" : "pending"}
                        />
                      </div>
                      <ChevronRight className="size-4 text-ink-300" />
                    </Link>
                  ))}
                </div>
              )}
            </Card>

            <Card>
              <CardHeader
                title="At-risk accounts"
                description="Focus on these first"
                action={
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { window.location.href = "/customers?status=at_risk"; }}
                    className="gap-1"
                  >
                    View all
                    <ChevronRight className="size-4" />
                  </Button>
                }
              />
              {data.at_risk_list.length === 0 ? (
                <EmptyState
                  icon={<Workflow className="size-5" />}
                  title="No at-risk accounts"
                  description="Your portfolio looks stable right now."
                />
              ) : (
                <div className="divide-y divide-ink-100">
                  {data.at_risk_list.map((item) => (
                    <Link
                      key={item.id}
                      href={`/customers/${item.id}`}
                      className="flex items-center gap-4 px-5 py-4 transition hover:bg-ink-50"
                    >
                      <div className="flex size-10 items-center justify-center rounded-2xl border border-amber-200 bg-amber-50">
                        <AlertTriangle className="size-4 text-amber-600" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink-900">
                          {item.name}
                        </p>
                    <p className="mt-0.5 truncate text-xs text-ink-500">
                      {item.assigned_manager ? item.assigned_manager : "Unassigned"}
                    </p>
                      </div>
          <div className="flex flex-col items-end">
            <CustomerStatusBadge status={item.status} />
            {item.health_score != null ? (
              <span className="mt-1 text-xs text-ink-500">
                Health {item.health_score}
              </span>
            ) : null}
          </div>
                    </Link>
                  ))}
                </div>
              )}
            </Card>
          </section>
        </div>
      )}
    </div>
  );
}
