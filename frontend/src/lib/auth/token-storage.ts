const ACCESS_TOKEN_KEY = "e2m_access_token";
const REFRESH_TOKEN_KEY = "e2m_refresh_token";

function readToken(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    console.error("Unable to read authentication tokens from localStorage.");
    return null;
  }
}

function writeToken(key: string, token: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, token);
  } catch {
    console.error("Unable to store authentication tokens in localStorage.");
  }
}

function removeToken(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    console.error("Unable to clear authentication tokens from localStorage.");
  }
}

export function getAccessToken(): string | null {
  return readToken(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  return readToken(REFRESH_TOKEN_KEY);
}

export function hasStoredTokens(): boolean {
  return Boolean(getAccessToken() || getRefreshToken());
}

export function setAccessToken(token: string): void {
  writeToken(ACCESS_TOKEN_KEY, token);
}

export function setTokens(accessToken: string, refreshToken: string): void {
  writeToken(ACCESS_TOKEN_KEY, accessToken);
  writeToken(REFRESH_TOKEN_KEY, refreshToken);
}

export function clearTokens(): void {
  removeToken(ACCESS_TOKEN_KEY);
  removeToken(REFRESH_TOKEN_KEY);
}

export function isAuthTokenStorageKey(key: string | null): boolean {
  return key === ACCESS_TOKEN_KEY || key === REFRESH_TOKEN_KEY;
}
