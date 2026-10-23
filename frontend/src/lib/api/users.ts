import { api } from "./client";
import type {
  MessageResponse,
  Paginated,
  Role,
  User,
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
  password: string;
  role: Role;
}

export interface UserUpdatePayload {
  name?: string;
  role?: Role;
  is_active?: boolean;
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

  async get(id: number): Promise<User> {
    const { data } = await api.get<User>(`/users/${id}`);
    return data;
  },

  async create(payload: UserCreatePayload): Promise<User> {
    const { data } = await api.post<User>("/users", payload);
    return data;
  },

  async update(id: number, payload: UserUpdatePayload): Promise<User> {
    const { data } = await api.patch<User>(`/users/${id}`, payload);
    return data;
  },

  async revokeSessions(id: number): Promise<MessageResponse> {
    const { data } = await api.post<MessageResponse>(
      `/users/${id}/revoke-sessions`,
    );
    return data;
  },
};
