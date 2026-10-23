"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, Lock, Mail, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { Logo } from "@/components/ui/logo";
import { register as registerAction } from "@/features/auth/authSlice";
import { useAuth } from "@/features/auth/hooks";
import { cn } from "@/lib/utils";
import { useAppDispatch } from "@/store/hooks";

const schema = z
  .object({
    name: z.string().min(1, "Name is required").max(255),
    email: z.string().email("Enter a valid email address"),
    password: z.string().min(8, "At least 8 characters"),
    password_confirm: z.string().min(8, "Confirm your password"),
  })
  .refine((data) => data.password === data.password_confirm, {
    message: "Passwords do not match",
    path: ["password_confirm"],
  });

type FormValues = z.infer<typeof schema>;

export default function RegisterPage() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { status, initialized, user } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", email: "", password: "", password_confirm: "" },
  });

  useEffect(() => {
    if (initialized && user && status === "authenticated") {
      router.replace("/dashboard");
    }
  }, [initialized, user, status, router]);

  const onSubmit = async (values: FormValues) => {
    setFormError(null);
    const result = await dispatch(registerAction(values));
    if (registerAction.fulfilled.match(result)) {
      toast.success("Account created");
      router.replace("/dashboard");
      router.refresh();
    } else if (registerAction.rejected.match(result)) {
      const message = result.payload ?? "Unable to create account";
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
            Create your account
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            New accounts are created as viewers by default
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <Field label="Full name" htmlFor="name" error={errors.name?.message} required>
            <div className="relative">
              <UserRound className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-400" />
              <Input
                id="name"
                autoComplete="name"
                placeholder="Taylor Rivera"
                className="pl-10"
                invalid={Boolean(errors.name)}
                {...register("name")}
              />
            </div>
          </Field>

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
                autoComplete="new-password"
                placeholder="At least 8 characters"
                className="pl-10"
                invalid={Boolean(errors.password)}
                {...register("password")}
              />
            </div>
          </Field>

          <Field
            label="Confirm password"
            htmlFor="password_confirm"
            error={errors.password_confirm?.message}
            required
          >
            <div className="relative">
              <Lock className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-400" />
              <Input
                id="password_confirm"
                type="password"
                autoComplete="new-password"
                placeholder="Re-enter your password"
                className="pl-10"
                invalid={Boolean(errors.password_confirm)}
                {...register("password_confirm")}
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
            Create account
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-ink-500">
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-medium text-brand-700 transition hover:text-brand-800"
          >
            Sign in
          </Link>
        </p>
      </div>
    </Card>
  );
}
