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
import { Field, Input } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { login } from "@/features/auth/authSlice";
import { useAuth } from "@/features/auth/hooks";
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
    <div>
      <div className="mb-8">
        <p className="text-[11px] font-semibold tracking-[0.16em] text-brand-700 uppercase">
          Account access
        </p>
        <h1 className="mt-3 text-[30px] leading-tight font-semibold tracking-[-0.035em] text-ink-950">
          Welcome back
        </h1>
        <p className="mt-2 text-sm leading-6 text-ink-500">
          Sign in to E2M Client Insights.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
        <Field label="Email" htmlFor="email" error={errors.email?.message} required>
          <div className="relative">
            <Mail className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-400" />
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              className="h-11 pl-10"
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
              className="h-11 pl-10"
              invalid={Boolean(errors.password)}
              {...register("password")}
            />
          </div>
        </Field>

        {formError ? (
          <div
            className=" border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs leading-relaxed text-rose-700"
            role="alert"
          >
            {formError}
          </div>
        ) : null}

        <Button
          type="submit"
          className="h-11 w-full"
          isLoading={isSubmitting}
          rightIcon={<ArrowRight className="size-4" />}
        >
          Sign in
        </Button>
      </form>

      <div className="mt-8 border-t border-ink-100 pt-5 text-center text-xs text-ink-500">
        New to the workspace?{" "}
        <Link
          href="/register"
          className="font-medium text-ink-900 underline decoration-ink-300 underline-offset-4 transition hover:decoration-ink-900"
        >
          Create an account
        </Link>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-72 items-center justify-center">
          <Spinner />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
