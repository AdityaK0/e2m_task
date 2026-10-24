"use client";

import {
  ArrowUpRight,
  CalendarDays,
  LayoutDashboard,
  Lightbulb,
  LogOut,
  Menu,
  Settings2,
  ShieldCheck,
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
import { Logo, LogoMark } from "./ui/logo";
import { Spinner } from "./ui/spinner";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/interactions", label: "Meetings", icon: CalendarDays },
  { href: "/insights", label: "AI Insights", icon: Lightbulb },
];

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({
  href,
  label,
  icon: Icon,
  active,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  active: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex h-9 items-center gap-2.5  px-2.5 text-[13px] font-medium transition-colors",
        active
          ? "bg-ink-950 text-white"
          : "text-ink-600 hover:bg-ink-100/80 hover:text-ink-950",
      )}
    >
      <Icon
        className={cn(
          "size-4 transition-colors",
          active ? "text-white/75" : "text-ink-400 group-hover:text-ink-600",
        )}
      />
      <span className="truncate">{label}</span>
      {active ? (
        <span className="ml-auto size-1.5 bg-brand-400" aria-hidden="true" />
      ) : null}
    </Link>
  );
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
      <div className="flex h-[68px] items-center px-5">
        <Logo href="/dashboard" />
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-3 scroll-thin" aria-label="Main">
        <p className="px-2.5 pb-2 text-[10px] font-semibold tracking-[0.14em] text-ink-400 uppercase">
          Workspace
        </p>
        <div className="space-y-0.5">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.href}
              {...item}
              active={isActive(pathname, item.href)}
              onNavigate={onNavigate}
            />
          ))}
        </div>

        {isAdmin ? (
          <>
            <p className="px-2.5 pt-6 pb-2 text-[10px] font-semibold tracking-[0.14em] text-ink-400 uppercase">
              Administration
            </p>
            <NavLink
              href="/admin/users"
              label="Team"
              icon={ShieldCheck}
              active={isActive(pathname, "/admin/users")}
              onNavigate={onNavigate}
            />
            <NavLink
              href="/settings"
              label="Settings"
              icon={Settings2}
              active={isActive(pathname, "/settings")}
              onNavigate={onNavigate}
            />
          </>
        ) : null}
      </nav>

      <div className="px-3 pb-4">
        <div className=" border border-ink-200/80 bg-white p-1 ">
          <div className="flex items-center gap-2.5 px-2 py-2">
            <Avatar name={user?.name ?? "User"} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-ink-900">
                {user?.name ?? "—"}
              </p>
              <p className="mt-0.5 truncate text-[10px] text-ink-500">
                {user ? ROLE_LABELS[user.role] : ""}
              </p>
            </div>
            <Link
              href="/profile"
              onClick={onNavigate}
              className=" p-1.5 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-800"
              aria-label="Profile settings"
            >
              <UserRound className="size-3.5" />
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              className=" p-1.5 text-ink-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
              aria-label="Sign out"
            >
              <LogOut className="size-3.5" />
            </button>
          </div>
        </div>
        <p className="mt-3 px-1 text-[10px] leading-4 text-ink-400">
          E2M Insights
          <br />
          Customer Success &amp; AI Insights
        </p>
      </div>
    </div>
  );
}

function Splash({ label = "Preparing your workspace" }: { label?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f7f7f5]">
      <div className="flex flex-col items-center gap-4">
        <LogoMark className="size-10" />
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
    if (initialized && status === "authenticated" && user?.must_change_password) {
      router.replace("/change-password");
    } else if (initialized && status !== "authenticated") {
      const next = encodeURIComponent(pathname || "/dashboard");
      router.replace(`/login?next=${next}`);
    }
  }, [initialized, status, user, pathname, router]);

  if (
    !initialized ||
    status === "loading" ||
    !user ||
    user.must_change_password
  ) {
    return <Splash />;
  }

  return (
    <div className="min-h-screen bg-[#f7f7f5] lg:flex">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[244px] border-r border-ink-200/80 bg-[#fbfbfa] lg:block">
        <SidebarContent />
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-ink-950/35 backdrop-blur-[2px]"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation"
          />
          <aside className="animate-fade-in absolute inset-y-0 left-0 w-72 max-w-[85vw] border-r border-ink-200 bg-[#fbfbfa] ">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="absolute top-4 right-3  p-2 text-ink-500 hover:bg-ink-100 hover:text-ink-900"
              aria-label="Close navigation"
            >
              <X className="size-4" />
            </button>
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      ) : null}

      <div className="min-w-0 flex-1 lg:pl-[244px]">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-ink-200/80 bg-[#f7f7f5]/90 px-4 backdrop-blur-xl lg:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="-ml-2  p-2 text-ink-600 hover:bg-ink-100"
            aria-label="Open navigation"
          >
            <Menu className="size-5" />
          </button>
          <Logo href="/dashboard" />
          <Link href="/profile" className="" aria-label="Open profile">
            <Avatar name={user.name} size="sm" />
          </Link>
        </header>

        <main className="mx-auto w-full max-w-[1440px] animate-fade-in px-4 py-6 sm:px-6 lg:px-9 lg:py-9">
          {children}
        </main>

        <footer className="mx-auto flex w-full max-w-[1440px] flex-wrap items-center justify-between gap-2 px-4 pb-6 text-[11px] text-ink-400 sm:px-6 lg:px-9">
          <span>E2M Insights</span>
          <Link
            href="/profile"
            className="inline-flex items-center gap-1 transition-colors hover:text-ink-800"
          >
            Account settings
            <ArrowUpRight className="size-3" />
          </Link>
        </footer>
      </div>
    </div>
  );
}
