import { api } from "./client";
import type {
  Paginated,
  Role,
  User,
  UserCredentials,
  UserOption,
} from "./types";

export interface UserListParams {
  search?: string;
  role?: Role;
  is_active?: boolean;
  page?: number;
  page_size?: number;
}

export interface UserCreatePayload {
  name: string;
  email: string;
  password?: string;
  role: Role;
  auto_assign_new_customers: boolean;
}

export interface UserUpdatePayload {
  name?: string;
  role?: Role;
  is_active?: boolean;
  auto_assign_new_customers?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeCredentials(response: unknown): UserCredentials {
  const envelope = isRecord(response) ? response : {};
  const body = isRecord(envelope.data) ? envelope.data : envelope;
  const user = isRecord(body.user) ? body.user : body;
  const password =
    typeof body.password === "string" ? body.password : envelope.password;

  if (typeof user.email !== "string" || typeof password !== "string" || !password) {
    throw new Error("The server did not return the new user's credentials.");
  }

  return { user: { email: user.email }, password };
}

export const usersApi = {
  async list(params: UserListParams = {}): Promise<Paginated<User>> {
    const { data } = await api.get<Paginated<User>>("/users", { params });
    return data;
  },

  async options(): Promise<UserOption[]> {
    const { data } = await api.get<UserOption[]>("/users/options");
    return data;
  },

  async managerOptions(): Promise<UserOption[]> {
    const { data } = await api.get<UserOption[]>("/users/manager-options");
    return data;
  },

  async get(id: number): Promise<User> {
    const { data } = await api.get<User>(`/users/${id}`);
    return data;
  },

  async create(payload: UserCreatePayload): Promise<UserCredentials> {
    const { data } = await api.post<unknown>("/users", payload);
    return normalizeCredentials(data);
  },

  async deactivate(id: number): Promise<User> {
    const { data } = await api.post<User>(`/users/${id}/deactivate`);
    return data;
  },

  async reactivate(id: number): Promise<User> {
    const { data } = await api.post<User>(`/users/${id}/reactivate`);
    return data;
  },

  async resetPassword(id: number): Promise<UserCredentials> {
    const { data } = await api.post<unknown>(
      `/users/${id}/reset-password`,
    );
    return normalizeCredentials(data);
  },

  async update(id: number, payload: UserUpdatePayload): Promise<User> {
    const { data } = await api.patch<User>(`/users/${id}`, payload);
    return data;
  },

  async updateRole(id: number, role: Role): Promise<User> {
    const { data } = await api.patch<User>(`/users/${id}/role`, { role });
    return data;
  },
};
