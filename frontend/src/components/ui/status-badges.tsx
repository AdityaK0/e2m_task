import type {
  CustomerStatus,
  InsightStatus,
  InteractionType,
  Role,
  Sentiment,
} from "@/lib/api/types";
import {
  CUSTOMER_STATUS_LABELS,
  CUSTOMER_STATUS_TONES,
  INSIGHT_STATUS_LABELS,
  INSIGHT_STATUS_TONES,
  INTERACTION_TYPE_LABELS,
  INTERACTION_TYPE_TONES,
  SENTIMENT_LABELS,
  SENTIMENT_TONES,
} from "@/lib/labels";
import { ROLE_SHORT_LABELS } from "@/lib/permissions";

import { Badge } from "./badge";

export function CustomerStatusBadge({ status }: { status: CustomerStatus }) {
  return (
    <Badge tone={CUSTOMER_STATUS_TONES[status]} dot>
      {CUSTOMER_STATUS_LABELS[status]}
    </Badge>
  );
}

export function InteractionTypeBadge({ type }: { type: InteractionType }) {
  return <Badge tone={INTERACTION_TYPE_TONES[type]}>{INTERACTION_TYPE_LABELS[type]}</Badge>;
}

export function InsightStatusBadge({ status }: { status: InsightStatus }) {
  return (
    <Badge tone={INSIGHT_STATUS_TONES[status]} dot>
      {INSIGHT_STATUS_LABELS[status]}
    </Badge>
  );
}

export function SentimentBadge({ sentiment }: { sentiment: Sentiment }) {
  return <Badge tone={SENTIMENT_TONES[sentiment]}>{SENTIMENT_LABELS[sentiment]}</Badge>;
}

export function RoleBadge({ role }: { role: Role }) {
  const tone = role === "admin" ? "purple" : role === "csm" ? "info" : "neutral";
  return <Badge tone={tone}>{ROLE_SHORT_LABELS[role]}</Badge>;
}
