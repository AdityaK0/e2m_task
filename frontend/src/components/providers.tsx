"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Provider } from "react-redux";
import { Toaster } from "sonner";

import { bootstrapAuth, sessionExpired } from "@/features/auth/authSlice";
import { AUTH_EXPIRED_EVENT } from "@/lib/api/client";
import { isAuthTokenStorageKey } from "@/lib/auth/token-storage";
import { makeStore, type AppStore } from "@/store";
import { useAppDispatch } from "@/store/hooks";

function SessionBootstrap() {
  const dispatch = useAppDispatch();
  const router = useRouter();

  useEffect(() => {
    void dispatch(bootstrapAuth());
    const handleExpired = () => {
      dispatch(sessionExpired());
      router.replace("/login");
    };
    const handleStorage = (event: StorageEvent) => {
      if (
        (isAuthTokenStorageKey(event.key) && event.newValue === null) ||
        event.key === null
      ) {
        handleExpired();
      }
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, handleExpired);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener(AUTH_EXPIRED_EVENT, handleExpired);
      window.removeEventListener("storage", handleStorage);
    };
  }, [dispatch, router]);

  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  const storeRef = useRef<AppStore | null>(null);
  if (!storeRef.current) {
    storeRef.current = makeStore();
  }

  return (
    <Provider store={storeRef.current}>
      <SessionBootstrap />
      {children}
      <Toaster
        position="top-right"
        richColors
        closeButton
        toastOptions={{
          style: {
            border: "1px solid var(--color-ink-300)",
            fontFamily: "inherit",
            boxShadow: "none",
          },
        }}
      />
    </Provider>
  );
}
