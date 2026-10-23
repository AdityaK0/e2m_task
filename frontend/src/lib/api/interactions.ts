import { api } from "./client";
import type {
  Interaction,
  InteractionDetail,
  InteractionType,
  Paginated,
} from "./types";

export type InteractionSort =
  | "occurred_at"
  | "-occurred_at"
  | "created_at"
  | "-created_at"
  | "title"
  | "-title";

export interface InteractionListParams {
  customer_id?: number;
  type?: InteractionType;
  date_from?: string;
  date_to?: string;
  search?: string;
  sort?: InteractionSort;
  page?: number;
  page_size?: number;
}

export interface InteractionPayload {
  customer_id: number;
  title: string;
  type: InteractionType;
  occurred_at: string;
  notes?: string | null;
  participants?: string[];
}

export const interactionsApi = {
  async list(
    params: InteractionListParams = {},
  ): Promise<Paginated<Interaction>> {
    const { data } = await api.get<Paginated<Interaction>>("/interactions", {
      params,
    });
    return data;
  },

  async get(id: number): Promise<InteractionDetail> {
    const { data } = await api.get<InteractionDetail>(`/interactions/${id}`);
    return data;
  },

  async create(payload: InteractionPayload): Promise<Interaction> {
    const { data } = await api.post<Interaction>("/interactions", payload);
    return data;
  },

  async update(
    id: number,
    payload: Partial<InteractionPayload>,
  ): Promise<Interaction> {
    const { data } = await api.patch<Interaction>(`/interactions/${id}`, payload);
    return data;
  },

  async remove(id: number): Promise<void> {
    await api.delete(`/interactions/${id}`);
  },
};
