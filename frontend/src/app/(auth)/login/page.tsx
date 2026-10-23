"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, Lock, Mail } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { Logo } from "@/components/ui/logo";
import { Spinner } from "@/components/ui/spinner";
import { login } from "@/features/auth/authSlice";
import { useAuth } from "@/features/auth/hooks";
import { getApiError } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import { useAppDispatch } from "@/store/hooks";

const schema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

type FormValues = z.infer<typeof schema>;

function safeRedirect(value: string | null): string {
  if (
    value &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("\\")
  ) {
    return value;
  }
  return "/dashboard";
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const dispatch = useAppDispatch();
  const { status, initialized, user } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);

  const next = safeRedirect(searchParams.get("next"));

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  useEffect(() => {
    if (initialized && user && status === "authenticated") {
      router.replace(next);
    }
  }, [initialized, user, status, next, router]);

  const onSubmit = async (values: FormValues) => {
    setFormError(null);
    const result = await dispatch(login(values));
    if (login.fulfilled.match(result)) {
      toast.success("Welcome back");
      router.replace(next);
      router.refresh();
    } else if (login.rejected.match(result)) {
      const message = result.payload ?? "Unable to sign in";
      setFormError(message);
    }
  };

  return (
    <Card className="border-ink-200/80 shadow-float">
      <div className="px-6 py-7 sm:px-8 sm:py-9">
        <div className="mb-7 text-center">
          <div className="mb-4 flex justify-center">
            <Logo href="/login" compact />
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-ink-900 sm:text-2xl">
            Sign in to Northstar
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            Access your customer success workspace
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <Field label="Email" htmlFor="email" error={errors.email?.message} required>
            <div className="relative">
              <Mail className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-400" />
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@company.com"
                className="pl-10"
                invalid={Boolean(errors.email)}
                {...register("email")}
              />
            </div>
          </Field>

          <Field label="Password" htmlFor="password" error={errors.password?.message} required>
            <div className="relative">
              <Lock className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-400" />
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="Enter your password"
                className="pl-10"
                invalid={Boolean(errors.password)}
                {...register("password")}
              />
            </div>
          </Field>

          {formError ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-700">
              {formError}
            </div>
          ) : null}

          <Button
            type="submit"
            className={cn("w-full", (isSubmitting || status === "loading") && "opacity-90")}
            isLoading={isSubmitting || status === "loading"}
            rightIcon={<ArrowRight className="size-4" />}
          >
            Sign in
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-ink-500">
          Don&apos;t have an account?{" "}
          <Link
            href="/register"
            className="font-medium text-brand-700 transition hover:text-brand-800"
          >
            Create one
          </Link>
        </p>
      </div>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <Card className="flex min-h-72 items-center justify-center border-ink-200/80 shadow-float">
          <Spinner />
        </Card>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
