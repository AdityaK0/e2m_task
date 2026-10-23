"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Provider } from "react-redux";
import { Toaster } from "sonner";

import { bootstrapAuth, sessionExpired } from "@/features/auth/authSlice";
import { AUTH_EXPIRED_EVENT } from "@/lib/api/client";
import { makeStore, type AppStore } from "@/store";
import { useAppDispatch } from "@/store/hooks";

function SessionBootstrap() {
  const dispatch = useAppDispatch();

  useEffect(() => {
    void dispatch(bootstrapAuth());
    const handleExpired = () => dispatch(sessionExpired());
    window.addEventListener(AUTH_EXPIRED_EVENT, handleExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handleExpired);
  }, [dispatch]);

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
          style: { borderRadius: "14px", fontFamily: "inherit" },
        }}
      />
    </Provider>
  );
}
