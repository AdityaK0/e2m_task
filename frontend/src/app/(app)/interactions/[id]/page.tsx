"use client";

import {
  CalendarClock,
  FileText,
  Pencil,
  Trash2,
  UserRound,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { InsightPanel } from "@/components/insights/insight-panel";
import { InteractionForm } from "@/components/interactions/interaction-form";
import { Alert } from "@/components/ui/alert";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PageHeader } from "@/components/ui/page-header";
import { LoadingPanel } from "@/components/ui/spinner";
import { InteractionTypeBadge } from "@/components/ui/status-badges";
import { usePermissions } from "@/features/auth/hooks";
import { isAxiosError } from "@/lib/api/client";
import { getApiError, getApiErrorCode } from "@/lib/api/errors";
import { insightsApi } from "@/lib/api/insights";
import { interactionsApi } from "@/lib/api/interactions";
import type { InsightConfig, InteractionDetail, MeetingInsight } from "@/lib/api/types";
import { formatDateTime, formatRelative } from "@/lib/utils";

function DetailLine({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 border-b border-ink-100 py-3 last:border-0">
      <Icon className="mt-0.5 size-4 shrink-0 text-ink-400" />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-ink-400">{label}</p>
        <div className="mt-0.5 text-sm text-ink-700">{children}</div>
      </div>
    </div>
  );
}

export default function InteractionDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const interactionId = Number(params.id);
  const { canDo } = usePermissions();

  const [interaction, setInteraction] = useState<InteractionDetail | null>(null);
  const [insight, setInsight] = useState<MeetingInsight | null>(null);
  const [insightLoading, setInsightLoading] = useState(true);
  const [config, setConfig] = useState<InsightConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    insightsApi
      .config()
      .then(setConfig)
      .catch(() => setConfig(null));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setInsightLoading(true);
    setError(null);

    interactionsApi
      .get(interactionId)
      .then((result) => {
        if (!cancelled) setInteraction(result);
      })
      .catch((err) => {
        if (!cancelled) setError(getApiError(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    insightsApi
      .get(interactionId)
      .then((result) => {
        if (!cancelled) setInsight(result);
      })
      .catch((err) => {
        if (!cancelled) {
          const notFound = isAxiosError(err) && err.response?.status === 404;
          setInsight(null);
          if (!notFound) {
            toast.error(getApiError(err));
          }
        }
      })
      .finally(() => {
        if (!cancelled) setInsightLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [interactionId, reloadKey]);

  const handleGenerate = async () => {
    if (!interaction) return;
    setGenerating(true);
    try {
      const result = await insightsApi.generate(
        interaction.id,
        Boolean(insight),
      );
      setInsight(result);
      toast.success("Insight generated");
      setReloadKey((value) => value + 1);
    } catch (err) {
      if (getApiErrorCode(err) === "AI_NOT_CONFIGURED") {
        setConfig({ configured: false, provider: null, model: null });
      }
      toast.error(getApiError(err));
    } finally {
      setGenerating(false);
    }
  };

  const handleDelete = async () => {
    if (!interaction) return;
    setDeleting(true);
    try {
      await interactionsApi.remove(interaction.id);
      toast.success("Meeting deleted");
      router.push("/interactions");
    } catch (err) {
      toast.error(getApiError(err));
    } finally {
      setDeleting(false);
    }
  };

  if (loading && !interaction) return <LoadingPanel label="Loading meeting" />;

  if (error || !interaction) {
    return (
      <Alert variant="error" title="Could not load meeting">
        {error ?? "Meeting not found."}
      </Alert>
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="Meeting"
        backHref="/interactions"
        backLabel="All meetings"
        title={interaction.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Link
              href={`/customers/${interaction.customer_id}`}
              className="font-medium text-ink-700 underline decoration-ink-300 underline-offset-4 transition hover:decoration-ink-900"
            >
              {interaction.customer.name}
            </Link>
            <span>·</span>
            <span>{formatDateTime(interaction.occurred_at)}</span>
            <InteractionTypeBadge type={interaction.type} />
          </span>
        }
        actions={
          <>
            {canDo("interactions:write") ? (
              <Button
                variant="secondary"
                onClick={() => setEditOpen(true)}
                leftIcon={<Pencil className="size-4" />}
              >
                Edit
              </Button>
            ) : null}
            {canDo("interactions:delete") ? (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setConfirmDelete(true)}
                aria-label="Delete meeting"
                className="text-ink-400 hover:bg-rose-50 hover:text-rose-600"
              >
                <Trash2 className="size-4" />
              </Button>
            ) : null}
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <InsightPanel
            insight={insight}
            loading={insightLoading}
            generating={generating}
            configured={config?.configured ?? null}
            canGenerate={canDo("insights:generate")}
            hasNotes={Boolean(interaction.notes?.trim())}
            onGenerate={handleGenerate}
          />

          <Card>
            <CardHeader
              title="Meeting notes"
              description={
                interaction.notes
                  ? `Version ${interaction.notes_version} · updated ${formatRelative(interaction.updated_at)}`
                  : "No notes captured for this meeting"
              }
            />
            <CardContent>
              {interaction.notes ? (
                <p className="text-sm leading-relaxed whitespace-pre-wrap text-ink-700">
                  {interaction.notes}
                </p>
              ) : (
                <Alert variant="warning" title="Notes required for AI">
                  Add meeting notes before generating an insight.
                </Alert>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Meeting details" />
            <CardContent className="py-1">
              <DetailLine icon={CalendarClock} label="Occurred">
                {formatDateTime(interaction.occurred_at)}
              </DetailLine>
              <DetailLine icon={UserRound} label="Owner">
                {interaction.owner ? (
                  <span className="flex items-center gap-2">
                    <Avatar name={interaction.owner.name} size="sm" />
                    {interaction.owner.name}
                  </span>
                ) : (
                  "Unassigned"
                )}
              </DetailLine>
              <DetailLine icon={Users} label="Participants">
                {interaction.participants.length === 0 ? (
                  "None recorded"
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {interaction.participants.map((participant) => (
                      <span
                        key={participant}
                        className=" border border-ink-200 bg-ink-50 px-2 py-0.5 text-[11px] text-ink-600"
                      >
                        {participant}
                      </span>
                    ))}
                  </div>
                )}
              </DetailLine>
              <DetailLine icon={FileText} label="Created">
                {formatDateTime(interaction.created_at)}
              </DetailLine>
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="Customer" />
            <CardContent>
              <Link
                href={`/customers/${interaction.customer_id}`}
                className="flex items-center gap-3  border border-ink-100 px-3.5 py-3 transition-colors hover:bg-ink-50"
              >
                <div className="flex size-9 items-center justify-center  bg-ink-100 text-ink-600">
                  <UserRound className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink-900">
                    {interaction.customer.name}
                  </p>
                  <p className="truncate text-xs text-ink-500">
                    {interaction.customer.company || "View account"}
                  </p>
                </div>
              </Link>
            </CardContent>
          </Card>

        </div>
      </div>

      <InteractionForm
        open={editOpen}
        onClose={() => setEditOpen(false)}
        interaction={interaction}
        onSaved={() => setReloadKey((value) => value + 1)}
      />

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this meeting?"
        description="The meeting and its AI insight will be hidden from the workspace."
        confirmLabel="Delete meeting"
        destructive
        isLoading={deleting}
        onConfirm={handleDelete}
        onClose={() => setConfirmDelete(false)}
      />
    </div>
  );
}
