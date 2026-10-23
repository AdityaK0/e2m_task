import type { ApiErrorPayload } from "./types";
import { isAxiosError } from "./client";

export function getApiError(error: unknown): string {
  if (isAxiosError(error)) {
    const payload = error.response?.data as ApiErrorPayload | undefined;
    if (payload?.errors?.length) {
      return payload.errors[0]?.message ?? payload.message ?? "Request failed";
    }
    if (payload?.message) return payload.message;
    if (!error.response) {
      return "Unable to reach the server. Check your connection and try again.";
    }
  }
  if (error instanceof Error && error.message) return error.message;
  return "Something went wrong. Please try again.";
}

export function getApiErrorCode(error: unknown): string | undefined {
  if (!isAxiosError(error)) return undefined;
  return (error.response?.data as ApiErrorPayload | undefined)?.error_code;
}
