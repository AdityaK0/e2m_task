"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Clipboard, Eye, EyeOff } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/field";
import { getApiError } from "@/lib/api/errors";
import type { Role, User, UserCredentials } from "@/lib/api/types";
import { usersApi } from "@/lib/api/users";
import { ROLE_LABELS } from "@/lib/permissions";

const ROLE_OPTIONS: Array<{ value: Role; label: string }> = [
  { value: "admin", label: ROLE_LABELS.admin },
  { value: "manager", label: ROLE_LABELS.manager },
];

const createSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  email: z.string().email("Enter a valid email address"),
  password: z
    .string()
    .max(72)
    .refine((password) => !password || password.length >= 8, "At least 8 characters"),
  role: z.enum(["admin", "manager"]),
  auto_assign_new_customers: z.boolean(),
});

type CreateValues = z.infer<typeof createSchema>;

const editSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  role: z.enum(["admin", "manager"]),
});

type EditValues = z.infer<typeof editSchema>;

export function CreateUserDialog({
  open,
  onClose,
  onSaved,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  onCreated: (credentials: UserCredentials) => void;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      role: "manager",
      auto_assign_new_customers: false,
    },
  });
  const role = watch("role");

  useEffect(() => {
    if (open) {
      reset({
        name: "",
        email: "",
        password: "",
        role: "manager",
        auto_assign_new_customers: false,
      });
      setServerError(null);
    }
  }, [open, reset]);

  const onSubmit = async (values: CreateValues) => {
    setServerError(null);
    try {
      const credentials = await usersApi.create({
        ...values,
        password: values.password || undefined,
        auto_assign_new_customers:
          values.role === "manager" && values.auto_assign_new_customers,
      });
      reset({
        name: "",
        email: "",
        password: "",
        role: "manager",
        auto_assign_new_customers: false,
      });
      toast.success("User created");
      onSaved();
      onCreated(credentials);
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
      title="Create user"
      description="Create an account and assign a role. The user will change their password at first sign-in."
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
          hint="Optional. Leave blank to generate a strong temporary password."
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
        {role === "manager" ? (
          <label className="flex items-start gap-2 text-xs text-ink-600">
            <input
              type="checkbox"
              className="mt-0.5"
              {...register("auto_assign_new_customers")}
            />
            Automatically assign new customers to this manager
          </label>
        ) : null}
      </form>
    </Dialog>
  );
}

export function UserCredentialsDialog({
  credentials,
  onClose,
}: {
  credentials: UserCredentials | null;
  onClose: () => void;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!credentials) setVisible(false);
  }, [credentials]);

  const copyCredentials = async () => {
    if (!credentials) return;
    try {
      await navigator.clipboard.writeText(
        `Email: ${credentials.user.email}\nPassword: ${credentials.password}`,
      );
      toast.success("Credentials copied");
    } catch {
      toast.error("Could not access the clipboard. Copy the credentials manually.");
    }
  };

  return (
    <Dialog
      open={Boolean(credentials)}
      onClose={onClose}
      title="User credentials"
      description="Save these credentials and share them securely."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Close</Button>
          <Button onClick={() => void copyCredentials()} leftIcon={<Clipboard className="size-4" />}>
            Copy credentials
          </Button>
        </>
      }
    >
      {credentials ? (
        <div className="space-y-4">
          <Field label="Email">
            <Input value={credentials.user.email} readOnly />
          </Field>
          <Field label="Temporary password" htmlFor="created-password">
            <div className="flex gap-2">
              <Input
                id="created-password"
                type={visible ? "text" : "password"}
                value={credentials.password}
                readOnly
              />
              <Button
                variant="secondary"
                aria-label={visible ? "Hide password" : "Show password"}
                onClick={() => setVisible((value) => !value)}
              >
                {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </Button>
            </div>
          </Field>
          <p className="border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
            This password is shown only once. It will not appear in user lists or details.
          </p>
        </div>
      ) : null}
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
    defaultValues: { name: "", role: "manager" },
  });

  useEffect(() => {
    if (user) {
      reset({
        name: user.name,
        role: user.role,
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
      description="Update profile details and role. Use the row actions to change account status."
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

      </form>
    </Dialog>
  );
}
