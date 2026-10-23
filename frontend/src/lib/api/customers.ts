import { api } from "./client";
import type {
  Customer,
  CustomerDetail,
  CustomerStatus,
  Paginated,
} from "./types";

export type CustomerSort =
  | "name"
  | "-name"
  | "created_at"
  | "-created_at"
  | "updated_at"
  | "-updated_at"
  | "health_score"
  | "-health_score"
  | "status"
  | "-status";

export interface CustomerListParams {
  search?: string;
  status?: CustomerStatus;
  assigned_manager_id?: number;
  sort?: CustomerSort;
  page?: number;
  page_size?: number;
}

export interface CustomerPayload {
  name: string;
  company?: string | null;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  industry?: string | null;
  website?: string | null;
  status?: CustomerStatus;
  health_score?: number | null;
  manager_ids?: number[];
  notes?: string | null;
}

export interface BulkAssignmentPayload {
  manager_id: number;
  customer_ids?: number[];
  all?: true;
}

export interface BulkAssignmentResult {
  assigned: number;
  unassigned: number;
  skipped: number;
}

export const customersApi = {
  async list(params: CustomerListParams = {}): Promise<Paginated<Customer>> {
    const { data } = await api.get<Paginated<Customer>>("/customers", { params });
    return data;
  },

  async get(id: number): Promise<CustomerDetail> {
    const { data } = await api.get<CustomerDetail>(`/customers/${id}`);
    return data;
  },

  async create(payload: CustomerPayload): Promise<Customer> {
    const { data } = await api.post<Customer>("/customers", payload);
    return data;
  },

  async update(id: number, payload: Partial<CustomerPayload>): Promise<Customer> {
    const { data } = await api.patch<Customer>(`/customers/${id}`, payload);
    return data;
  },

  async remove(id: number): Promise<void> {
    await api.delete(`/customers/${id}`);
  },

  async managers(id: number) {
    const { data } = await api.get<Customer["assigned_managers"]>(`/customers/${id}/managers`);
    return data;
  },

  async assignManager(id: number, manager_id: number): Promise<void> {
    await api.post(`/customers/${id}/managers`, { manager_id });
  },

  async unassignManager(id: number, manager_id: number): Promise<void> {
    await api.delete(`/customers/${id}/managers/${manager_id}`);
  },

  async bulkAssign(payload: BulkAssignmentPayload) {
    const { data } = await api.post<BulkAssignmentResult>(
      "/customers/assignments",
      payload,
    );
    return data;
  },

  async bulkUnassign(payload: BulkAssignmentPayload) {
    const { data } = await api.delete<BulkAssignmentResult>(
      "/customers/assignments",
      { data: payload },
    );
    return data;
  },
};
