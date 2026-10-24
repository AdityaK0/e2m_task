import axios, {
  AxiosError,
  type InternalAxiosRequestConfig,
} from "axios";

import { clearTokens, getAccessToken, getRefreshToken, setAccessToken } from "@/lib/auth/token-storage";

import type { RefreshResponse } from "./types";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

export const AUTH_EXPIRED_EVENT = "e2m:auth-expired";

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { "Content-Type": "application/json" },
});

const refreshClient = axios.create({
  baseURL: API_BASE_URL,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers.set("Authorization", `Bearer ${token}`);
  }
  return config;
});

interface RetryableConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

function isLoginOrRefresh(url?: string): boolean {
  const path = url?.split("?")[0];
  return path === "/auth/login" || path === "/auth/refresh";
}

let refreshPromise: Promise<string | null> | null = null;
let authExpiryHandled = false;

export async function requestSessionRefresh(): Promise<RefreshResponse> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    throw new Error("No refresh token is available.");
  }
  const { data } = await refreshClient.post<RefreshResponse>("/auth/refresh", {
    refresh_token: refreshToken,
  });
  setAccessToken(data.access_token);
  authExpiryHandled = false;
  return data;
}

export function resetAuthExpiryHandling(): void {
  authExpiryHandled = false;
}

function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = requestSessionRefresh()
      .then((response) => response.access_token)
      .catch(() => null)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

function expireClientSession(): void {
  if (authExpiryHandled) return;
  authExpiryHandled = true;
  clearTokens();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
    if (window.location.pathname !== "/login") {
      window.location.replace("/login");
    }
  }
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as RetryableConfig | undefined;
    if (
      error.response?.status === 401 &&
      original &&
      !isLoginOrRefresh(original.url)
    ) {
      if (original._retry) {
        expireClientSession();
        return Promise.reject(error);
      }
      original._retry = true;
      const token = await refreshAccessToken();
      if (token) {
        original.headers.set("Authorization", `Bearer ${token}`);
        return api(original);
      }
      expireClientSession();
    }
    return Promise.reject(error);
  },
);

export function isAxiosError(error: unknown): error is AxiosError {
  return axios.isAxiosError(error);
}
