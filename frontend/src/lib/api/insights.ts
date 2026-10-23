import { api } from "./client";
import type { InsightConfig, MeetingInsight } from "./types";

export const insightsApi = {
  async get(interactionId: number): Promise<MeetingInsight> {
    const { data } = await api.get<MeetingInsight>(
      `/interactions/${interactionId}/insights`,
    );
    return data;
  },

  async generate(
    interactionId: number,
    force = false,
  ): Promise<MeetingInsight> {
    const { data } = await api.post<MeetingInsight>(
      `/interactions/${interactionId}/insights`,
      { force },
    );
    return data;
  },

  async config(): Promise<InsightConfig> {
    const { data } = await api.get<InsightConfig>("/insights/config");
    return data;
  },
};
