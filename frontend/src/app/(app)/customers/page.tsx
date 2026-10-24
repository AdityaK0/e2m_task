"use client";

import {
  Building2,
  ChevronRight,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Users,
} from "lucide-react";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { toast } from "sonner";

import { HealthIndicator } from "@/components/customers/health-indicator";
import { Alert } from "@/components/ui/alert";
import { Avatar } from "@/components/ui/avatar";
import { Button, buttonStyles } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { TableSkeleton } from "@/components/ui/skeleton";
import { CustomerStatusBadge } from "@/components/ui/status-badges";
import { usePermissions } from "@/features/auth/hooks";
import { deleteCustomer, setCustomers } from "@/features/customers/customersSlice";
import { useAppDispatch } from "@/store/hooks";
import { useDebounce } from "@/hooks/use-debounce";
import { useQueryState } from "@/hooks/use-query-state";
import { customersApi, type CustomerSort } from "@/lib/api/customers";
import { getApiError } from "@/lib/api/errors";
import type { Customer, CustomerStatus, Paginated, UserOption } from "@/lib/api/types";
import { CUSTOMER_STATUS_OPTIONS } from "@/lib/labels";
import { usersApi } from "@/lib/api/users";
import { preferencesApi } from "@/lib/api/preferences";
import { cn, formatDate, formatRelative } from "@/lib/utils";

const SORT_OPTIONS: Array<{ value: CustomerSort; label: string }> = [
  { value: "-created_at", label: "Newest first" },
  { value: "created_at", label: "Oldest first" },
  { value: "name", label: "Name A–Z" },
  { value: "-name", label: "Name Z–A" },
  { value: "-health_score", label: "Health: high to low" },
  { value: "health_score", label: "Health: low to high" },
  { value: "-updated_at", label: "Recently updated" },
];

const STATUS_VALUES = new Set<string>([
  "prospect",
  "onboarding",
  "active",
  "at_risk",
  "churned",
]);

const SORT_VALUES = new Set<string>(SORT_OPTIONS.map((option) => option.value));

function CustomersContent() {
  const dispatch = useAppDispatch();
  const { canDo, isAdmin } = usePermissions();
  const { getString, getNumber, setParams } = useQueryState();

  const initialStatus = getString("status");
  const statusParam = STATUS_VALUES.has(initialStatus)
    ? (initialStatus as CustomerStatus)
    : "";
  const sortRaw = getString("sort", "-created_at");
  const sortParam = (SORT_VALUES.has(sortRaw) ? sortRaw : "-created_at") as CustomerSort;
  const managerParam = getNumber("manager");
  const page = getNumber("page", 1) ?? 1;

  const [search, setSearch] = useState(getString("search"));
  const debouncedSearch = useDebounce(search.trim(), 350);
  const [data, setData] = useState<Paginated<Customer> | null>(null);
  const [managers, setManagers] = useState<UserOption[]>([]);
  const [healthWindow, setHealthWindow] = useState(5);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [pendingDelete, setPendingDelete] = useState<Customer | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    usersApi
      .managerOptions()
      .then(setManagers)
      .catch(() => setManagers([]));
  }, [isAdmin]);

  useEffect(() => {
    preferencesApi.list().then((preferences) => {
      const setting = preferences.find((preference) => preference.key === "health_score_window");
      if (setting) setHealthWindow(setting.value);
    }).catch((err) => toast.error(getApiError(err)));
  }, []);

  useEffect(() => {
    if (debouncedSearch !== getString("search")) {
      setParams({ search: debouncedSearch || null, page: null });
    }
  }, [debouncedSearch, getString, setParams]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    customersApi
      .list({
        search: debouncedSearch || undefined,
        status: statusParam || undefined,
        assigned_manager_id: managerParam,
        sort: sortParam,
        page,
        page_size: 20,
      })
      .then((response) => {
        if (!cancelled) {
          setData(response);
          dispatch(setCustomers(response.items));
        }
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
  }, [debouncedSearch, statusParam, managerParam, sortParam, page, reloadKey]);

  const hasFilters = Boolean(
    debouncedSearch || statusParam || managerParam,
  );

  const resetFilters = () => {
    setSearch("");
    setParams({ search: null, status: null, manager: null, sort: null, page: null });
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await dispatch(deleteCustomer(pendingDelete.id)).unwrap();
      toast.success(`${pendingDelete.name} deleted`);
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
        eyebrow="Client portfolio"
        title="Customers"
        description="Accounts, ownership, and health across your customer portfolio."
        actions={
          canDo("customers:write") ? (
            <Link href="/customers/new" className={buttonStyles()}>
              <Plus className="size-4" />
              New customer
            </Link>
          ) : null
        }
      />

      <div className="mb-4 flex flex-col gap-3  border border-ink-200/90 bg-white p-3  lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-ink-400" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by customer, company, or contact…"
            className="h-9 pl-9 text-xs"
            aria-label="Search customers"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
          <Select
            value={statusParam}
            onChange={(event) =>
              setParams({ status: event.target.value || null, page: null })
            }
            aria-label="Filter by status"
            className="h-9 min-w-34 text-xs"
          >
            <option value="">All statuses</option>
            {CUSTOMER_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          {isAdmin ? (
            <Select
              value={managerParam ? String(managerParam) : ""}
              onChange={(event) =>
                setParams({ manager: event.target.value || null, page: null })
              }
              aria-label="Filter by manager"
              className="h-9 min-w-36 text-xs"
            >
              <option value="">All managers</option>
              {managers.map((manager) => (
                <option key={manager.id} value={manager.id}>
                  {manager.name}
                </option>
              ))}
            </Select>
          ) : null}
          <Select
            value={sortParam}
            onChange={(event) =>
              setParams({ sort: event.target.value, page: null })
            }
            aria-label="Sort customers"
            className="col-span-2 h-9 min-w-40 text-xs sm:col-span-1"
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
              className="col-span-2 sm:col-span-1"
            >
              Reset
            </Button>
          ) : null}
        </div>
      </div>

      {error ? (
        <Alert variant="error" title="Could not load customers" className="mb-4">
          {error}
        </Alert>
      ) : null}

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-ink-100 px-5 py-3">
          <p className="text-xs text-ink-500">
            {data ? (
              <>
                <span className="font-semibold text-ink-800">{data.total}</span>{" "}
                {data.total === 1 ? "customer" : "customers"}
              </>
            ) : (
              "Loading customers…"
            )}
          </p>
          <span className="hidden items-center gap-1 text-[11px] text-ink-400 sm:flex">
            <Building2 className="size-3.5" />
            Portfolio overview
          </span>
        </div>

        {loading && !data ? (
          <TableSkeleton rows={6} columns={5} />
        ) : !data || data.items.length === 0 ? (
          <EmptyState
            icon={hasFilters ? <Search className="size-5" /> : <Users className="size-5" />}
            title={hasFilters ? "No matching customers" : "No customers yet"}
            description={
              hasFilters
                ? "Try adjusting your search or filters to find the account you need."
                : "Create your first customer to start tracking meetings and insights."
            }
            action={
              hasFilters ? (
                <Button variant="secondary" onClick={resetFilters}>
                  Clear filters
                </Button>
              ) : canDo("customers:write") ? (
                <Link href="/customers/new" className={buttonStyles()}>
                  <Plus className="size-4" />
                  New customer
                </Link>
              ) : null
            }
          />
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-ink-100 bg-[#fbfbfa] text-[10px] font-medium tracking-[0.1em] text-ink-400 uppercase">
                    <th className="px-5 py-3 font-medium">Customer</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Health</th>
                    <th className="px-4 py-3 font-medium">Manager</th>
                    <th className="px-4 py-3 font-medium">Updated</th>
                    <th className="px-5 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {data.items.map((customer) => (
                    <tr key={customer.id} className="group transition hover:bg-ink-50/70">
                      <td className="max-w-72 px-5 py-3.5">
                        <Link href={`/customers/${customer.id}`} className="block min-w-0">
                          <p className="truncate font-medium text-ink-900 group-hover:text-brand-700">
                            {customer.name}
                          </p>
                          <p className="mt-0.5 truncate text-xs text-ink-500">
                            {customer.company || customer.contact_name || "—"}
                            {customer.industry ? ` · ${customer.industry}` : ""}
                          </p>
                        </Link>
                      </td>
                      <td className="px-4 py-3.5">
                        <CustomerStatusBadge status={customer.status} />
                      </td>
                      <td className="w-36 px-4 py-3.5">
                        <HealthIndicator
                          score={customer.health_score}
                          sampleSize={customer.health_sample_size}
                          window={healthWindow}
                          compact
                        />
                      </td>
                      <td className="px-4 py-3.5">
                        {customer.assigned_managers.length > 0 ? (
                          <div className="flex items-center gap-2">
                            <Avatar name={customer.assigned_managers[0]?.name ?? ""} size="sm" />
                            <span className="max-w-32 truncate text-xs text-ink-600">
                              {customer.assigned_managers.map((manager) => manager.name).join(", ")}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-ink-400">Unassigned</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="text-xs text-ink-500" title={formatDate(customer.updated_at)}>
                          {formatRelative(customer.updated_at)}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-end gap-1">
                          <Link
                            href={`/customers/${customer.id}`}
                            className=" p-1.5 text-ink-400 transition hover:bg-white hover:text-brand-700"
                            aria-label={`View ${customer.name}`}
                          >
                            <ChevronRight className="size-4" />
                          </Link>
                          {canDo("customers:write") ? (
                            <Link
                              href={`/customers/${customer.id}/edit`}
                              className=" p-1.5 text-ink-400 transition hover:bg-white hover:text-brand-700"
                              aria-label={`Edit ${customer.name}`}
                            >
                              <Pencil className="size-4" />
                            </Link>
                          ) : null}
                          {canDo("customers:delete") ? (
                            <button
                              type="button"
                              onClick={() => setPendingDelete(customer)}
                              className=" p-1.5 text-ink-400 transition hover:bg-rose-50 hover:text-rose-600"
                              aria-label={`Delete ${customer.name}`}
                            >
                              <Trash2 className="size-4" />
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-ink-100 md:hidden">
              {data.items.map((customer) => (
                <div key={customer.id} className="px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <Link href={`/customers/${customer.id}`} className="min-w-0">
                      <p className="truncate font-medium text-ink-900">{customer.name}</p>
                      <p className="mt-0.5 truncate text-xs text-ink-500">
                        {customer.company || customer.contact_name || "—"}
                      </p>
                    </Link>
                    <CustomerStatusBadge status={customer.status} />
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <HealthIndicator
                      score={customer.health_score}
                      sampleSize={customer.health_sample_size}
                      window={healthWindow}
                      compact
                    />
                    <span className="text-[11px] text-ink-400">
                      {formatRelative(customer.updated_at)}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-xs text-ink-500">
                      {customer.assigned_managers.length > 0 ? (
                        <>
                          <Avatar name={customer.assigned_managers[0]?.name ?? ""} size="sm" />
                          {customer.assigned_managers.map((manager) => manager.name).join(", ")}
                        </>
                      ) : (
                        "Unassigned"
                      )}
                    </span>
                    <div className="flex items-center gap-2">
                      {canDo("customers:write") ? (
                        <Link
                          href={`/customers/${customer.id}/edit`}
                          className={cn(buttonStyles({ variant: "secondary", size: "sm" }))}
                        >
                          Edit
                        </Link>
                      ) : null}
                      <Link
                        href={`/customers/${customer.id}`}
                        className={buttonStyles({ size: "sm" })}
                      >
                        View
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
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

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title={`Delete ${pendingDelete?.name ?? "customer"}?`}
        description="This soft-deletes the customer and hides it from your workspace."
        confirmLabel="Delete customer"
        destructive
        isLoading={deleting}
        onConfirm={handleDelete}
        onClose={() => setPendingDelete(null)}
      />
    </div>
  );
}

export default function CustomersPage() {
  return (
    <Suspense fallback={<TableSkeleton rows={6} columns={5} />}>
      <CustomersContent />
    </Suspense>
  );
}
