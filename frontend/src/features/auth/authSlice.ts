import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";

import { authApi, type LoginPayload, type RegisterPayload } from "@/lib/api/auth";
import { hasRefreshHint, requestSessionRefresh } from "@/lib/api/client";
import { getApiError } from "@/lib/api/errors";
import { clearAccessToken, setAccessToken } from "@/lib/api/token";
import type { AuthResponse, User } from "@/lib/api/types";

export type AuthStatus =
  | "idle"
  | "loading"
  | "authenticated"
  | "unauthenticated";

interface AuthState {
  user: User | null;
  status: AuthStatus;
  initialized: boolean;
  error: string | null;
}

const initialState: AuthState = {
  user: null,
  status: "idle",
  initialized: false,
  error: null,
};

export const login = createAsyncThunk<
  AuthResponse,
  LoginPayload,
  { rejectValue: string }
>("auth/login", async (payload, { rejectWithValue }) => {
  try {
    const session = await authApi.login(payload);
    setAccessToken(session.access_token);
    return session;
  } catch (error) {
    return rejectWithValue(getApiError(error));
  }
});

export const register = createAsyncThunk<
  AuthResponse,
  RegisterPayload,
  { rejectValue: string }
>("auth/register", async (payload, { rejectWithValue }) => {
  try {
    const session = await authApi.register(payload);
    setAccessToken(session.access_token);
    return session;
  } catch (error) {
    return rejectWithValue(getApiError(error));
  }
});

export const bootstrapAuth = createAsyncThunk<AuthResponse | null>(
  "auth/bootstrap",
  async () => {
    if (!hasRefreshHint()) {
      clearAccessToken();
      return null;
    }
    try {
      return await requestSessionRefresh();
    } catch {
      clearAccessToken();
      return null;
    }
  },
);

export const logout = createAsyncThunk<void>("auth/logout", async () => {
  try {
    await authApi.logout();
  } catch {
    // Local session is cleared even when the server cannot be reached.
  } finally {
    clearAccessToken();
  }
});

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setUser(state, action: { payload: User }) {
      state.user = action.payload;
    },
    sessionExpired(state) {
      clearAccessToken();
      state.user = null;
      state.status = "unauthenticated";
      state.initialized = true;
      state.error = "Your session expired. Please sign in again.";
    },
    clearError(state) {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(login.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(login.fulfilled, (state, action) => {
        state.status = "authenticated";
        state.initialized = true;
        state.user = action.payload.user;
        state.error = null;
      })
      .addCase(login.rejected, (state, action) => {
        state.status = "unauthenticated";
        state.initialized = true;
        state.error = action.payload ?? "Unable to sign in";
      })
      .addCase(register.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(register.fulfilled, (state, action) => {
        state.status = "authenticated";
        state.initialized = true;
        state.user = action.payload.user;
        state.error = null;
      })
      .addCase(register.rejected, (state, action) => {
        state.status = "unauthenticated";
        state.initialized = true;
        state.error = action.payload ?? "Unable to create account";
      })
      .addCase(bootstrapAuth.pending, (state) => {
        state.status = "loading";
      })
      .addCase(bootstrapAuth.fulfilled, (state, action) => {
        state.initialized = true;
        if (action.payload) {
          state.status = "authenticated";
          state.user = action.payload.user;
        } else {
          state.status = "unauthenticated";
          state.user = null;
        }
      })
      .addCase(bootstrapAuth.rejected, (state) => {
        state.initialized = true;
        state.status = "unauthenticated";
        state.user = null;
      })
      .addCase(logout.fulfilled, (state) => {
        state.user = null;
        state.status = "unauthenticated";
        state.initialized = true;
        state.error = null;
      });
  },
});

export const { setUser, sessionExpired, clearError } = authSlice.actions;
export default authSlice.reducer;
