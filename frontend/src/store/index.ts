import { configureStore } from "@reduxjs/toolkit";

import authReducer from "@/features/auth/authSlice";
import customersReducer from "@/features/customers/customersSlice";

export function makeStore() {
  return configureStore({
    reducer: {
      auth: authReducer,
      customers: customersReducer,
    },
  });
}

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore["getState"]>;
export type AppDispatch = AppStore["dispatch"];
