import { api } from "./client";
import type {
  AuthResponse,
  AuthorizationConfig,
  MeResponse,
  MessageResponse,
  RoleOption,
  User,
} from "./types";

export interface LoginPayload {
  email: string;
  password: string;
}

export const authApi = {
  async login(payload: LoginPayload): Promise<AuthResponse> {
    const { data } = await api.post<AuthResponse>("/auth/login", payload);
    return data;
  },

  async me(): Promise<User> {
    const { data } = await api.get<MeResponse>("/auth/me");
    return data.data;
  },

  async updateProfile(name: string): Promise<User> {
    const { data } = await api.patch<MeResponse>("/auth/me", { name });
    return data.data;
  },

  async changePassword(
    currentPassword: string,
    newPassword: string,
  ): Promise<MessageResponse> {
    const { data } = await api.post<MessageResponse>("/auth/change-password", {
      current_password: currentPassword,
      new_password: newPassword,
    });
    return data;
  },

  async config(): Promise<AuthorizationConfig> {
    const { data } = await api.get<AuthorizationConfig>("/auth/config");
    return data;
  },

  async roles(): Promise<RoleOption[]> {
    const { data } = await api.get<RoleOption[]>("/auth/roles");
    return data;
  },
};
