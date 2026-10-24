"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { customersApi } from "@/lib/api/customers";
import { getApiError } from "@/lib/api/errors";
import { usersApi } from "@/lib/api/users";
import {
  interactionsApi,
  type InteractionCreateResponse,
} from "@/lib/api/interactions";
import type { Customer, Interaction, InteractionType, UserOption } from "@/lib/api/types";
import { INTERACTION_TYPE_OPTIONS } from "@/lib/labels";
import { fromDateTimeLocal, toDateTimeLocal } from "@/lib/utils";

const schema = z.object({
  customer_id: z.string().min(1, "Select a customer"),
  title: z.string().trim().min(1, "Title is required").max(250),
  type: z.enum(["meeting", "call", "email", "other"]),
  occurred_at: z.string().min(1, "Date and time is required"),
  participants: z.array(z.string()).max(50),
  external_attendees: z.string().max(4000),
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
    participants: interaction?.participants.map(String) ?? [],
    external_attendees: interaction?.external_attendees.join(", ") ?? "",
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
  const [users, setUsers] = useState<UserOption[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [participantSearch, setParticipantSearch] = useState("");
  const [participantDropdownOpen, setParticipantDropdownOpen] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const isEdit = Boolean(interaction);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaults(interaction, initialCustomerId),
  });
  const selectedParticipants = watch("participants");
  const allMatchingParticipants = users
    .filter(
      (user) =>
        !selectedParticipants.includes(String(user.id)) &&
        user.name.toLowerCase().includes(participantSearch.trim().toLowerCase()),
    );
  const matchingParticipants = allMatchingParticipants.slice(0, 5);

  useEffect(() => {
    if (!open) return;
    reset(defaults(interaction, initialCustomerId));
    setServerError(null);
    setParticipantSearch("");
    setParticipantDropdownOpen(false);
  }, [open, interaction, initialCustomerId, reset]);

  useEffect(() => {
    if (!open) return;
    setUsersLoading(true);
    setUsersError(null);
    usersApi
      .options()
      .then(setUsers)
      .catch((error) => setUsersError(getApiError(error)))
      .finally(() => setUsersLoading(false));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    customersApi
      .list({ page_size: 100, sort: "name" })
      .then((result) => setCustomers(result.items))
      .catch(() => setCustomers([]));
  }, [open]);

  const onSubmit = async (values: FormValues, generateInsight = false) => {
    setServerError(null);
    const payload = {
      customer_id: Number(values.customer_id),
      title: values.title.trim(),
      type: values.type as InteractionType,
      occurred_at: fromDateTimeLocal(values.occurred_at),
      participants: values.participants
        .map(Number)
        .filter((participantId) => Number.isInteger(participantId) && participantId > 0),
      external_attendees: values.external_attendees
        .split(",")
        .map((participant) => participant.trim())
        .filter(Boolean),
      notes: values.notes.trim() === "" ? null : values.notes,
    };

    try {
      let saved: Interaction;
      let createResponse: InteractionCreateResponse | null = null;
      if (interaction) {
        saved = await interactionsApi.update(interaction.id, payload);
      } else {
        createResponse = await interactionsApi.create({
          ...payload,
          generate_insight: generateInsight,
        });
        saved = createResponse;
      }
      toast.success(isEdit ? "Meeting updated" : "Meeting saved");
      onSaved(saved);
      onClose();
      if (!interaction && generateInsight) {
        if (createResponse?.insight_error) {
          toast.error(
            `Meeting saved, but AI insight failed: ${createResponse.insight_error}`,
          );
        } else if (createResponse?.insight_status === "completed") {
          toast.success("AI insight generated");
        }
      }
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
      title={isEdit ? "Edit meeting" : "New meeting"}
      description={
        isEdit
          ? "Update meeting details. You can generate an insight later from the saved meeting."
          : "Capture what happened, then choose whether to generate an AI insight now or later."
      }
      size="lg"
      dismissible={!isSubmitting}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            variant="secondary"
            type="submit"
            form="interaction-form"
            disabled={isSubmitting}
          >
            {isEdit ? "Save changes" : "Save"}
          </Button>
          {!isEdit ? (
            <Button
              type="button"
              isLoading={isSubmitting}
              onClick={handleSubmit((values) => onSubmit(values, true))}
            >
              Save &amp; Generate
            </Button>
          ) : null}
        </>
      }
    >
      <form
        id="interaction-form"
        onSubmit={handleSubmit((values) => onSubmit(values))}
        className="space-y-4"
        noValidate
      >
        {serverError ? (
          <div className=" border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-700">
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

          <Field label="Participants" className="sm:col-span-2">
            <div
              className="border border-ink-200 bg-white p-2"
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                  setParticipantDropdownOpen(false);
                }
              }}
            >
              <div className="mb-2 flex flex-wrap gap-1.5">
                {selectedParticipants.map((id) => {
                  const participant = users.find((user) => String(user.id) === id);
                  return (
                    <span
                      key={id}
                      className="inline-flex items-center gap-1 border border-ink-200 bg-ink-50 px-2 py-1 text-[11px] text-ink-700"
                    >
                      {participant?.name ?? `Unavailable user #${id}`}
                      <button
                        type="button"
                        aria-label={`Remove ${participant?.name ?? `user ${id}`}`}
                        onClick={() =>
                          setValue(
                            "participants",
                            selectedParticipants.filter((selectedId) => selectedId !== id),
                            { shouldDirty: true },
                          )
                        }
                        className="text-ink-400 hover:text-ink-900"
                      >
                        <X className="size-3" />
                      </button>
                    </span>
                  );
                })}
              </div>
              <Input
                id="participants"
                value={participantSearch}
                onChange={(event) => setParticipantSearch(event.target.value)}
                onFocus={() => setParticipantDropdownOpen(true)}
                placeholder={usersLoading ? "Loading active users…" : "Search active users"}
                aria-label="Search active participants"
                aria-expanded={participantDropdownOpen}
                aria-controls="participant-options"
              />
              {participantDropdownOpen ? (
                <div
                  id="participant-options"
                  role="listbox"
                  aria-label="Available participants"
                  className="mt-1 max-h-36 overflow-y-auto border border-ink-100 bg-white"
                >
                  {usersLoading ? (
                    <p className="px-3 py-2 text-xs text-ink-400">Loading users…</p>
                  ) : usersError ? (
                    <p className="px-3 py-2 text-xs text-rose-600">{usersError}</p>
                  ) : matchingParticipants.length ? (
                    <>
                      {matchingParticipants.map((user) => (
                        <button
                          key={user.id}
                          type="button"
                          role="option"
                          aria-selected={false}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => {
                            setValue("participants", [...selectedParticipants, String(user.id)], {
                              shouldDirty: true,
                            });
                            setParticipantSearch("");
                            setParticipantDropdownOpen(true);
                          }}
                          className="block w-full px-3 py-2 text-left text-xs text-ink-700 hover:bg-ink-50"
                        >
                          {user.name}
                        </button>
                      ))}
                      {allMatchingParticipants.length > 5 ? (
                        <p className="px-3 py-2 text-[11px] text-ink-400">
                          Showing 5. Search to narrow the list.
                        </p>
                      ) : null}
                    </>
                  ) : (
                    <p className="px-3 py-2 text-xs text-ink-400">
                      {users.length === 0
                        ? "No active users available."
                        : participantSearch.trim()
                          ? "No matching users."
                          : "All active users are already selected."}
                    </p>
                  )}
                </div>
              ) : null}
              {usersError ? (
                <p role="alert" className="mt-2 text-xs text-rose-600">{usersError}</p>
              ) : users.length === 0 && !usersLoading ? (
                <p className="mt-2 text-xs text-ink-400">No active users available.</p>
              ) : null}
            </div>
          </Field>

          <Field
            label="External attendees"
            htmlFor="external_attendees"
            error={errors.external_attendees?.message}
            hint="Customer-side attendees; separate names with commas."
            className="sm:col-span-2"
          >
            <Input
              id="external_attendees"
              placeholder="Jordan Lee, Priya Shah"
              {...register("external_attendees")}
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
