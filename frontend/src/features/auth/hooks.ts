import { can, type Permission } from "@/lib/permissions";
import { useAppSelector } from "@/store/hooks";

export function useAuth() {
  return useAppSelector((state) => state.auth);
}

export function usePermissions() {
  const user = useAppSelector((state) => state.auth.user);
  return {
    role: user?.role,
    canDo: (permission: Permission) => can(user?.role, permission),
    isAdmin: user?.role === "admin",
    canEdit: user?.role === "admin" || user?.role === "manager",
  };
}
