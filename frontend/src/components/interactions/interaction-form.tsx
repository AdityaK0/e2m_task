"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { customersApi } from "@/lib/api/customers";
import { getApiError } from "@/lib/api/errors";
import { interactionsApi } from "@/lib/api/interactions";
import type { Customer, Interaction, InteractionType } from "@/lib/api/types";
import { INTERACTION_TYPE_OPTIONS } from "@/lib/labels";
import { fromDateTimeLocal, toDateTimeLocal } from "@/lib/utils";

const schema = z.object({
  customer_id: z.string().min(1, "Select a customer"),
  title: z.string().trim().min(1, "Title is required").max(250),
  type: z.enum(["meeting", "call", "email", "other"]),
  occurred_at: z.string().min(1, "Date and time is required"),
  participants: z.string().max(4000),
  notes: z.string().max(50000),
});

type FormValues = z.infer<typeof schema>;

function defaults(interaction?: Interaction | null, customerId?: number): FormValues {
  return {
    customer_id:
      interaction?.customer_id !== undefined
        ? String(interaction.customer_id)
        : customerId
          ? String(customerId)
          : "",
    title: interaction?.title ?? "",
    type: interaction?.type ?? "meeting",
    occurred_at: toDateTimeLocal(interaction?.occurred_at ?? new Date().toISOString()),
    participants: interaction?.participants.join(", ") ?? "",
    notes: interaction?.notes ?? "",
  };
}

export function InteractionForm({
  open,
  onClose,
  interaction,
  initialCustomerId,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  interaction?: Interaction | null;
  initialCustomerId?: number;
  onSaved: (interaction: Interaction) => void;
}) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [serverError, setServerError] = useState<string | null>(null);
  const isEdit = Boolean(interaction);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaults(interaction, initialCustomerId),
  });

  useEffect(() => {
    if (!open) return;
    reset(defaults(interaction, initialCustomerId));
    setServerError(null);
  }, [open, interaction, initialCustomerId, reset]);

  useEffect(() => {
    if (!open) return;
    customersApi
      .list({ page_size: 100, sort: "name" })
      .then((result) => setCustomers(result.items))
      .catch(() => setCustomers([]));
  }, [open]);

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    const payload = {
      customer_id: Number(values.customer_id),
      title: values.title.trim(),
      type: values.type as InteractionType,
      occurred_at: fromDateTimeLocal(values.occurred_at),
      participants: values.participants
        .split(",")
        .map((participant) => participant.trim())
        .filter(Boolean),
      notes: values.notes.trim() === "" ? null : values.notes,
    };

    try {
      const saved = interaction
        ? await interactionsApi.update(interaction.id, payload)
        : await interactionsApi.create(payload);
      toast.success(isEdit ? "Interaction updated" : "Interaction logged");
      onSaved(saved);
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
      title={isEdit ? "Edit interaction" : "Log an interaction"}
      description={
        isEdit
          ? "Update meeting details. Changing notes marks the AI insight as stale."
          : "Capture what happened. You can generate an AI insight once notes are saved."
      }
      size="lg"
      dismissible={!isSubmitting}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="interaction-form"
            isLoading={isSubmitting}
          >
            {isEdit ? "Save changes" : "Log interaction"}
          </Button>
        </>
      }
    >
      <form
        id="interaction-form"
        onSubmit={handleSubmit(onSubmit)}
        className="space-y-4"
        noValidate
      >
        {serverError ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-700">
            {serverError}
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Customer"
            htmlFor="customer_id"
            error={errors.customer_id?.message}
            required
            className="sm:col-span-2"
          >
            <Select
              id="customer_id"
              invalid={Boolean(errors.customer_id)}
              {...register("customer_id")}
            >
              <option value="">Select a customer…</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                  {customer.company ? ` · ${customer.company}` : ""}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Title"
            htmlFor="title"
            error={errors.title?.message}
            required
            className="sm:col-span-2"
          >
            <Input
              id="title"
              placeholder="Quarterly business review"
              invalid={Boolean(errors.title)}
              {...register("title")}
            />
          </Field>

          <Field label="Type" htmlFor="type" error={errors.type?.message} required>
            <Select id="type" {...register("type")}>
              {INTERACTION_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Occurred at"
            htmlFor="occurred_at"
            error={errors.occurred_at?.message}
            required
          >
            <Input
              id="occurred_at"
              type="datetime-local"
              invalid={Boolean(errors.occurred_at)}
              {...register("occurred_at")}
            />
          </Field>

          <Field
            label="Participants"
            htmlFor="participants"
            error={errors.participants?.message}
            hint="Separate names with commas."
            className="sm:col-span-2"
          >
            <Input
              id="participants"
              placeholder="Jordan Lee, Priya Shah, Alex Kim"
              invalid={Boolean(errors.participants)}
              {...register("participants")}
            />
          </Field>

          <Field
            label="Meeting notes"
            htmlFor="notes"
            error={errors.notes?.message}
            hint="Raw notes are fine — AI will structure them into a summary and actions."
            className="sm:col-span-2"
          >
            <Textarea
              id="notes"
              rows={9}
              placeholder="What was discussed, decisions made, concerns raised, commitments…"
              invalid={Boolean(errors.notes)}
              {...register("notes")}
            />
          </Field>
        </div>
      </form>
    </Dialog>
  );
}
