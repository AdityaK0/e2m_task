"use client";

import {
  ArrowUpRight,
  ContactRound,
  LayoutDashboard,
  LogOut,
  Menu,
  MessagesSquare,
  ShieldCheck,
  Sparkles,
  UserRound,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { logout } from "@/features/auth/authSlice";
import { useAuth } from "@/features/auth/hooks";
import { ROLE_LABELS } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { useAppDispatch } from "@/store/hooks";

import { Avatar } from "./ui/avatar";
import { LogoMark } from "./ui/logo";
import { Spinner } from "./ui/spinner";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/interactions", label: "Interactions", icon: MessagesSquare },
];

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const handleLogout = async () => {
    await dispatch(logout());
    toast.success("Signed out");
    router.replace("/login");
    router.refresh();
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-5 pt-5 pb-6">
        <LogoMark className="size-9 shadow-brand-950/40" />
        <div className="leading-none">
          <p className="text-[15px] font-semibold tracking-tight text-white">Northstar</p>
          <p className="mt-1 text-[10px] font-medium tracking-[0.18em] text-white/40 uppercase">
            Customer Success
          </p>
        </div>
      </div>

      <div className="mx-3 mb-5 rounded-xl border border-white/8 bg-white/[0.04] px-3 py-2.5">
        <div className="flex items-center gap-2 text-[11px] font-medium text-white/60">
          <Sparkles className="size-3.5 text-brand-300" />
          AI-native workspace
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-white/35">
          Meetings into decisions, automatically.
        </p>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 scroll-thin" aria-label="Main">
        <p className="px-2.5 pb-2 text-[10px] font-semibold tracking-[0.16em] text-white/30 uppercase">
          Workspace
        </p>
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group flex items-center gap-3 rounded-xl px-2.5 py-2.5 text-[13px] font-medium transition-all",
                active
                  ? "bg-white/[0.09] text-white shadow-sm ring-1 ring-white/10"
                  : "text-white/55 hover:bg-white/[0.05] hover:text-white/90",
              )}
            >
              <Icon
                className={cn(
                  "size-4.5 transition",
                  active ? "text-brand-300" : "text-white/35 group-hover:text-white/60",
                )}
              />
              {item.label}
              {active ? (
                <span className="ml-auto size-1.5 rounded-full bg-brand-300 shadow-[0_0_8px_2px] shadow-brand-400/50" />
              ) : null}
            </Link>
          );
        })}

        {isAdmin ? (
          <>
            <p className="px-2.5 pt-5 pb-2 text-[10px] font-semibold tracking-[0.16em] text-white/30 uppercase">
              Administration
            </p>
            <Link
              href="/admin/users"
              onClick={onNavigate}
              aria-current={isActive(pathname, "/admin/users") ? "page" : undefined}
              className={cn(
                "group flex items-center gap-3 rounded-xl px-2.5 py-2.5 text-[13px] font-medium transition-all",
                isActive(pathname, "/admin/users")
                  ? "bg-white/[0.09] text-white shadow-sm ring-1 ring-white/10"
                  : "text-white/55 hover:bg-white/[0.05] hover:text-white/90",
              )}
            >
              <ShieldCheck
                className={cn(
                  "size-4.5",
                  isActive(pathname, "/admin/users")
                    ? "text-brand-300"
                    : "text-white/35 group-hover:text-white/60",
                )}
              />
              Team & access
            </Link>
          </>
        ) : null}
      </nav>

      <div className="border-t border-white/8 p-3">
        <div className="rounded-xl bg-white/[0.04] p-2.5">
          <div className="flex items-center gap-2.5">
            <Avatar name={user?.name ?? "User"} size="sm" className="ring-white/10" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-white/90">
                {user?.name ?? "—"}
              </p>
              <p className="truncate text-[10px] text-white/40">
                {user ? ROLE_LABELS[user.role] : ""}
              </p>
            </div>
            <Link
              href="/profile"
              onClick={onNavigate}
              className="rounded-lg p-1.5 text-white/40 transition hover:bg-white/10 hover:text-white"
              aria-label="Profile settings"
            >
              <UserRound className="size-4" />
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-lg p-1.5 text-white/40 transition hover:bg-white/10 hover:text-rose-300"
              aria-label="Sign out"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
        <p className="mt-3 flex items-center justify-center gap-1 text-[10px] text-white/25">
          <ContactRound className="size-3" />
          Northstar CS · v1.0
        </p>
      </div>
    </div>
  );
}

function Splash({ label = "Preparing your workspace" }: { label?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-50">
      <div className="flex flex-col items-center gap-4">
        <LogoMark className="size-11" />
        <div className="flex items-center gap-2 text-xs font-medium text-ink-500">
          <Spinner className="size-3.5" />
          {label}…
        </div>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, initialized, status } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (initialized && status !== "authenticated") {
      const next = encodeURIComponent(pathname || "/dashboard");
      router.replace(`/login?next=${next}`);
    }
  }, [initialized, status, pathname, router]);

  if (!initialized || status === "loading" || !user) {
    return <Splash />;
  }

  return (
    <div className="min-h-screen lg:flex">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 bg-ink-950 bg-[radial-gradient(circle_at_20%_0%,rgba(99,102,241,0.20),transparent_45%)] shadow-sidebar lg:block">
        <SidebarContent />
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-ink-950/50 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation"
          />
          <aside className="animate-fade-in absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-ink-950 bg-[radial-gradient(circle_at_20%_0%,rgba(99,102,241,0.20),transparent_45%)] shadow-sidebar">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="absolute top-4 right-3 rounded-lg p-2 text-white/50 hover:bg-white/10 hover:text-white"
              aria-label="Close navigation"
            >
              <X className="size-4" />
            </button>
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      ) : null}

      <div className="min-w-0 flex-1 lg:pl-64">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-ink-200/70 bg-white/75 px-4 backdrop-blur-xl lg:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="rounded-lg p-2 text-ink-600 hover:bg-ink-100"
            aria-label="Open navigation"
          >
            <Menu className="size-5" />
          </button>
          <div className="flex items-center gap-2">
            <LogoMark className="size-7" />
            <span className="text-sm font-semibold text-ink-900">Northstar</span>
          </div>
          <Link
            href="/profile"
            className="rounded-full"
            aria-label="Open profile"
          >
            <Avatar name={user.name} size="sm" />
          </Link>
        </header>

        <main className="mx-auto w-full max-w-[1440px] animate-fade-in px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>

        <footer className="mx-auto flex w-full max-w-[1440px] flex-wrap items-center justify-between gap-2 px-4 pb-6 text-[11px] text-ink-400 sm:px-6 lg:px-8">
          <span>Northstar Customer Success Platform</span>
          <Link
            href="/profile"
            className="inline-flex items-center gap-1 transition hover:text-brand-700"
          >
            Account settings
            <ArrowUpRight className="size-3" />
          </Link>
        </footer>
      </div>
    </div>
  );
}
