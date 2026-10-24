"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { logout } from "@/features/auth/authSlice";
import { useAuth } from "@/features/auth/hooks";
import { authApi } from "@/lib/api/auth";
import { getApiError } from "@/lib/api/errors";
import { useAppDispatch } from "@/store/hooks";

const schema = z
  .object({
    current_password: z.string().min(1, "Current password is required"),
    new_password: z.string().min(8, "At least 8 characters").max(72),
    confirm_password: z.string().min(8, "Confirm your new password"),
  })
  .refine((values) => values.new_password === values.confirm_password, {
    message: "Passwords do not match",
    path: ["confirm_password"],
  });

type FormValues = z.infer<typeof schema>;

export default function ChangePasswordPage() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { user } = useAuth();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      current_password: "",
      new_password: "",
      confirm_password: "",
    },
  });

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    try {
      await authApi.changePassword(values.current_password, values.new_password);
      await dispatch(logout());
      toast.success("Password changed. Sign in with your new password.");
      router.replace("/login");
      router.refresh();
    } catch (error) {
      setServerError(getApiError(error));
    }
  };

  return (
    <div>
      <div className="mb-8">
        <p className="text-[11px] font-semibold tracking-[0.16em] text-brand-700 uppercase">
          Password update required
        </p>
        <h1 className="mt-3 text-[30px] leading-tight font-semibold tracking-[-0.035em] text-ink-950">
          Set a new password
        </h1>
        <p className="mt-2 text-sm leading-6 text-ink-500">
          {user?.email ?? "Your account"} must use a new password before accessing the workspace.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <Field
          label="Temporary password"
          htmlFor="current_password"
          error={errors.current_password?.message}
          required
        >
          <Input
            id="current_password"
            type="password"
            autoComplete="current-password"
            {...register("current_password")}
          />
        </Field>
        <Field
          label="New password"
          htmlFor="new_password"
          error={errors.new_password?.message}
          hint="At least 8 characters, up to 72 bytes."
          required
        >
          <Input
            id="new_password"
            type="password"
            autoComplete="new-password"
            {...register("new_password")}
          />
        </Field>
        <Field
          label="Confirm new password"
          htmlFor="confirm_password"
          error={errors.confirm_password?.message}
          required
        >
          <Input
            id="confirm_password"
            type="password"
            autoComplete="new-password"
            {...register("confirm_password")}
          />
        </Field>
        {serverError ? (
          <div className="border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-700" role="alert">
            {serverError}
          </div>
        ) : null}
        <Button
          type="submit"
          className="h-11 w-full"
          isLoading={isSubmitting}
          leftIcon={<KeyRound className="size-4" />}
        >
          Change password
        </Button>
      </form>
    </div>
  );
}
