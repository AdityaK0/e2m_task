"use client";

import {
  Activity,
  ArrowUpRight,
  Building2,
  CalendarDays,
  ExternalLink,
  Globe,
  Lightbulb,
  Mail,
  MessageSquareText,
  Pencil,
  Phone,
  Plus,
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
import { Select } from "@/components/ui/field";
import { LoadingPanel } from "@/components/ui/spinner";
import {
  CustomerStatusBadge,
  InteractionTypeBadge,
} from "@/components/ui/status-badges";
import { usePermissions } from "@/features/auth/hooks";
import {
  assignCustomerManager,
  deleteCustomer,
  unassignCustomerManager,
} from "@/features/customers/customersSlice";
import { useAppDispatch } from "@/store/hooks";
import { customersApi } from "@/lib/api/customers";
import { getApiError } from "@/lib/api/errors";
import { interactionsApi } from "@/lib/api/interactions";
import type { CustomerDetail, Interaction, UserOption } from "@/lib/api/types";
import { usersApi } from "@/lib/api/users";
import { preferencesApi } from "@/lib/api/preferences";
import {
  formatDate,
  formatDateTime,
  formatRelative,
  toSafeHttpUrl,
} from "@/lib/utils";

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
  const dispatch = useAppDispatch();
  const { canDo } = usePermissions();
  const customerId = Number(params.id);

  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [managerOptions, setManagerOptions] = useState<UserOption[]>([]);
  const [selectedManagerId, setSelectedManagerId] = useState("");
  const [healthWindow, setHealthWindow] = useState(5);
  const isAdmin = canDo("users:manage");

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

  useEffect(() => {
    if (!isAdmin) return;
    usersApi.managerOptions().then(setManagerOptions).catch((err) => toast.error(getApiError(err)));
  }, [isAdmin]);

  useEffect(() => {
    preferencesApi.list().then((preferences) => {
      const setting = preferences.find((preference) => preference.key === "health_score_window");
      if (setting) setHealthWindow(setting.value);
    }).catch((err) => toast.error(getApiError(err)));
  }, []);

  const changeManager = async (managerId: number, assign: boolean) => {
    if (!customer) return;
    try {
      if (assign) {
        await dispatch(assignCustomerManager({ customerId: customer.id, managerId })).unwrap();
      } else {
        await dispatch(unassignCustomerManager({ customerId: customer.id, managerId })).unwrap();
      }
      setCustomer(await customersApi.get(customer.id));
      toast.success(assign ? "Manager assigned" : "Manager unassigned");
    } catch (err) {
      toast.error(getApiError(err));
    }
  };

  const handleDelete = async () => {
    if (!customer) return;
    setDeleting(true);
    try {
      await dispatch(deleteCustomer(customer.id)).unwrap();
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

  const website = toSafeHttpUrl(customer.website);

  return (
    <div>
      <PageHeader
        eyebrow="Customer"
        backHref="/customers"
        backLabel="All customers"
        title={
          <span className="flex flex-wrap items-center gap-3">
            {customer.name}
            <CustomerStatusBadge status={customer.status} />
          </span>
        }
        description={[
          customer.company,
          customer.industry,
          customer.assigned_managers.map((manager) => manager.name).join(", "),
        ]
          .filter(Boolean)
          .join(" · ") || "No company or industry set"}
        actions={
          <>
            {canDo("interactions:write") ? (
              <Link
                href={`/interactions?new=1&customer_id=${customer.id}`}
                className={buttonStyles({ variant: "secondary" })}
              >
                <Plus className="size-4" />
                Add meeting
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
            />
            <CardContent className="grid gap-x-8 sm:grid-cols-2">
              <div className="divide-y divide-ink-100">
                <InfoRow icon={UserRound} label="Primary contact">
                  {customer.contact_name || "Not set"}
                </InfoRow>
                <InfoRow icon={Mail} label="Email">
                  {customer.contact_email || "Not set"}
                </InfoRow>
                <InfoRow icon={Phone} label="Phone">
                  {customer.contact_phone || "Not set"}
                </InfoRow>
              </div>
              <div className="divide-y divide-ink-100">
                <InfoRow icon={Globe} label="Website">
                  {website ? (
                    <a
                      href={website}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 underline decoration-ink-300 underline-offset-4 transition hover:decoration-ink-900"
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
                <InfoRow icon={UserRound} label="Assigned managers">
                  {customer.assigned_managers.length > 0 ? (
                    <span className="flex flex-wrap gap-2">
                      {customer.assigned_managers.map((manager) => (
                        <span key={manager.id} className="flex items-center gap-2">
                          <Avatar name={manager.name} size="sm" />
                          {manager.name}
                        </span>
                      ))}
                    </span>
                  ) : (
                    "Unassigned"
                  )}
                </InfoRow>
                {isAdmin ? (
                  <div className="flex flex-wrap items-center gap-2 py-3">
                    <Select
                      aria-label="Choose manager"
                      value={selectedManagerId}
                      onChange={(event) => setSelectedManagerId(event.target.value)}
                      className="min-w-44"
                    >
                      <option value="">Choose manager</option>
                      {managerOptions
                        .filter((manager) => !customer.assigned_managers.some((assigned) => assigned.id === manager.id))
                        .map((manager) => (
                          <option key={manager.id} value={manager.id}>{manager.name}</option>
                        ))}
                    </Select>
                    <Button
                      variant="secondary"
                      disabled={!selectedManagerId}
                      onClick={() => {
                        void changeManager(Number(selectedManagerId), true);
                        setSelectedManagerId("");
                      }}
                    >
                      Manage managers
                    </Button>
                    {customer.assigned_managers.map((manager) => (
                      <Button
                        key={manager.id}
                        variant="ghost"
                        size="sm"
                        onClick={() => void changeManager(manager.id, false)}
                      >
                        Remove {manager.name}
                      </Button>
                    ))}
                  </div>
                ) : null}
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
              title="Recent meetings"
              description={`${customer.interaction_count} total ${
                customer.interaction_count === 1 ? "meeting" : "meetings"
              }`}
              action={
                <Link
                  href={`/interactions?customer_id=${customer.id}`}
                  className="inline-flex items-center gap-1 text-xs font-medium text-ink-500 transition-colors hover:text-ink-900"
                >
                  View all
                  <ArrowUpRight className="size-3" />
                </Link>
              }
            />
            {interactions.length === 0 ? (
              <EmptyState
                icon={<MessageSquareText className="size-5" />}
                title="No meetings yet"
                description="Log a meeting or call to capture notes and generate AI insights."
                action={
                  canDo("interactions:write") ? (
                    <Link
                      href={`/interactions?new=1&customer_id=${customer.id}`}
                      className={buttonStyles()}
                    >
                      <Plus className="size-4" />
                      Add meeting
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
                    className="flex items-start gap-3 px-5 py-3.5 transition-colors hover:bg-ink-50/80"
                  >
                    <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center  border border-ink-200 bg-ink-50/60">
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
            <CardHeader
              title="Account health"
              description="Current success signal"
              action={
                <span className="flex size-8 items-center justify-center  border border-ink-200 text-ink-500">
                  <Activity className="size-4" />
                </span>
              }
            />
            <CardContent>
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-[38px] leading-none font-semibold tracking-[-0.04em] text-ink-950">
                    {customer.health_score ?? "—"}
                    {customer.health_score !== null ? (
                      <span className="ml-1 text-sm font-normal text-ink-400">
                        / 100
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-2 text-xs text-ink-500">
                    {customer.health_score === null
                      ? "No data yet"
                      : customer.health_score >= 70
                        ? "Healthy account"
                        : customer.health_score >= 40
                          ? "Monitor closely"
                          : "Needs attention"}
                  </p>
                </div>
              </div>
              <div className="mt-5">
                <HealthIndicator
                  score={customer.health_score}
                  sampleSize={customer.health_sample_size}
                  window={healthWindow}
                />
              </div>

              <div className="mt-5 divide-y divide-ink-100 border-t border-ink-100">
                <div className="flex items-center justify-between py-3">
                  <span className="flex items-center gap-2 text-xs text-ink-500">
                    <MessageSquareText className="size-3.5 text-ink-400" />
                    Meetings
                  </span>
                  <span className="text-xs font-semibold text-ink-900">
                    {customer.interaction_count}
                  </span>
                </div>
                <div className="flex items-center justify-between py-3">
                  <span className="flex items-center gap-2 text-xs text-ink-500">
                    <Lightbulb className="size-3.5 text-ink-400" />
                    AI insights
                  </span>
                  <span className="text-xs font-semibold text-ink-900">
                    {customer.insight_count}
                  </span>
                </div>
                <div className="flex items-center justify-between py-3">
                  <span className="flex items-center gap-2 text-xs text-ink-500">
                    <CalendarDays className="size-3.5 text-ink-400" />
                    Last meeting
                  </span>
                  <span className="text-xs font-medium text-ink-700">
                    {customer.last_interaction_at
                      ? formatRelative(customer.last_interaction_at)
                      : "None"}
                  </span>
                </div>
                <div className="flex items-center justify-between py-3">
                  <span className="flex items-center gap-2 text-xs text-ink-500">
                    <CalendarDays className="size-3.5 text-ink-400" />
                    Customer since
                  </span>
                  <span className="text-xs font-medium text-ink-700">
                    {formatDate(customer.created_at)}
                  </span>
                </div>
              </div>

              <Link
                href="/insights"
                className="mt-2 flex items-center justify-between  border border-ink-100 bg-ink-50/60 px-3.5 py-3 text-xs font-medium text-ink-700 transition-colors hover:border-ink-200 hover:bg-ink-50"
              >
                Review AI insights
                <ArrowUpRight className="size-3.5 text-ink-400" />
              </Link>
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
