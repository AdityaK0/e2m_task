"use client";

import {
  Building2,
  CalendarDays,
  ExternalLink,
  Globe,
  Mail,
  MessageSquareText,
  Pencil,
  Phone,
  Plus,
  Sparkles,
  Trash2,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { HealthIndicator } from "@/components/customers/health-indicator";
import { Alert } from "@/components/ui/alert";
import { Avatar } from "@/components/ui/avatar";
import { Button, buttonStyles } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { LoadingPanel } from "@/components/ui/spinner";
import {
  CustomerStatusBadge,
  InteractionTypeBadge,
} from "@/components/ui/status-badges";
import { usePermissions } from "@/features/auth/hooks";
import { customersApi } from "@/lib/api/customers";
import { getApiError } from "@/lib/api/errors";
import { interactionsApi } from "@/lib/api/interactions";
import type { CustomerDetail, Interaction } from "@/lib/api/types";
import { formatDate, formatDateTime, formatRelative } from "@/lib/utils";

function InfoRow({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <Icon className="mt-0.5 size-4 shrink-0 text-ink-400" />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-ink-400">{label}</p>
        <div className="mt-0.5 text-sm text-ink-700">{children}</div>
      </div>
    </div>
  );
}

export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { canDo } = usePermissions();
  const customerId = Number(params.id);

  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      customersApi.get(customerId),
      interactionsApi.list({
        customer_id: customerId,
        sort: "-occurred_at",
        page_size: 50,
      }),
    ])
      .then(([customerResult, interactionResult]) => {
        if (cancelled) return;
        setCustomer(customerResult);
        setInteractions(interactionResult.items);
      })
      .catch((err) => {
        if (!cancelled) setError(getApiError(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [customerId]);

  const handleDelete = async () => {
    if (!customer) return;
    setDeleting(true);
    try {
      await customersApi.remove(customer.id);
      toast.success(`${customer.name} deleted`);
      router.push("/customers");
    } catch (err) {
      toast.error(getApiError(err));
    } finally {
      setDeleting(false);
    }
  };

  if (loading) return <LoadingPanel label="Loading customer" />;

  if (error || !customer) {
    return (
      <Alert variant="error" title="Could not load customer">
        {error ?? "Customer not found."}
      </Alert>
    );
  }

  const website = customer.website
    ? customer.website.startsWith("http")
      ? customer.website
      : `https://${customer.website}`
    : null;

  return (
    <div>
      <PageHeader
        eyebrow="Customer account"
        backHref="/customers"
        backLabel="Back to customers"
        title={
          <span className="flex flex-wrap items-center gap-3">
            {customer.name}
            <CustomerStatusBadge status={customer.status} />
          </span>
        }
        description={customer.company || "No company set"}
        actions={
          <>
            {canDo("interactions:write") ? (
              <Link
                href={`/interactions?new=1&customer_id=${customer.id}`}
                className={buttonStyles({ variant: "secondary" })}
              >
                <Plus className="size-4" />
                Add interaction
              </Link>
            ) : null}
            {canDo("customers:write") ? (
              <Link
                href={`/customers/${customer.id}/edit`}
                className={buttonStyles()}
              >
                <Pencil className="size-4" />
                Edit
              </Link>
            ) : null}
            {canDo("customers:delete") ? (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setConfirmDelete(true)}
                aria-label="Delete customer"
                className="text-ink-400 hover:bg-rose-50 hover:text-rose-600"
              >
                <Trash2 className="size-4" />
              </Button>
            ) : null}
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Account overview"
              description="Primary contact and ownership details"
              action={
                <div className="flex size-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                  <Building2 className="size-4" />
                </div>
              }
            />
            <CardContent className="grid gap-x-8 sm:grid-cols-2">
              <div className="divide-y divide-ink-100">
                <InfoRow icon={UserRound} label="Primary contact">
                  {customer.contact_name || "Not set"}
                </InfoRow>
                <InfoRow icon={Mail} label="Email">
                  {customer.contact_email ? (
                    <a
                      href={`mailto:${customer.contact_email}`}
                      className="text-brand-700 hover:underline"
                    >
                      {customer.contact_email}
                    </a>
                  ) : (
                    "Not set"
                  )}
                </InfoRow>
                <InfoRow icon={Phone} label="Phone">
                  {customer.contact_phone ? (
                    <a
                      href={`tel:${customer.contact_phone}`}
                      className="text-brand-700 hover:underline"
                    >
                      {customer.contact_phone}
                    </a>
                  ) : (
                    "Not set"
                  )}
                </InfoRow>
              </div>
              <div className="divide-y divide-ink-100">
                <InfoRow icon={Globe} label="Website">
                  {website ? (
                    <a
                      href={website}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-brand-700 hover:underline"
                    >
                      {customer.website}
                      <ExternalLink className="size-3" />
                    </a>
                  ) : (
                    "Not set"
                  )}
                </InfoRow>
                <InfoRow icon={Building2} label="Industry">
                  {customer.industry || "Not set"}
                </InfoRow>
                <InfoRow icon={UserRound} label="Account manager">
                  {customer.assigned_manager ? (
                    <span className="flex items-center gap-2">
                      <Avatar name={customer.assigned_manager.name} size="sm" />
                      {customer.assigned_manager.name}
                    </span>
                  ) : (
                    "Unassigned"
                  )}
                </InfoRow>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader
              title="Account notes"
              description="Shared context for the success team"
            />
            <CardContent>
              {customer.notes ? (
                <p className="text-sm leading-relaxed whitespace-pre-wrap text-ink-700">
                  {customer.notes}
                </p>
              ) : (
                <p className="text-sm text-ink-400">No notes have been added.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader
              title="Recent interactions"
              description={`${customer.interaction_count} total ${
                customer.interaction_count === 1 ? "interaction" : "interactions"
              }`}
              action={
                <Link
                  href={`/interactions?customer_id=${customer.id}`}
                  className="text-xs font-medium text-brand-700 hover:underline"
                >
                  View all
                </Link>
              }
            />
            {interactions.length === 0 ? (
              <EmptyState
                icon={<MessageSquareText className="size-5" />}
                title="No interactions yet"
                description="Log a meeting or call to capture notes and generate AI insights."
                action={
                  canDo("interactions:write") ? (
                    <Link
                      href={`/interactions?new=1&customer_id=${customer.id}`}
                      className={buttonStyles()}
                    >
                      <Plus className="size-4" />
                      Add interaction
                    </Link>
                  ) : null
                }
              />
            ) : (
              <div className="divide-y divide-ink-100">
                {interactions.map((interaction) => (
                  <Link
                    key={interaction.id}
                    href={`/interactions/${interaction.id}`}
                    className="flex items-start gap-3 px-5 py-4 transition hover:bg-ink-50"
                  >
                    <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl border border-ink-200 bg-white">
                      <MessageSquareText className="size-4 text-ink-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-medium text-ink-900">
                          {interaction.title}
                        </p>
                        <InteractionTypeBadge type={interaction.type} />
                      </div>
                      <p className="mt-1 text-xs text-ink-500">
                        {formatDateTime(interaction.occurred_at)}
                        {interaction.owner ? ` · ${interaction.owner.name}` : ""}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Account health" description="Current success signal" />
            <CardContent>
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-4xl font-semibold tracking-tight text-ink-900">
                    {customer.health_score ?? "—"}
                    {customer.health_score !== null ? (
                      <span className="ml-1 text-sm font-normal text-ink-400">/ 100</span>
                    ) : null}
                  </p>
                  <p className="mt-1 text-xs text-ink-500">
                    {customer.health_score === null
                      ? "Not assessed"
                      : customer.health_score >= 70
                        ? "Healthy account"
                        : customer.health_score >= 40
                          ? "Monitor closely"
                          : "Needs attention"}
                  </p>
                </div>
                <div className="flex size-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                  <Sparkles className="size-4" />
                </div>
              </div>
              <div className="mt-4">
                <HealthIndicator score={customer.health_score} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="At a glance" />
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between rounded-xl border border-ink-100 px-3.5 py-2.5">
                <span className="flex items-center gap-2 text-xs text-ink-500">
                  <MessageSquareText className="size-3.5" />
                  Interactions
                </span>
                <span className="text-sm font-semibold text-ink-900">
                  {customer.interaction_count}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-ink-100 px-3.5 py-2.5">
                <span className="flex items-center gap-2 text-xs text-ink-500">
                  <Sparkles className="size-3.5" />
                  AI insights
                </span>
                <span className="text-sm font-semibold text-ink-900">
                  {customer.insight_count}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-ink-100 px-3.5 py-2.5">
                <span className="flex items-center gap-2 text-xs text-ink-500">
                  <CalendarDays className="size-3.5" />
                  Last interaction
                </span>
                <span className="text-xs font-medium text-ink-700">
                  {customer.last_interaction_at
                    ? formatRelative(customer.last_interaction_at)
                    : "None"}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-ink-100 px-3.5 py-2.5">
                <span className="flex items-center gap-2 text-xs text-ink-500">
                  <CalendarDays className="size-3.5" />
                  Customer since
                </span>
                <span className="text-xs font-medium text-ink-700">
                  {formatDate(customer.created_at)}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title={`Delete ${customer.name}?`}
        description="This soft-deletes the customer and removes it from active views."
        confirmLabel="Delete customer"
        destructive
        isLoading={deleting}
        onConfirm={handleDelete}
        onClose={() => setConfirmDelete(false)}
      />
    </div>
  );
}
