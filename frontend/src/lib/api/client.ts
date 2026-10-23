import axios, {
  AxiosError,
  type InternalAxiosRequestConfig,
} from "axios";

import type { AuthResponse } from "./types";
import { clearAccessToken, getAccessToken, setAccessToken } from "./token";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

export const AUTH_EXPIRED_EVENT = "e2m:auth-expired";

export function getCsrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find((cookie) => cookie.startsWith("csrf_token="));
  if (!match) return null;
  const value = match.slice("csrf_token=".length);
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function hasRefreshHint(): boolean {
  return getCsrfToken() !== null;
}

export const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

const refreshClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
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

const AUTH_PATHS = ["/auth/login", "/auth/register", "/auth/refresh", "/auth/logout"];

function isAuthMutation(url?: string): boolean {
  return AUTH_PATHS.some((path) => url?.includes(path));
}

let refreshPromise: Promise<string | null> | null = null;

export async function requestSessionRefresh(): Promise<AuthResponse> {
  const csrf = getCsrfToken();
  if (!csrf) {
    throw new Error("No refresh session is available");
  }
  const response = await refreshClient.post<AuthResponse>("/auth/refresh", null, {
    headers: { "X-CSRF-Token": csrf },
  });
  setAccessToken(response.data.access_token);
  return response.data;
}

async function rotateSession(): Promise<string | null> {
  try {
    const session = await requestSessionRefresh();
    return session.access_token;
  } catch {
    return null;
  }
}

export function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = rotateSession().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as RetryableConfig | undefined;
    const status = error.response?.status;
    if (
      status === 401 &&
      original &&
      !original._retry &&
      !isAuthMutation(original.url)
    ) {
      original._retry = true;
      const token = await refreshAccessToken();
      if (token) {
        original.headers.set("Authorization", `Bearer ${token}`);
        return api(original);
      }
      clearAccessToken();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
      }
    }
    return Promise.reject(error);
  },
);

export function isAxiosError(error: unknown): error is AxiosError {
  return axios.isAxiosError(error);
}
