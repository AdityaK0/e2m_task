import type {
  CustomerStatus,
  InsightStatus,
  InteractionType,
  Sentiment,
} from "@/lib/api/types";

export type Tone =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "danger"
  | "purple";

export const CUSTOMER_STATUS_LABELS: Record<CustomerStatus, string> = {
  prospect: "Prospect",
  onboarding: "Onboarding",
  active: "Active",
  at_risk: "At risk",
  churned: "Churned",
};

export const CUSTOMER_STATUS_TONES: Record<CustomerStatus, Tone> = {
  prospect: "info",
  onboarding: "purple",
  active: "success",
  at_risk: "warning",
  churned: "danger",
};

export const INTERACTION_TYPE_LABELS: Record<InteractionType, string> = {
  meeting: "Meeting",
  call: "Call",
  email: "Email",
  other: "Other",
};

export const INTERACTION_TYPE_TONES: Record<InteractionType, Tone> = {
  meeting: "purple",
  call: "info",
  email: "neutral",
  other: "neutral",
};

export const INSIGHT_STATUS_LABELS: Record<InsightStatus, string> = {
  pending: "Pending",
  running: "Generating",
  completed: "Ready",
  failed: "Failed",
  stale: "Needs refresh",
};

export const INSIGHT_STATUS_TONES: Record<InsightStatus, Tone> = {
  pending: "neutral",
  running: "info",
  completed: "success",
  failed: "danger",
  stale: "warning",
};

export const SENTIMENT_LABELS: Record<Sentiment, string> = {
  Positive: "Positive",
  Neutral: "Neutral",
  Negative: "Negative",
};

export const SENTIMENT_TONES: Record<Sentiment, Tone> = {
  Positive: "success",
  Neutral: "neutral",
  Negative: "danger",
};

export const CUSTOMER_STATUS_OPTIONS: Array<{
  value: CustomerStatus;
  label: string;
}> = (
  Object.entries(CUSTOMER_STATUS_LABELS) as Array<[CustomerStatus, string]>
).map(([value, label]) => ({ value, label }));

export const INTERACTION_TYPE_OPTIONS: Array<{
  value: InteractionType;
  label: string;
}> = (
  Object.entries(INTERACTION_TYPE_LABELS) as Array<[InteractionType, string]>
).map(([value, label]) => ({ value, label }));
