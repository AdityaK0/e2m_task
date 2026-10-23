"use client";

import {
  AlertTriangle,
  CalendarClock,
  Cpu,
  ListChecks,
  RefreshCw,
  ShieldAlert,
  Sparkles,
} from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  InsightStatusBadge,
  SentimentBadge,
} from "@/components/ui/status-badges";
import type { MeetingInsight } from "@/lib/api/types";
import { cn, formatDate, formatDateTime } from "@/lib/utils";

function severityTone(severity: string | null): string {
  switch (severity) {
    case "high":
      return "border-rose-200 bg-rose-50 text-rose-700";
    case "medium":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "low":
      return "border-sky-200 bg-sky-50 text-sky-700";
    default:
      return "border-ink-200 bg-ink-50 text-ink-600";
  }
}

export function InsightPanel({
  insight,
  loading,
  generating,
  configured,
  canGenerate,
  hasNotes,
  onGenerate,
}: {
  insight: MeetingInsight | null;
  loading: boolean;
  generating: boolean;
  configured: boolean | null;
  canGenerate: boolean;
  hasNotes: boolean;
  onGenerate: () => void;
}) {
  const isStale = insight?.is_stale || insight?.status === "stale";
  const isFailed = insight?.status === "failed";
  const isCompleted =
    Boolean(insight?.summary) &&
    (insight?.status === "completed" || insight?.status === "stale");

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <span className="flex size-6 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <Sparkles className="size-3.5" />
            </span>
            AI meeting insight
          </span>
        }
        description={
          insight?.generated_at
            ? `Generated ${formatDateTime(insight.generated_at)}`
            : "Structured summary, sentiment, actions, and risks"
        }
        action={
          <div className="flex items-center gap-2">
            {insight ? <InsightStatusBadge status={insight.status} /> : null}
            {canGenerate ? (
              <Button
                variant={isCompleted && !isStale ? "secondary" : "primary"}
                size="sm"
                onClick={onGenerate}
                isLoading={generating}
                disabled={
                  !hasNotes || insight?.status === "running" || configured === false
                }
                leftIcon={!generating ? <RefreshCw className="size-3.5" /> : undefined}
              >
                {insight ? (isStale ? "Refresh insight" : "Regenerate") : "Generate insight"}
              </Button>
            ) : null}
          </div>
        }
      />

      {generating || insight?.status === "running" ? (
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3 rounded-xl border border-brand-100 bg-brand-50/60 px-4 py-3">
            <span className="relative flex size-8 items-center justify-center rounded-full bg-brand-600/10">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand-400/30" />
              <Sparkles className="relative size-4 text-brand-600" />
            </span>
            <div>
              <p className="text-sm font-medium text-brand-900">Analyzing meeting notes…</p>
              <p className="text-xs text-brand-700/70">
                Extracting a structured summary, sentiment, action items, and risks.
              </p>
            </div>
          </div>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-4/5" />
          <div className="grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        </CardContent>
      ) : loading ? (
        <CardContent className="space-y-3">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </CardContent>
      ) : !insight ? (
        <EmptyState
          icon={<Sparkles className="size-5" />}
          title="No insight generated yet"
          description={
            hasNotes
              ? configured === false
                ? "AI is not configured on this server. Add an API key to enable generation."
                : "Turn these notes into a concise summary with sentiment, action items, and risks."
              : "Add meeting notes before generating an AI insight."
          }
          action={
            canGenerate && hasNotes ? (
              <Button
                onClick={onGenerate}
                isLoading={generating}
                disabled={configured === false}
                leftIcon={<Sparkles className="size-4" />}
              >
                Generate insight
              </Button>
            ) : null
          }
        />
      ) : (
        <CardContent className="space-y-5">
          {configured === false ? (
            <Alert variant="warning" title="AI is not configured">
              This server has no AI provider key. Existing insights are still available,
              but new generation is disabled.
            </Alert>
          ) : null}

          {isStale ? (
            <Alert variant="warning" title="Notes have changed">
              This insight was generated before the latest note update. Refresh it to
              bring the summary and actions up to date.
            </Alert>
          ) : null}

          {isFailed ? (
            <Alert variant="error" title="Insight generation failed">
              {insight.error_message ??
                "The provider could not generate an insight. Try again in a moment."}
            </Alert>
          ) : null}

          {isCompleted ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                {insight.sentiment ? (
                  <SentimentBadge sentiment={insight.sentiment} />
                ) : null}
                <span className="text-xs text-ink-400">
                  {insight.action_item_count}{" "}
                  {insight.action_item_count === 1 ? "action" : "actions"} ·{" "}
                  {insight.risk_count} {insight.risk_count === 1 ? "risk" : "risks"}
                </span>
              </div>

              <div className="rounded-xl border border-ink-100 bg-gradient-to-br from-ink-50/80 to-white px-4 py-3.5">
                <p className="text-[11px] font-semibold tracking-wide text-ink-400 uppercase">
                  Summary
                </p>
                <p className="mt-1.5 text-sm leading-relaxed whitespace-pre-wrap text-ink-700">
                  {insight.summary}
                </p>
              </div>

              <div>
                <h3 className="flex items-center gap-2 text-sm font-semibold text-ink-900">
                  <ListChecks className="size-4 text-brand-600" />
                  Action items
                  <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-medium text-ink-500">
                    {insight.action_items.length}
                  </span>
                </h3>
                {insight.action_items.length === 0 ? (
                  <p className="mt-2 text-xs text-ink-400">
                    No explicit commitments were captured.
                  </p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {insight.action_items.map((item, index) => (
                      <li
                        key={`${item.description}-${index}`}
                        className="flex items-start gap-3 rounded-xl border border-ink-100 px-3.5 py-3"
                      >
                        <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[10px] font-semibold text-brand-700">
                          {index + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm leading-relaxed text-ink-800">
                            {item.description}
                          </p>
                          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-500">
                            <span>{item.owner ? `Owner: ${item.owner}` : "Owner: unassigned"}</span>
                            {item.due_date ? (
                              <span className="inline-flex items-center gap-1">
                                <CalendarClock className="size-3" />
                                Due {formatDate(item.due_date)}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <h3 className="flex items-center gap-2 text-sm font-semibold text-ink-900">
                  <ShieldAlert className="size-4 text-amber-600" />
                  Risks &amp; watchouts
                  <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-medium text-ink-500">
                    {insight.risks.length}
                  </span>
                </h3>
                {insight.risks.length === 0 ? (
                  <p className="mt-2 text-xs text-ink-400">
                    No material risks were identified in this conversation.
                  </p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {insight.risks.map((risk, index) => (
                      <li
                        key={`${risk.description}-${index}`}
                        className="flex items-start gap-3 rounded-xl border border-ink-100 px-3.5 py-3"
                      >
                        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm leading-relaxed text-ink-800">
                            {risk.description}
                          </p>
                          <span
                            className={cn(
                              "mt-1.5 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize",
                              severityTone(risk.severity),
                            )}
                          >
                            {risk.severity ?? "unrated"} severity
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-ink-100 pt-3 text-[10px] text-ink-400">
                <span className="inline-flex items-center gap-1">
                  <Cpu className="size-3" />
                  {insight.provider ?? "provider"} · {insight.model ?? "model"}
                </span>
                <span>
                  Notes v{insight.notes_version} · Generation v{insight.generation_version}
                </span>
              </div>
            </>
          ) : null}
        </CardContent>
      )}
    </Card>
  );
}
