"use client";

import {
  CalendarDays,
  ChevronRight,
  FileText,
  Mail,
  MessageSquareText,
  Pencil,
  Phone,
  Plus,
  RotateCcw,
  Search,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { toast } from "sonner";

import { InteractionForm } from "@/components/interactions/interaction-form";
import { ParticipantChips } from "@/components/interactions/participant-chips";
import { Alert } from "@/components/ui/alert";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { Skeleton, TableSkeleton } from "@/components/ui/skeleton";
import { InteractionTypeBadge } from "@/components/ui/status-badges";
import { usePermissions } from "@/features/auth/hooks";
import { useDebounce } from "@/hooks/use-debounce";
import { useQueryState } from "@/hooks/use-query-state";
import { customersApi } from "@/lib/api/customers";
import { usersApi } from "@/lib/api/users";
import { getApiError } from "@/lib/api/errors";
import {
  interactionsApi,
  type InteractionSort,
} from "@/lib/api/interactions";
import type {
  Customer,
  Interaction,
  InteractionType,
  Paginated,
  UserOption,
} from "@/lib/api/types";
import { INTERACTION_TYPE_OPTIONS } from "@/lib/labels";
import { cn, formatDateTime } from "@/lib/utils";

const TYPE_VALUES = new Set<string>(["meeting", "call", "email", "other"]);

const SORT_OPTIONS: Array<{ value: InteractionSort; label: string }> = [
  { value: "-occurred_at", label: "Newest first" },
  { value: "occurred_at", label: "Oldest first" },
  { value: "-created_at", label: "Recently added" },
  { value: "title", label: "Title A–Z" },
  { value: "-title", label: "Title Z–A" },
];

const SORT_VALUES = new Set<string>(SORT_OPTIONS.map((option) => option.value));

const TYPE_ICONS = {
  meeting: CalendarDays,
  call: Phone,
  email: Mail,
  other: FileText,
};

const TYPE_STYLES = {
  meeting: "border-ink-200 bg-ink-50/70 text-ink-600",
  call: "border-ink-200 bg-ink-50 text-ink-600",
  email: "border-ink-200 bg-ink-50/70 text-ink-600",
  other: "border-ink-200 bg-ink-50/70 text-ink-600",
};

function toDateStart(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function toDateEnd(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(`${value}T23:59:59`);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function InteractionsContent() {
  const { canDo } = usePermissions();
  const { getString, getNumber, setParams } = useQueryState();

  const typeRaw = getString("type");
  const typeParam = TYPE_VALUES.has(typeRaw) ? (typeRaw as InteractionType) : "";
  const sortRaw = getString("sort", "-occurred_at");
  const sortParam = (SORT_VALUES.has(sortRaw) ? sortRaw : "-occurred_at") as InteractionSort;
  const customerParam = getNumber("customer_id");
  const fromParam = getString("from");
  const toParam = getString("to");
  const page = getNumber("page", 1) ?? 1;

  const [search, setSearch] = useState(getString("search"));
  const debouncedSearch = useDebounce(search.trim(), 350);
  const [data, setData] = useState<Paginated<Interaction> | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [participantUsers, setParticipantUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Interaction | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Interaction | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    customersApi
      .list({ page_size: 100, sort: "name" })
      .then((result) => setCustomers(result.items))
      .catch(() => setCustomers([]));
  }, []);

  useEffect(() => {
    usersApi.options().then(setParticipantUsers).catch((error) => {
      toast.error(getApiError(error));
    });
  }, []);

  useEffect(() => {
    if (debouncedSearch !== getString("search")) {
      setParams({ search: debouncedSearch || null, page: null });
    }
  }, [debouncedSearch, getString, setParams]);

  useEffect(() => {
    if (getString("new") === "1") {
      setEditing(null);
      setFormOpen(true);
      setParams({ new: null });
    }
  }, [getString, setParams]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    interactionsApi
      .list({
        search: debouncedSearch || undefined,
        type: typeParam || undefined,
        customer_id: customerParam,
        date_from: toDateStart(fromParam),
        date_to: toDateEnd(toParam),
        sort: sortParam,
        page,
        page_size: 20,
      })
      .then((response) => {
        if (!cancelled) setData(response);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(getApiError(err));
          setData(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    debouncedSearch,
    typeParam,
    customerParam,
    fromParam,
    toParam,
    sortParam,
    page,
    reloadKey,
  ]);

  const hasFilters = Boolean(
    debouncedSearch || typeParam || customerParam || fromParam || toParam,
  );

  const resetFilters = () => {
    setSearch("");
    setParams({
      search: null,
      type: null,
      customer_id: null,
      from: null,
      to: null,
      sort: null,
      page: null,
    });
  };

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (interaction: Interaction) => {
    setEditing(interaction);
    setFormOpen(true);
  };

  const handleSaved = () => {
    setReloadKey((value) => value + 1);
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await interactionsApi.remove(pendingDelete.id);
      toast.success("Meeting deleted");
      setPendingDelete(null);
      setReloadKey((value) => value + 1);
    } catch (err) {
      toast.error(getApiError(err));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Conversations"
        title="Meetings"
        description="Every meeting, call, and email, with notes ready for AI analysis."
        actions={
          canDo("interactions:write") ? (
            <Button onClick={openCreate} leftIcon={<Plus className="size-4" />}>
              New meeting
            </Button>
          ) : null
        }
      />

      <div className="mb-4 flex flex-col gap-3  border border-ink-200/90 bg-white p-3 ">
        <div className="flex flex-col gap-2 lg:flex-row">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-ink-400" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by title, notes, or customer…"
              className="h-9 pl-9 text-xs"
              aria-label="Search meetings"
            />
          </div>
          <div className="grid grid-cols-2 gap-2 lg:flex">
            <Select
              value={typeParam}
              onChange={(event) =>
                setParams({ type: event.target.value || null, page: null })
              }
              aria-label="Filter by type"
              className="h-9 min-w-30 text-xs"
            >
              <option value="">All types</option>
              {INTERACTION_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <Select
              value={customerParam ? String(customerParam) : ""}
              onChange={(event) =>
                setParams({ customer_id: event.target.value || null, page: null })
              }
              aria-label="Filter by customer"
              className="h-9 min-w-36 text-xs"
            >
              <option value="">All customers</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-medium tracking-wide text-ink-400 uppercase">
              From
            </span>
            <Input
              type="date"
              value={fromParam}
              onChange={(event) =>
                setParams({ from: event.target.value || null, page: null })
              }
              className="h-8 w-34 text-xs"
              aria-label="From date"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-medium tracking-wide text-ink-400 uppercase">
              To
            </span>
            <Input
              type="date"
              value={toParam}
              onChange={(event) =>
                setParams({ to: event.target.value || null, page: null })
              }
              className="h-8 w-34 text-xs"
              aria-label="To date"
            />
          </div>
          <Select
            value={sortParam}
            onChange={(event) => setParams({ sort: event.target.value, page: null })}
            aria-label="Sort meetings"
            className="h-8 w-40 text-xs"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          {hasFilters ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={resetFilters}
              leftIcon={<RotateCcw className="size-3.5" />}
            >
              Reset filters
            </Button>
          ) : null}
        </div>
      </div>

      {error ? (
        <Alert variant="error" title="Could not load meetings" className="mb-4">
          {error}
        </Alert>
      ) : null}

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-ink-100 px-5 py-3">
          <p className="text-xs text-ink-500">
            {data ? (
              <>
                <span className="font-semibold text-ink-800">{data.total}</span>{" "}
                {data.total === 1 ? "meeting" : "meetings"}
              </>
            ) : (
              "Loading meetings…"
            )}
          </p>
          <span className="hidden items-center gap-1 text-[11px] text-ink-400 sm:flex">
            <MessageSquareText className="size-3.5" />
            Meeting history
          </span>
        </div>

        {loading && !data ? (
          <div className="divide-y divide-ink-100">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="flex gap-4 px-5 py-4">
                <Skeleton className="size-9 shrink-0 " />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-2/5" />
                  <Skeleton className="h-3 w-3/5" />
                </div>
              </div>
            ))}
          </div>
        ) : !data || data.items.length === 0 ? (
          <EmptyState
            icon={
              hasFilters ? <Search className="size-5" /> : <MessageSquareText className="size-5" />
            }
            title={hasFilters ? "No matching meetings" : "No meetings yet"}
            description={
              hasFilters
                ? "Try a different search, type, customer, or date range."
                : "Add your first meeting to turn conversations into actions."
            }
            action={
              hasFilters ? (
                <Button variant="secondary" onClick={resetFilters}>
                  Clear filters
                </Button>
              ) : canDo("interactions:write") ? (
                <Button onClick={openCreate} leftIcon={<Plus className="size-4" />}>
                  New meeting
                </Button>
              ) : null
            }
          />
        ) : (
          <>
            <div className="divide-y divide-ink-100">
              {data.items.map((interaction) => {
                const Icon = TYPE_ICONS[interaction.type];
                return (
                  <div
                    key={interaction.id}
                    className="group flex items-start gap-3.5 px-5 py-3.5 transition-colors hover:bg-ink-50/70"
                  >
                    <div
                      className={cn(
                        "mt-0.5 flex size-9 shrink-0 items-center justify-center  border",
                        TYPE_STYLES[interaction.type],
                      )}
                    >
                      <Icon className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/interactions/${interaction.id}`}
                          className="truncate text-[13px] font-medium text-ink-900 transition-colors group-hover:text-brand-700"
                        >
                          {interaction.title}
                        </Link>
                        <InteractionTypeBadge type={interaction.type} />
                      </div>
                      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-500">
                        <Link
                          href={`/customers/${interaction.customer_id}`}
                          className="font-medium text-ink-600 transition-colors hover:text-ink-950"
                        >
                          {interaction.customer.name}
                        </Link>
                        <span>·</span>
                        <span>{formatDateTime(interaction.occurred_at)}</span>
                        {interaction.owner ? (
                          <>
                            <span>·</span>
                            <span className="inline-flex items-center gap-1">
                              <Avatar name={interaction.owner.name} size="sm" />
                              {interaction.owner.name}
                            </span>
                          </>
                        ) : null}
                      </p>
                      {interaction.notes ? (
                        <p className="mt-1.5 line-clamp-1 text-xs text-ink-400">
                          {interaction.notes}
                        </p>
                      ) : null}
                      {interaction.participants.length > 0 ||
                      interaction.external_attendees.length > 0 ? (
                        <div className="mt-2">
                          <ParticipantChips
                            participants={interaction.participants}
                            externalAttendees={interaction.external_attendees}
                            users={participantUsers}
                          />
                        </div>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Link
                        href={`/interactions/${interaction.id}`}
                        className=" p-1.5 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-900"
                        aria-label={`View ${interaction.title}`}
                      >
                        <ChevronRight className="size-4" />
                      </Link>
                      {canDo("interactions:write") ? (
                        <button
                          type="button"
                          onClick={() => openEdit(interaction)}
                          className=" p-1.5 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-900"
                          aria-label={`Edit ${interaction.title}`}
                        >
                          <Pencil className="size-4" />
                        </button>
                      ) : null}
                      {canDo("interactions:delete") ? (
                        <button
                          type="button"
                          onClick={() => setPendingDelete(interaction)}
                          className=" p-1.5 text-ink-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                          aria-label={`Delete ${interaction.title}`}
                        >
                          <Trash2 className="size-4" />
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="border-t border-ink-100 px-5 py-3">
              <Pagination
                page={data.page}
                pages={data.pages}
                total={data.total}
                pageSize={data.page_size}
                onPageChange={(nextPage) => setParams({ page: nextPage })}
              />
            </div>
          </>
        )}
      </Card>

      <InteractionForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        interaction={editing}
        initialCustomerId={customerParam}
        onSaved={handleSaved}
      />

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Delete this meeting?"
        description="The meeting and its AI insight will be hidden from the workspace."
        confirmLabel="Delete meeting"
        destructive
        isLoading={deleting}
        onConfirm={handleDelete}
        onClose={() => setPendingDelete(null)}
      />
    </div>
  );
}

export default function InteractionsPage() {
  return (
    <Suspense fallback={<TableSkeleton rows={5} columns={4} />}>
      <InteractionsContent />
    </Suspense>
  );
}
