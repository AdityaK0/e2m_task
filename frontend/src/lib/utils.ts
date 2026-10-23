import { clsx, type ClassValue } from "clsx";
import {
  format,
  formatDistanceToNow,
  isValid,
  parseISO,
} from "date-fns";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

function asDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : parseISO(value);
  return isValid(date) ? date : null;
}

export function formatDate(
  value: string | Date | null | undefined,
  fallback = "—",
): string {
  const date = asDate(value);
  return date ? format(date, "MMM d, yyyy") : fallback;
}

export function formatDateTime(
  value: string | Date | null | undefined,
  fallback = "—",
): string {
  const date = asDate(value);
  return date ? format(date, "MMM d, yyyy · h:mm a") : fallback;
}

export function formatRelative(
  value: string | Date | null | undefined,
  fallback = "—",
): string {
  const date = asDate(value);
  return date ? formatDistanceToNow(date, { addSuffix: true }) : fallback;
}

export function toDateTimeLocal(value?: string | null): string {
  const date = asDate(value);
  return date ? format(date, "yyyy-MM-dd'T'HH:mm") : "";
}

export function fromDateTimeLocal(value: string): string {
  const date = new Date(value);
  return isValid(date) ? date.toISOString() : value;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function titleCase(value: string): string {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function pluralize(
  count: number,
  singular: string,
  plural = `${singular}s`,
): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
