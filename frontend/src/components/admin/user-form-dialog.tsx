"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/field";
import { getApiError } from "@/lib/api/errors";
import type { Role, User } from "@/lib/api/types";
import { usersApi } from "@/lib/api/users";
import { ROLE_LABELS } from "@/lib/permissions";

const ROLE_OPTIONS: Array<{ value: Role; label: string }> = [
  { value: "admin", label: ROLE_LABELS.admin },
  { value: "manager", label: ROLE_LABELS.manager },
];

const createSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(8, "At least 8 characters").max(72),
  role: z.enum(["admin", "manager"]),
});

type CreateValues = z.infer<typeof createSchema>;

const editSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  role: z.enum(["admin", "manager"]),
  active: z.enum(["true", "false"]),
});

type EditValues = z.infer<typeof editSchema>;

export function CreateUserDialog({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: { name: "", email: "", password: "", role: "manager" },
  });

  useEffect(() => {
    if (open) {
      reset({ name: "", email: "", password: "", role: "manager" });
      setServerError(null);
    }
  }, [open, reset]);

  const onSubmit = async (values: CreateValues) => {
    setServerError(null);
    try {
      await usersApi.create(values);
      toast.success("User created");
      onSaved();
      onClose();
    } catch (error) {
      const message = getApiError(error);
      setServerError(message);
      toast.error(message);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add team member"
      description="Create an account and assign a role. New users can sign in immediately."
      dismissible={!isSubmitting}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="create-user-form"
            isLoading={isSubmitting}
          >
            Create user
          </Button>
        </>
      }
    >
      <form
        id="create-user-form"
        onSubmit={handleSubmit(onSubmit)}
        className="space-y-4"
        noValidate
      >
        {serverError ? (
          <div className=" border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-700">
            {serverError}
          </div>
        ) : null}

        <Field label="Full name" htmlFor="new-name" error={errors.name?.message} required>
          <Input id="new-name" placeholder="Morgan Chen" {...register("name")} />
        </Field>

        <Field label="Email" htmlFor="new-email" error={errors.email?.message} required>
          <Input
            id="new-email"
            type="email"
            placeholder="morgan@company.com"
            {...register("email")}
          />
        </Field>

        <Field
          label="Temporary password"
          htmlFor="new-password"
          error={errors.password?.message}
          hint="At least 8 characters. Share it securely; the user can change it later."
          required
        >
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            {...register("password")}
          />
        </Field>

        <Field label="Role" htmlFor="new-role" error={errors.role?.message} required>
          <Select id="new-role" {...register("role")}>
            {ROLE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
      </form>
    </Dialog>
  );
}

export function EditUserDialog({
  user,
  currentUserId,
  onClose,
  onSaved,
}: {
  user: User | null;
  currentUserId: number | undefined;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isSelf = user?.id === currentUserId;
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<EditValues>({
    resolver: zodResolver(editSchema),
    defaultValues: { name: "", role: "manager", active: "true" },
  });

  useEffect(() => {
    if (user) {
      reset({
        name: user.name,
        role: user.role,
        active: user.is_active ? "true" : "false",
      });
      setServerError(null);
    }
  }, [user, reset]);

  const onSubmit = async (values: EditValues) => {
    if (!user) return;
    setServerError(null);
    try {
      await usersApi.update(user.id, {
        name: values.name,
        role: values.role,
        is_active: values.active === "true",
      });
      toast.success("User updated");
      onSaved();
      onClose();
    } catch (error) {
      const message = getApiError(error);
      setServerError(message);
      toast.error(message);
    }
  };

  return (
    <Dialog
      open={Boolean(user)}
      onClose={onClose}
      title={user ? `Edit ${user.name}` : "Edit user"}
      description="Update profile details, role, and account status."
      dismissible={!isSubmitting}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="edit-user-form"
            isLoading={isSubmitting}
          >
            Save changes
          </Button>
        </>
      }
    >
      <form
        id="edit-user-form"
        onSubmit={handleSubmit(onSubmit)}
        className="space-y-4"
        noValidate
      >
        {serverError ? (
          <div className=" border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-700">
            {serverError}
          </div>
        ) : null}

        {isSelf ? (
          <div className="border border-ink-200 bg-ink-50 px-3.5 py-2.5 text-xs text-ink-700">
            You cannot change your own role or active status.
          </div>
        ) : null}

        <Field label="Full name" htmlFor="edit-name" error={errors.name?.message} required>
          <Input id="edit-name" {...register("name")} />
        </Field>

        <Field label="Email">
          <Input value={user?.email ?? ""} disabled />
          <p className="hint">Email is the account identifier and cannot be edited.</p>
        </Field>

        <Field label="Role" htmlFor="edit-role" error={errors.role?.message} required>
          <Select id="edit-role" disabled={isSelf} {...register("role")}>
            {ROLE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Account status"
          htmlFor="edit-active"
          error={errors.active?.message}
          required
        >
          <Select id="edit-active" disabled={isSelf} {...register("active")}>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </Select>
        </Field>
      </form>
    </Dialog>
  );
}
