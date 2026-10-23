import { AlertCircle, CheckCircle2, Info, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

const VARIANTS = {
  error: {
    className: "border-rose-200 bg-rose-50 text-rose-800",
    icon: AlertCircle,
  },
  warning: {
    className: "border-amber-200 bg-amber-50 text-amber-900",
    icon: TriangleAlert,
  },
  success: {
    className: "border-emerald-200 bg-emerald-50 text-emerald-800",
    icon: CheckCircle2,
  },
  info: {
    className: "border-sky-200 bg-sky-50 text-sky-800",
    icon: Info,
  },
};

export function Alert({
  variant = "info",
  title,
  children,
  action,
  className,
}: {
  variant?: keyof typeof VARIANTS;
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const config = VARIANTS[variant];
  const Icon = config.icon;
  return (
    <div
      className={cn(
        "flex gap-3 rounded-xl border px-4 py-3 text-sm leading-relaxed",
        config.className,
        className,
      )}
      role={variant === "error" ? "alert" : "status"}
    >
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
