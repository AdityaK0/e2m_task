"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Save } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button, buttonStyles } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import type { CustomerPayload } from "@/lib/api/customers";
import { getApiError } from "@/lib/api/errors";
import type { Customer, CustomerDetail, CustomerStatus, UserOption } from "@/lib/api/types";
import { usersApi } from "@/lib/api/users";
import { CUSTOMER_STATUS_OPTIONS } from "@/lib/labels";
import { usePermissions } from "@/features/auth/hooks";
import { createCustomer, updateCustomer } from "@/features/customers/customersSlice";
import { useAppDispatch } from "@/store/hooks";

const emailPattern = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const schema = z.object({
  name: z.string().trim().min(1, "Customer name is required").max(200),
  company: z.string().max(200),
  status: z.enum(["prospect", "onboarding", "active", "at_risk", "churned"]),
  health_score: z
    .string()
    .refine(
      (value) =>
        value === "" ||
        (/^\d+$/.test(value) && Number(value) >= 0 && Number(value) <= 100),
      "Health score must be a whole number between 0 and 100",
    ),
  manager_ids: z.array(z.string()),
  contact_name: z.string().max(160),
  contact_email: z
    .string()
    .max(254)
    .refine(
      (value) => value === "" || emailPattern.test(value),
      "Enter a valid email address",
    ),
  contact_phone: z.string().max(50),
  industry: z.string().max(120),
  website: z.string().max(255),
  notes: z.string().max(20000),
});

type FormValues = z.infer<typeof schema>;

function nullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function toDefaults(customer?: Customer | null): FormValues {
  return {
    name: customer?.name ?? "",
    company: customer?.company ?? "",
    status: customer?.status ?? "prospect",
    health_score:
      customer?.health_score === null || customer?.health_score === undefined
        ? ""
        : String(customer.health_score),
    manager_ids: customer?.assigned_managers.map((manager) => String(manager.id)) ?? [],
    contact_name: customer?.contact_name ?? "",
    contact_email: customer?.contact_email ?? "",
    contact_phone: customer?.contact_phone ?? "",
    industry: customer?.industry ?? "",
    website: customer?.website ?? "",
    notes: customer?.notes ?? "",
  };
}

export function CustomerForm({
  customer,
  mode,
}: {
  customer?: CustomerDetail | null;
  mode: "create" | "edit";
}) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { isAdmin } = usePermissions();
  const [managers, setManagers] = useState<UserOption[]>([]);
  const [serverError, setServerError] = useState<string | null>(null);
  const [assignManagersNow, setAssignManagersNow] = useState(false);

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: toDefaults(customer),
  });

  useEffect(() => {
    reset(toDefaults(customer));
  }, [customer, reset]);

  useEffect(() => {
    if (!isAdmin) return;
    usersApi
      .options()
      .then(setManagers)
      .catch((error) => toast.error(getApiError(error)));
  }, [isAdmin]);

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    const payload: CustomerPayload = {
      name: values.name.trim(),
      company: nullable(values.company),
      contact_name: nullable(values.contact_name),
      contact_email: nullable(values.contact_email),
      contact_phone: nullable(values.contact_phone),
      industry: nullable(values.industry),
      website: nullable(values.website),
      status: values.status as CustomerStatus,
      health_score:
        values.health_score === "" ? null : Number(values.health_score),
      manager_ids:
        mode === "create" && isAdmin && assignManagersNow
          ? values.manager_ids.map(Number)
          : undefined,
      notes: nullable(values.notes),
    };

    try {
      if (mode === "create") {
        const created: Customer = await dispatch(createCustomer(payload)).unwrap();
        toast.success("Customer created");
        router.push(`/customers/${created.id}`);
      } else if (customer) {
        await dispatch(updateCustomer({ id: customer.id, payload })).unwrap();
        toast.success("Customer updated");
        router.push(`/customers/${customer.id}`);
      }
      router.refresh();
    } catch (error) {
      const message = getApiError(error);
      setServerError(message);
      toast.error(message);
    }
  };

  const backHref =
    mode === "edit" && customer ? `/customers/${customer.id}` : "/customers";

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
      {serverError ? (
        <div className=" border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {serverError}
        </div>
      ) : null}

      <Card>
        <CardHeader
          title="Customer profile"
          description="Core account information and ownership"
        />
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <Field
            label="Customer name"
            htmlFor="name"
            error={errors.name?.message}
            required
            className="sm:col-span-2"
          >
            <Input
              id="name"
              placeholder="Acme Corporation"
              invalid={Boolean(errors.name)}
              {...register("name")}
            />
          </Field>

          <Field label="Company" htmlFor="company" error={errors.company?.message}>
            <Input
              id="company"
              placeholder="Legal or trading name"
              invalid={Boolean(errors.company)}
              {...register("company")}
            />
          </Field>

          <Field label="Industry" htmlFor="industry" error={errors.industry?.message}>
            <Input
              id="industry"
              placeholder="SaaS, Fintech, Healthcare…"
              invalid={Boolean(errors.industry)}
              {...register("industry")}
            />
          </Field>

          <Field label="Status" htmlFor="status" error={errors.status?.message} required>
            <Select id="status" {...register("status")}>
              {CUSTOMER_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Health score"
            htmlFor="health_score"
            error={errors.health_score?.message}
            hint="0–100. Leave blank if not assessed."
          >
            <Input
              id="health_score"
              type="number"
              min={0}
              max={100}
              step={1}
              inputMode="numeric"
              placeholder="e.g. 75"
              invalid={Boolean(errors.health_score)}
              {...register("health_score")}
            />
          </Field>

          {isAdmin && mode === "create" ? (
            <div className="space-y-3 sm:col-span-2">
              <label className="flex items-center gap-2 text-sm text-ink-700">
                <input
                  type="checkbox"
                  checked={assignManagersNow}
                  onChange={(event) => setAssignManagersNow(event.target.checked)}
                  className="size-4 accent-brand-600"
                />
                Assign managers now
              </label>
              {assignManagersNow ? (
                <Field
                  label="Managers"
                  htmlFor="manager_ids"
                  hint="Select zero or more active managers. You can also assign managers after creating the customer."
                >
                  <select
                    id="manager_ids"
                    multiple
                    className="min-h-28 w-full border border-ink-200 bg-white p-2 text-sm"
                    {...register("manager_ids")}
                  >
                    {managers.map((manager) => (
                      <option key={manager.id} value={manager.id}>
                        {manager.name}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : (
                <p className="hint">
                  You can also assign managers after creating the customer.
                </p>
              )}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader
          title="Primary contact"
          description="Who you usually speak with at this account"
        />
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <Field label="Contact name" htmlFor="contact_name" error={errors.contact_name?.message}>
            <Input
              id="contact_name"
              placeholder="Jordan Lee"
              invalid={Boolean(errors.contact_name)}
              {...register("contact_name")}
            />
          </Field>

          <Field label="Contact email" htmlFor="contact_email" error={errors.contact_email?.message}>
            <Input
              id="contact_email"
              type="email"
              placeholder="jordan@acme.com"
              invalid={Boolean(errors.contact_email)}
              {...register("contact_email")}
            />
          </Field>

          <Field label="Contact phone" htmlFor="contact_phone" error={errors.contact_phone?.message}>
            <Input
              id="contact_phone"
              placeholder="+1 555 0100"
              invalid={Boolean(errors.contact_phone)}
              {...register("contact_phone")}
            />
          </Field>

          <Field label="Website" htmlFor="website" error={errors.website?.message}>
            <Input
              id="website"
              placeholder="https://acme.com"
              invalid={Boolean(errors.website)}
              {...register("website")}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader
          title="Account notes"
          description="Context, history, and anything the team should know"
        />
        <CardContent>
          <Field label="Notes" htmlFor="notes" error={errors.notes?.message}>
            <Textarea
              id="notes"
              rows={6}
              placeholder="Relationship context, renewal timeline, stakeholder map…"
              invalid={Boolean(errors.notes)}
              {...register("notes")}
            />
          </Field>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href={backHref} className={buttonStyles({ variant: "secondary" })}>
          <ArrowLeft className="size-4" />
          Cancel
        </Link>
        <Button type="submit" isLoading={isSubmitting} leftIcon={<Save className="size-4" />}>
          {mode === "create" ? "Create customer" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
