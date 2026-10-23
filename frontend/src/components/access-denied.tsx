import { LockKeyhole } from "lucide-react";
import Link from "next/link";

import { buttonStyles } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function AccessDenied({
  title = "You don't have access to this page",
  description = "Your role doesn't include permission for this action. Ask an administrator if you believe you need access.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <Card className="mx-auto max-w-lg px-6 py-10 text-center">
      <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-ink-100 text-ink-500">
        <LockKeyhole className="size-5" />
      </div>
      <h1 className="text-lg font-semibold text-ink-900">{title}</h1>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-500">
        {description}
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Link href="/dashboard" className={buttonStyles({ variant: "secondary" })}>
          Back to dashboard
        </Link>
      </div>
    </Card>
  );
}
