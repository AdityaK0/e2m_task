"use client";

import {
  Eye,
  Pencil,
  Power,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  UserCog,
  UserRound,
  Users,
  UserRoundPen,
} from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import { toast } from "sonner";

import { AccessDenied } from "@/components/access-denied";
import {
  CreateUserDialog,
  EditUserDialog,
  UserCredentialsDialog,
} from "@/components/admin/user-form-dialog";
import { Alert } from "@/components/ui/alert";
import { Dialog } from "@/components/ui/dialog";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { TableSkeleton } from "@/components/ui/skeleton";
import { RoleBadge } from "@/components/ui/status-badges";
import { useAuth, usePermissions } from "@/features/auth/hooks";
import {
  bulkAssignCustomers,
  bulkUnassignCustomers,
} from "@/features/customers/customersSlice";
import { useDebounce } from "@/hooks/use-debounce";
import { useQueryState } from "@/hooks/use-query-state";
import { getApiError } from "@/lib/api/errors";
import { customersApi } from "@/lib/api/customers";
import type {
  Customer,
  Paginated,
  Role,
  User,
  UserCredentials,
} from "@/lib/api/types";
import { usersApi } from "@/lib/api/users";
import { ROLE_LABELS } from "@/lib/permissions";
import { formatDate, formatRelative } from "@/lib/utils";
import { useAppDispatch } from "@/store/hooks";

const ROLE_VALUES = new Set<string>(["admin", "manager"]);

const ROLE_ICONS = {
  admin: ShieldCheck,
  manager: UserCog,
};

function UsersContent() {
  const dispatch = useAppDispatch();
  const { isAdmin } = usePermissions();
  const { user: currentUser } = useAuth();
  const { getString, getNumber, setParams } = useQueryState();

  const roleRaw = getString("role");
  const roleParam = ROLE_VALUES.has(roleRaw) ? (roleRaw as Role) : "";
  const activeRaw = getString("active");
  const activeParam =
    activeRaw === "true" ? true : activeRaw === "false" ? false : undefined;
  const page = getNumber("page", 1) ?? 1;

  const [search, setSearch] = useState(getString("search"));
  const debouncedSearch = useDebounce(search.trim(), 350);
  const [data, setData] = useState<Paginated<User> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [credentials, setCredentials] = useState<UserCredentials | null>(null);
  const [editing, setEditing] = useState<User | null>(null);
  const [activeTarget, setActiveTarget] = useState<User | null>(null);
  const [activeUpdating, setActiveUpdating] = useState(false);
  const [resetTarget, setResetTarget] = useState<User | null>(null);
  const [resetting, setResetting] = useState(false);
  const [assignmentTarget, setAssignmentTarget] = useState<User | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [customersError, setCustomersError] = useState<string | null>(null);
  const [assignmentSearch, setAssignmentSearch] = useState("");
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<number[]>([]);
  const [unassignMode, setUnassignMode] = useState(false);
  const [alsoAutoAssign, setAlsoAutoAssign] = useState(false);
  const [assignmentLoading, setAssignmentLoading] = useState(false);

  useEffect(() => {
    if (debouncedSearch !== getString("search")) {
      setParams({ search: debouncedSearch || null, page: null });
    }
  }, [debouncedSearch, getString, setParams]);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    usersApi
      .list({
        search: debouncedSearch || undefined,
        role: roleParam || undefined,
        is_active: activeParam,
        page,
        page_size: 20,
      })
      .then((result) => {
        if (!cancelled) setData(result);
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
  }, [isAdmin, debouncedSearch, roleParam, activeParam, page, reloadKey]);

  if (!isAdmin) {
    return <AccessDenied title="Team management is admin-only" />;
  }

  const hasFilters = Boolean(debouncedSearch || roleParam || activeRaw);
  const matchingCustomers = customers.filter((customer) =>
    customer.name.toLowerCase().includes(assignmentSearch.trim().toLowerCase()),
  );
  const assignmentCandidates = matchingCustomers.filter((customer) => {
    const isAssigned = customer.assigned_managers.some(
      (manager) => manager.id === assignmentTarget?.id,
    );
    return unassignMode ? isAssigned : true;
  });
  const selectableCustomerIds = assignmentCandidates
    .filter((customer) => {
      const isAssigned = customer.assigned_managers.some(
        (manager) => manager.id === assignmentTarget?.id,
      );
      return unassignMode ? isAssigned : !isAssigned;
    })
    .map((customer) => customer.id);
  const allSelectableCustomersSelected =
    selectableCustomerIds.length > 0 &&
    selectableCustomerIds.every((id) => selectedCustomerIds.includes(id));
  const resetFilters = () => {
    setSearch("");
    setParams({ search: null, role: null, active: null, page: null });
  };

  const handleActiveChange = async () => {
    if (!activeTarget) return;
    setActiveUpdating(true);
    try {
      if (activeTarget.is_active) {
        await usersApi.deactivate(activeTarget.id);
      } else {
        await usersApi.reactivate(activeTarget.id);
      }
      toast.success(activeTarget.is_active ? "User deactivated" : "User reactivated");
      setActiveTarget(null);
      setReloadKey((value) => value + 1);
    } catch (err) {
      toast.error(getApiError(err));
    } finally {
      setActiveUpdating(false);
    }
  };

  const handleResetPassword = async () => {
    if (!resetTarget) return;
    setResetting(true);
    try {
      const result = await usersApi.resetPassword(resetTarget.id);
      setCredentials(result);
      toast.success("Password reset");
      setResetTarget(null);
      setReloadKey((value) => value + 1);
    } catch (err) {
      toast.error(getApiError(err));
    } finally {
      setResetting(false);
    }
  };

  const openAssignments = async (user: User) => {
    setAssignmentTarget(user);
    setCustomers([]);
    setCustomersError(null);
    setCustomersLoading(true);
    setAlsoAutoAssign(user.auto_assign_new_customers);
    setSelectedCustomerIds([]);
    setUnassignMode(false);
    setAssignmentSearch("");
    try {
      const allCustomers: Customer[] = [];
      let pageNumber = 1;
      let pages = 1;
      do {
        const result = await customersApi.list({
          page: pageNumber,
          page_size: 100,
        });
        allCustomers.push(...result.items);
        pages = result.pages;
        pageNumber += 1;
      } while (pageNumber <= pages);
      setCustomers(allCustomers);
    } catch (error) {
      const message = getApiError(error);
      setCustomersError(message);
      toast.error(`Could not load customers: ${message}`);
    } finally {
      setCustomersLoading(false);
    }
  };

  const saveAssignments = async () => {
    if (!assignmentTarget) return;
    const assignmentRequested = selectedCustomerIds.length > 0;
    const autoAssignChanged =
      alsoAutoAssign !== assignmentTarget.auto_assign_new_customers;
    if (
      assignmentLoading ||
      customersLoading ||
      customersError ||
      (!assignmentRequested && !autoAssignChanged)
    ) {
      return;
    }

    setAssignmentLoading(true);
    let autoAssignSaved = false;
    let assignmentChanged: number | null = null;
    let skipped = 0;
    try {
      if (autoAssignChanged) {
        await usersApi.update(assignmentTarget.id, {
          auto_assign_new_customers: alsoAutoAssign,
        });
        autoAssignSaved = true;
      }

      if (assignmentRequested) {
        const payload = {
          manager_id: assignmentTarget.id,
          customer_ids: selectedCustomerIds,
        };
        if (unassignMode) {
          const { result } = await dispatch(
            bulkUnassignCustomers(payload),
          ).unwrap();
          assignmentChanged = result.unassigned;
          skipped = result.skipped;
        } else {
          const { result } = await dispatch(
            bulkAssignCustomers(payload),
          ).unwrap();
          assignmentChanged = result.assigned;
          skipped = result.skipped;
        }
        if (assignmentChanged + skipped !== selectedCustomerIds.length) {
          throw new Error(
            "The server returned inconsistent assignment counts. Please reload and try again.",
          );
        }
      }

      const messages = [];
      if (assignmentChanged !== null) {
        messages.push(
          `${assignmentChanged} client(s) ${unassignMode ? "unassigned" : "assigned"}; ${skipped} ${
            unassignMode ? "were not assigned" : "were already assigned"
          }`,
        );
      }
      if (autoAssignSaved) {
        messages.push("Future customer auto-assignment updated");
      }
      toast.success(messages.join(". "));
      setAssignmentTarget(null);
    } catch (error) {
      const message = getApiError(error);
      toast.error(
        autoAssignSaved
          ? `Future auto-assignment was updated, but client assignments failed: ${message}`
          : message,
      );
    } finally {
      if (autoAssignSaved || assignmentChanged !== null) {
        setReloadKey((value) => value + 1);
      }
      setAssignmentLoading(false);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Administration"
        title="Team"
        description="Manage people, roles, and account access. Roles control what each person can do."
        actions={
          <Button onClick={() => setCreateOpen(true)} leftIcon={<Plus className="size-4" />}>
            Create user
          </Button>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        {(["admin", "manager"] as Role[]).map((role) => {
          const Icon = ROLE_ICONS[role];
          return (
            <div
              key={role}
              className="flex items-center gap-3  border border-ink-200/80 bg-white px-4 py-3 "
            >
              <div className="flex size-8 items-center justify-center  border border-ink-200 bg-ink-50 text-ink-500">
                <Icon className="size-4" />
              </div>
              <div>
                <p className="text-xs font-semibold text-ink-800">
                  {ROLE_LABELS[role]}
                </p>
                <p className="mt-0.5 text-[11px] text-ink-400">
                  {role === "admin"
                    ? "Full workspace control"
                    : "Assigned customers and interactions"}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mb-4 flex flex-col gap-3  border border-ink-200/90 bg-white p-3  sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-ink-400" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name or email…"
              className="h-9 pl-9 text-xs"
              aria-label="Search team"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={roleParam}
              onChange={(event) =>
                setParams({ role: event.target.value || null, page: null })
              }
              aria-label="Filter by role"
              className="h-9 w-42 text-xs"
            >
              <option value="">All roles</option>
              <option value="admin">Administrator</option>
              <option value="manager">Manager</option>
            </Select>
            <Select
              value={activeRaw}
              onChange={(event) =>
                setParams({ active: event.target.value || null, page: null })
              }
              aria-label="Filter by status"
              className="h-9 w-34 text-xs"
            >
              <option value="">All statuses</option>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </Select>
            {hasFilters ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={resetFilters}
                leftIcon={<RotateCcw className="size-3.5" />}
              >
                Reset
              </Button>
            ) : null}
          </div>
      </div>

      {error ? (
        <Alert variant="error" title="Could not load users" className="mb-4">
          {error}
        </Alert>
      ) : null}

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-ink-100 px-5 py-3">
          <p className="text-xs text-ink-500">
            {data ? (
              <>
                <span className="font-semibold text-ink-800">{data.total}</span>{" "}
                {data.total === 1 ? "team member" : "team members"}
              </>
            ) : (
              "Loading team…"
            )}
          </p>
          <span className="hidden items-center gap-1 text-[11px] text-ink-400 sm:flex">
            <Users className="size-3.5" />
            Role-based access
          </span>
        </div>

        {loading && !data ? (
          <TableSkeleton rows={5} columns={5} />
        ) : !data || data.items.length === 0 ? (
          <EmptyState
            icon={<UserRound className="size-5" />}
            title={hasFilters ? "No matching team members" : "No users found"}
            description={
              hasFilters
                ? "Try adjusting your search, role, or status filters."
                : "Add a team member to collaborate in the workspace."
            }
            action={
              hasFilters ? (
                <Button variant="secondary" onClick={resetFilters}>
                  Clear filters
                </Button>
              ) : (
                <Button onClick={() => setCreateOpen(true)} leftIcon={<Plus className="size-4" />}>
                  Create user
                </Button>
              )
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-ink-100 bg-[#fbfbfa] text-[10px] font-medium tracking-[0.1em] text-ink-400 uppercase">
                    <th className="px-5 py-3 font-medium">User</th>
                    <th className="px-4 py-3 font-medium">Role</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Last login</th>
                    <th className="px-4 py-3 font-medium">Joined</th>
                    <th className="px-5 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {data.items.map((user) => {
                    const isSelf = user.id === currentUser?.id;
                    return (
                      <tr key={user.id} className="transition hover:bg-ink-50/70">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <Avatar name={user.name} />
                            <div className="min-w-0">
                              <p className="flex items-center gap-1.5 truncate font-medium text-ink-900">
                                {user.name}
                                {isSelf ? (
                                  <span className=" bg-ink-100 px-1.5 py-0.5 text-[9px] font-semibold tracking-wide text-ink-500">
                                    YOU
                                  </span>
                                ) : null}
                              </p>
                              <p className="truncate text-xs text-ink-500">{user.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <RoleBadge role={user.role} />
                        </td>
                        <td className="px-4 py-3.5">
                          <Badge tone={user.is_active ? "success" : "neutral"} dot>
                            {user.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </td>
                        <td className="px-4 py-3.5 text-xs text-ink-500">
                          {user.last_login_at ? (
                            <span title={formatDate(user.last_login_at)}>
                              {formatRelative(user.last_login_at)}
                            </span>
                          ) : (
                            "Never"
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-xs text-ink-500">
                          {formatDate(user.created_at)}
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center justify-end gap-1">
                            {user.role === "manager" ? (
                              <button
                                type="button"
                                onClick={() => void openAssignments(user)}
                                className=" p-1.5 text-ink-400 transition-colors hover:bg-ink-100 hover:text-brand-700"
                                aria-label={`Assign clients to ${user.name}`}
                                title="Assign clients"
                              >
                                <UserRoundPen className="size-4" />
                              </button>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => setEditing(user)}
                              className=" p-1.5 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-900"
                              aria-label={`Edit ${user.name}`}
                            >
                              <Pencil className="size-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setResetTarget(user)}
                              className=" p-1.5 text-ink-400 transition-colors hover:bg-ink-100 hover:text-amber-600"
                              aria-label={`Reset password for ${user.name}`}
                              title="Reset password"
                            >
                              <RotateCcw className="size-4" />
                            </button>
                            {!isSelf ? (
                              <button
                                type="button"
                                onClick={() => setActiveTarget(user)}
                                className={`p-1.5 transition-colors hover:bg-ink-100 ${
                                  user.is_active
                                    ? "text-ink-400 hover:text-rose-600"
                                    : "text-ink-400 hover:text-emerald-600"
                                }`}
                                aria-label={`${user.is_active ? "Deactivate" : "Reactivate"} ${user.name}`}
                                title={user.is_active ? "Deactivate user" : "Reactivate user"}
                              >
                                <Power className="size-4" />
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
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

      <CreateUserDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={() => setReloadKey((value) => value + 1)}
        onCreated={setCredentials}
      />

      <UserCredentialsDialog
        credentials={credentials}
        onClose={() => setCredentials(null)}
      />

      <EditUserDialog
        user={editing}
        currentUserId={currentUser?.id}
        onClose={() => setEditing(null)}
        onSaved={() => setReloadKey((value) => value + 1)}
      />

      <ConfirmDialog
        open={Boolean(activeTarget)}
        title={`${activeTarget?.is_active ? "Deactivate" : "Reactivate"} ${activeTarget?.name ?? "this user"}?`}
        description={
          activeTarget?.is_active
            ? "They will lose access immediately."
            : "They will be able to sign in again with their existing password."
        }
        confirmLabel={activeTarget?.is_active ? "Deactivate user" : "Reactivate user"}
        destructive={Boolean(activeTarget?.is_active)}
        isLoading={activeUpdating}
        onConfirm={handleActiveChange}
        onClose={() => setActiveTarget(null)}
      />

      <ConfirmDialog
        open={Boolean(resetTarget)}
        title={`Reset password for ${resetTarget?.name ?? "this user"}?`}
        description="A new temporary password will be generated and shown once. They must change it at next sign-in."
        confirmLabel="Reset password"
        destructive
        isLoading={resetting}
        onConfirm={handleResetPassword}
        onClose={() => setResetTarget(null)}
      />

      <Dialog
        open={Boolean(assignmentTarget)}
        onClose={() => setAssignmentTarget(null)}
        title={`${unassignMode ? "Unassign clients from" : "Assign clients to"} ${assignmentTarget?.name ?? "manager"}`}
        description="See each customer's current assignment and choose customers to assign or unassign."
        dismissible={!assignmentLoading}
        footer={
          <>
            <Button variant="secondary" onClick={() => setAssignmentTarget(null)}>Cancel</Button>
            <Button
              onClick={() => void saveAssignments()}
              isLoading={assignmentLoading}
              disabled={
                customersLoading ||
                Boolean(customersError) ||
                (selectedCustomerIds.length === 0 &&
                  alsoAutoAssign === assignmentTarget?.auto_assign_new_customers)
              }
            >
              Confirm {unassignMode ? "unassign" : "assignment"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={unassignMode ? "secondary" : "primary"}
              onClick={() => {
                setUnassignMode(false);
                setSelectedCustomerIds([]);
              }}
            >
              Assign
            </Button>
            <Button
              size="sm"
              variant={unassignMode ? "primary" : "secondary"}
              onClick={() => {
                setUnassignMode(true);
                setSelectedCustomerIds([]);
              }}
            >
              Unassign
            </Button>
          </div>
          <Input
            value={assignmentSearch}
            onChange={(event) => setAssignmentSearch(event.target.value)}
            placeholder="Search customers"
            aria-label="Search customers to assign"
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={allSelectableCustomersSelected}
              disabled={
                customersLoading ||
                Boolean(customersError) ||
                selectableCustomerIds.length === 0
              }
              onChange={(event) =>
                setSelectedCustomerIds((ids) =>
                  event.target.checked
                    ? [...new Set([...ids, ...selectableCustomerIds])]
                    : ids.filter((id) => !selectableCustomerIds.includes(id)),
                )
              }
            />
            Select all {unassignMode ? "assigned" : "unassigned"} customers
          </label>
          <p className="text-xs text-ink-500">
            {selectedCustomerIds.length} customer(s) selected
          </p>
          <div className="max-h-56 space-y-2 overflow-auto border p-3">
            {customersLoading ? (
              <p className="text-sm text-ink-500">Loading customers…</p>
            ) : customersError ? (
              <div className="space-y-2">
                <p className="text-sm text-rose-600">{customersError}</p>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => assignmentTarget && void openAssignments(assignmentTarget)}
                >
                  Retry
                </Button>
              </div>
            ) : assignmentCandidates.length === 0 ? (
              <p className="text-sm text-ink-500">No customers found.</p>
            ) : (
              assignmentCandidates.map((customer) => {
                const isAssigned = customer.assigned_managers.some(
                  (manager) => manager.id === assignmentTarget?.id,
                );
                const canChangeAssignment = unassignMode || !isAssigned;
                return (
                  <label
                    key={customer.id}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <input
                        type="checkbox"
                        checked={
                          (!unassignMode && isAssigned) ||
                          selectedCustomerIds.includes(customer.id)
                        }
                        disabled={!canChangeAssignment || assignmentLoading}
                        onChange={(event) =>
                          setSelectedCustomerIds((ids) =>
                            event.target.checked
                              ? [...new Set([...ids, customer.id])]
                              : ids.filter((id) => id !== customer.id),
                          )
                        }
                      />
                      <span className="truncate">{customer.name}</span>
                    </span>
                    <Badge tone={isAssigned ? "success" : "neutral"}>
                      {isAssigned ? "Assigned" : "Not assigned"}
                    </Badge>
                  </label>
                );
              })
            )}
          </div>
          <label className="flex items-center gap-2 text-sm" title="Automatically assign future customers to this manager">
            <input type="checkbox" checked={alsoAutoAssign} onChange={(event) => setAlsoAutoAssign(event.target.checked)} />
            Also keep assigning new customers
          </label>
          <p className="text-xs text-ink-500">
            {selectedCustomerIds.length} customer(s) selected.
          </p>
        </div>
      </Dialog>
    </div>
  );
}

export default function AdminUsersPage() {
  return (
    <Suspense fallback={<TableSkeleton rows={5} columns={5} />}>
      <UsersContent />
    </Suspense>
  );
}
