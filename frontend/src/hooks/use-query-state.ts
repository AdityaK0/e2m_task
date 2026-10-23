"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

export function useQueryState() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const params = useMemo(() => searchParams, [searchParams]);

  const setParams = useCallback(
    (next: Record<string, string | number | null | undefined>) => {
      const current = new URLSearchParams(params.toString());
      Object.entries(next).forEach(([key, value]) => {
        if (value === undefined || value === null || value === "") {
          current.delete(key);
        } else {
          current.set(key, String(value));
        }
      });
      const query = current.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  const getString = useCallback(
    (key: string, fallback = "") => params.get(key) ?? fallback,
    [params],
  );

  const getNumber = useCallback(
    (key: string, fallback?: number) => {
      const value = params.get(key);
      if (!value) return fallback;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    },
    [params],
  );

  return { params, setParams, getString, getNumber };
}
