"use client";

import {
  KeyRound,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  UserRound,
  Users,
} from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import { toast } from "sonner";

import { AccessDenied } from "@/components/access-denied";
import {
  CreateUserDialog,
  EditUserDialog,
} from "@/components/admin/user-form-dialog";
import { Alert } from "@/components/ui/alert";
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
import { useDebounce } from "@/hooks/use-debounce";
import { useQueryState } from "@/hooks/use-query-state";
import { getApiError } from "@/lib/api/errors";
import type { Paginated, Role, User } from "@/lib/api/types";
import { usersApi } from "@/lib/api/users";
import { ROLE_LABELS } from "@/lib/permissions";
import { formatDate, formatRelative } from "@/lib/utils";

const ROLE_VALUES = new Set<string>(["admin", "csm", "viewer"]);

function UsersContent() {
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
  const [editing, setEditing] = useState<User | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<User | null>(null);
  const [revoking, setRevoking] = useState(false);

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
  const resetFilters = () => {
    setSearch("");
    setParams({ search: null, role: null, active: null, page: null });
  };

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    setRevoking(true);
    try {
      const result = await usersApi.revokeSessions(revokeTarget.id);
      toast.success(result.message);
      setRevokeTarget(null);
      setReloadKey((value) => value + 1);
    } catch (err) {
      toast.error(getApiError(err));
    } finally {
      setRevoking(false);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Administration"
        title="Team & access"
        description="Manage users, roles, and account status. Roles control what each person can do."
        actions={
          <Button onClick={() => setCreateOpen(true)} leftIcon={<Plus className="size-4" />}>
            Add user
          </Button>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        {(["admin", "csm", "viewer"] as Role[]).map((role) => (
          <div
            key={role}
            className="flex items-center gap-3 rounded-xl border border-ink-200/80 bg-white px-4 py-3 shadow-sm"
          >
            <div className="flex size-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              <ShieldCheck className="size-4" />
            </div>
            <div>
              <p className="text-xs font-semibold text-ink-800">{ROLE_LABELS[role]}</p>
              <p className="mt-0.5 text-[11px] text-ink-400">
                {role === "admin"
                  ? "Full workspace control"
                  : role === "csm"
                    ? "Manage accounts and insights"
                    : "Read-only access"}
              </p>
            </div>
          </div>
        ))}
      </div>

      <Card className="mb-4 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-400" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name or email…"
              className="pl-10"
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
              className="w-44"
            >
              <option value="">All roles</option>
              <option value="admin">Administrator</option>
              <option value="csm">CSM</option>
              <option value="viewer">Viewer</option>
            </Select>
            <Select
              value={activeRaw}
              onChange={(event) =>
                setParams({ active: event.target.value || null, page: null })
              }
              aria-label="Filter by status"
              className="w-36"
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
      </Card>

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
                  Add user
                </Button>
              )
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-ink-100 bg-ink-50/60 text-[11px] tracking-wide text-ink-500 uppercase">
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
                                  <span className="rounded-full bg-brand-100 px-1.5 py-0.5 text-[9px] font-semibold text-brand-700">
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
                            <button
                              type="button"
                              onClick={() => setEditing(user)}
                              className="rounded-lg p-1.5 text-ink-400 transition hover:bg-white hover:text-brand-700"
                              aria-label={`Edit ${user.name}`}
                            >
                              <Pencil className="size-4" />
                            </button>
                            {!isSelf && user.is_active ? (
                              <button
                                type="button"
                                onClick={() => setRevokeTarget(user)}
                                className="rounded-lg p-1.5 text-ink-400 transition hover:bg-white hover:text-amber-600"
                                aria-label={`Revoke sessions for ${user.name}`}
                                title="Revoke all sessions"
                              >
                                <KeyRound className="size-4" />
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
      />

      <EditUserDialog
        user={editing}
        currentUserId={currentUser?.id}
        onClose={() => setEditing(null)}
        onSaved={() => setReloadKey((value) => value + 1)}
      />

      <ConfirmDialog
        open={Boolean(revokeTarget)}
        title={`Revoke sessions for ${revokeTarget?.name ?? "this user"}?`}
        description="All of their refresh sessions will be invalidated immediately."
        confirmLabel="Revoke sessions"
        destructive
        isLoading={revoking}
        onConfirm={handleRevoke}
        onClose={() => setRevokeTarget(null)}
      />
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
