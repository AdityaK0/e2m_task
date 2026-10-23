import { api } from "./client";
import type { DashboardSummary } from "./types";

export const dashboardApi = {
  async summary(): Promise<DashboardSummary> {
    const { data } = await api.get<DashboardSummary>("/dashboard/summary");
    return data;
  },
};
