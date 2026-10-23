import type { Role } from "@/lib/api/types";

export type Permission =
  | "users:read"
  | "users:manage"
  | "customers:read"
  | "customers:write"
  | "customers:delete"
  | "interactions:read"
  | "interactions:write"
  | "interactions:delete"
  | "insights:read"
  | "insights:generate"
  | "dashboard:read";

const READ_ONLY: Permission[] = [
  "customers:read",
  "interactions:read",
  "insights:read",
  "dashboard:read",
];

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: [
    "users:read",
    "users:manage",
    "customers:read",
    "customers:write",
    "customers:delete",
    "interactions:read",
    "interactions:write",
    "interactions:delete",
    "insights:read",
    "insights:generate",
    "dashboard:read",
  ],
  csm: [
    ...READ_ONLY,
    "customers:write",
    "interactions:write",
    "interactions:delete",
    "insights:generate",
    "users:read",
  ],
  viewer: [...READ_ONLY],
};

export function can(role: Role | undefined, permission: Permission): boolean {
  return role ? ROLE_PERMISSIONS[role].includes(permission) : false;
}

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Administrator",
  csm: "Customer Success Manager",
  viewer: "Viewer",
};

export const ROLE_SHORT_LABELS: Record<Role, string> = {
  admin: "Admin",
  csm: "CSM",
  viewer: "Viewer",
};
