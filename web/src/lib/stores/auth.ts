/**
 * Auth store - manages authentication state with localStorage persistence.
 * Uses svelte/store writable pattern for Svelte 5 compatibility.
 * Includes automatic JWT refresh — checks every 5 minutes and refreshes
 * when the token is within 2 hours of expiry.
 */

import { writable, derived, get } from "svelte/store";

export interface User {
  id: string;
  username: string;
  email: string;
  role: string;
  tier: string;
}

interface AuthState {
  token: string | null;
  user: User | null;
}

const STORAGE_KEY = "commander_auth";
const REFRESH_CHECK_INTERVAL_MS = 5 * 60 * 1000;  // 5 minutes
const REFRESH_THRESHOLD_MS = 2 * 60 * 60 * 1000;   // 2 hours before expiry

/** Decode JWT payload without verification (client-side only — server verifies). */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = parts[1];
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/** Returns seconds until the token expires, or -1 if unreadable. */
function tokenSecondsRemaining(token: string): number {
  const payload = decodeJwtPayload(token);
  if (!payload || typeof payload.exp !== "number") return -1;
  return payload.exp - Math.floor(Date.now() / 1000);
}

function loadInitialState(): AuthState {
  if (typeof window === "undefined") return { token: null, user: null };
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed && typeof parsed.token === "string" && parsed.user) {
        return parsed as AuthState;
      }
    }
  } catch {
    // Corrupted storage - clear it
    localStorage.removeItem(STORAGE_KEY);
  }
  return { token: null, user: null };
}

function createAuthStore() {
  const initial = loadInitialState();
  const { subscribe, set, update } = writable<AuthState>(initial);

  let refreshTimer: ReturnType<typeof setInterval> | null = null;

  // Persist every state change to localStorage
  subscribe((state) => {
    if (typeof window === "undefined") return;
    if (state.token && state.user) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  });

  /** Call POST /api/refresh-token to get a fresh JWT. */
  async function refreshToken(): Promise<void> {
    const state = get({ subscribe });
    if (!state.token) return;

    const remaining = tokenSecondsRemaining(state.token);
    // Only refresh if we can read expiry and it is within the threshold
    if (remaining < 0) return;  // unreadable token — skip
    if (remaining > REFRESH_THRESHOLD_MS / 1000) return;  // still fresh

    try {
      const res = await fetch("/api/refresh-token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${state.token}`,
        },
      });
      if (!res.ok) {
        // Token rejected (expired or invalid) — force logout
        if (res.status === 401) {
          set({ token: null, user: null });
          stopRefreshTimer();
        }
        return;
      }
      const data = await res.json();
      if (data.token) {
        update((s) => ({ ...s, token: data.token }));
      }
    } catch {
      // Network error — silently skip, will retry next interval
    }
  }

  function startRefreshTimer(): void {
    if (refreshTimer) return;
    // Immediate check on start (e.g. app load with a stale token)
    refreshToken();
    refreshTimer = setInterval(refreshToken, REFRESH_CHECK_INTERVAL_MS);
  }

  function stopRefreshTimer(): void {
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
  }

  // Auto-start the refresh timer if we already have a token
  if (typeof window !== "undefined" && initial.token) {
    startRefreshTimer();
  }

  return {
    subscribe,

    async login(
      username: string,
      password: string,
    ): Promise<{ success: boolean; error?: string }> {
      try {
        const res = await fetch("/api/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password }),
        });

        const data = await res.json();

        if (!res.ok) {
          return {
            success: false,
            error: data.error || `Login failed (${res.status})`,
          };
        }

        set({ token: data.token, user: data.user });
        startRefreshTimer();
        return { success: true };
      } catch (err) {
        return {
          success: false,
          error:
            err instanceof Error ? err.message : "Network error. Is the server running?",
        };
      }
    },

    async register(
      username: string,
      email: string,
      password: string,
    ): Promise<{ success: boolean; error?: string }> {
      try {
        const res = await fetch("/api/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, email, password }),
        });

        const data = await res.json();

        if (!res.ok) {
          return {
            success: false,
            error: data.error || `Registration failed (${res.status})`,
          };
        }

        set({ token: data.token, user: data.user });
        startRefreshTimer();
        return { success: true };
      } catch (err) {
        return {
          success: false,
          error:
            err instanceof Error ? err.message : "Network error. Is the server running?",
        };
      }
    },

    logout() {
      stopRefreshTimer();
      set({ token: null, user: null });
    },

    getToken(): string | null {
      return get({ subscribe }).token;
    },

    getUser(): User | null {
      return get({ subscribe }).user;
    },
  };
}

export const auth = createAuthStore();
export const isAuthenticated = derived(auth, ($auth) => !!$auth.token);
export const currentUser = derived(auth, ($auth) => $auth.user);
