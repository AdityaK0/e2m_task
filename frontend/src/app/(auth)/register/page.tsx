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
import { Field, Input } from "@/components/ui/field";
import { register as registerAction } from "@/features/auth/authSlice";
import { useAuth } from "@/features/auth/hooks";
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
    <div>
      <div className="mb-8">
        <p className="text-[11px] font-semibold tracking-[0.16em] text-brand-700 uppercase">
          Create account
        </p>
        <h1 className="mt-3 text-[30px] leading-tight font-semibold tracking-[-0.035em] text-ink-950">
          Join the workspace
        </h1>
        <p className="mt-2 text-sm leading-6 text-ink-500">
          New accounts start as managers and can work with customers assigned
          to them. An administrator can manage assignments and roles.
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
              className="h-11 pl-10"
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
              autoComplete="new-password"
              placeholder="At least 8 characters"
              className="h-11 pl-10"
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
              className="h-11 pl-10"
              invalid={Boolean(errors.password_confirm)}
              {...register("password_confirm")}
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
          isLoading={isSubmitting || status === "loading"}
          rightIcon={<ArrowRight className="size-4" />}
        >
          Create account
        </Button>
      </form>

      <div className="mt-8 border-t border-ink-100 pt-5 text-center text-xs text-ink-500">
        Already have an account?{" "}
        <Link
          href="/login"
          className="font-medium text-ink-900 underline decoration-ink-300 underline-offset-4 transition hover:decoration-ink-900"
        >
          Sign in
        </Link>
      </div>
    </div>
  );
}
