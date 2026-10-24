import { api } from "./client";
import type { Preference } from "./types";

export const preferencesApi = {
  async list(): Promise<Preference[]> {
    const { data } = await api.get<Preference[]>("/preferences");
    return data;
  },

  async update(key: string, value: number): Promise<Preference> {
    const { data } = await api.put<Preference>(`/preferences/${key}`, { value });
    return data;
  },
};
