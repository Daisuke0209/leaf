/**
 * Browser-side Google auth via Google Identity Services (GIS) token client.
 *
 * No server, no client secret: the browser gets short-lived (~1h) access
 * tokens directly from Google. There is no refresh token, and GIS token
 * requests always go through a popup — which browsers block unless the
 * request comes from a user gesture. So `getAccessToken()` never talks to
 * GIS: it returns the cached token or throws `AuthNeededError`, and the UI
 * surfaces a button whose click handler calls `connectInteractive()`.
 *
 * Scopes: `drive.file` (only files the app created or the user opened with
 * it), `drive.install` (puts Leaf in Drive's "Open with"/"New" menus),
 * plus `openid email profile` for the account label in the UI.
 */

const GIS_SRC = "https://accounts.google.com/gsi/client";

const SCOPE =
  "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.install openid email profile";

/** localStorage: account hint for silent token requests + UI label. */
const PROFILE_KEY = "leaf_profile";
/**
 * localStorage: token cache (~1h) shared across tabs — Drive's "New"/"Open
 * with" open a fresh tab each time, which must reuse the token instead of
 * asking the user to reconnect per tab.
 */
const TOKEN_KEY = "leaf_token";

const EXPIRY_MARGIN_MS = 60_000;

/** Thrown when Google needs user interaction to issue a token. */
export class AuthNeededError extends Error {
  constructor() {
    super("Google authorization requires user interaction");
    this.name = "AuthNeededError";
  }
}

export interface Profile {
  email?: string;
  name?: string;
}

interface TokenResponse {
  access_token?: string;
  expires_in?: number | string;
  error?: string;
}

interface TokenClient {
  requestAccessToken(config?: { prompt?: string }): void;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(config: {
            client_id: string;
            scope: string;
            hint?: string;
            callback: (response: TokenResponse) => void;
            error_callback?: (error: unknown) => void;
          }): TokenClient;
          revoke(token: string, callback?: () => void): void;
        };
      };
    };
  }
}

function clientId(): string {
  const v = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!v) throw new Error("NEXT_PUBLIC_GOOGLE_CLIENT_ID is not set");
  return v;
}

// Web Storage can throw (private mode, storage full); treat it as absent.
function safeRead(storage: Storage, key: string): unknown {
  try {
    const raw = storage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

function safeWrite(storage: Storage, key: string, value: unknown): void {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

function safeRemove(storage: Storage, key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    // ignore
  }
}

let gisPromise: Promise<void> | null = null;

function loadGis(): Promise<void> {
  if (gisPromise !== null) {
    return gisPromise;
  }
  gisPromise = new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2 !== undefined) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = GIS_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      gisPromise = null;
      reject(new Error("Failed to load Google Identity Services"));
    };
    document.head.appendChild(script);
  });
  return gisPromise;
}

interface CachedToken {
  token: string;
  /** Epoch ms after which the token must not be used. */
  expiresAt: number;
}

function readCachedToken(): CachedToken | null {
  const parsed = safeRead(localStorage, TOKEN_KEY) as CachedToken | null;
  if (
    parsed === null ||
    typeof parsed.token !== "string" ||
    typeof parsed.expiresAt !== "number"
  ) {
    return null;
  }
  return parsed.expiresAt > Date.now() ? parsed : null;
}

/** Drops the cached token, e.g. after the API rejects it with 401. */
export function evictToken(): void {
  safeRemove(localStorage, TOKEN_KEY);
}

// The profile is exposed as a tiny external store (subscribe + cached
// snapshot) so React components can consume it via useSyncExternalStore.
// The cache also keeps the snapshot referentially stable between changes.
const profileListeners = new Set<() => void>();
let profileCache: { raw: string | null; value: Profile | null } = {
  raw: null,
  value: null,
};

/** Subscribe to profile changes (connect/disconnect). Returns unsubscribe. */
export function subscribeProfile(listener: () => void): () => void {
  profileListeners.add(listener);
  return () => profileListeners.delete(listener);
}

function emitProfileChange(): void {
  for (const listener of profileListeners) {
    listener();
  }
}

export function getStoredProfile(): Profile | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(PROFILE_KEY);
  } catch {
    raw = null;
  }
  if (raw !== profileCache.raw) {
    let value: Profile | null = null;
    if (raw !== null) {
      try {
        value = JSON.parse(raw) as Profile;
      } catch {
        value = null;
      }
    }
    profileCache = { raw, value };
  }
  return profileCache.value;
}

function requestToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    const tokenClient = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId(),
      scope: SCOPE,
      hint: getStoredProfile()?.email,
      callback: (response) => {
        if (response.error !== undefined || response.access_token === undefined) {
          reject(new AuthNeededError());
          return;
        }
        safeWrite(localStorage, TOKEN_KEY, {
          token: response.access_token,
          expiresAt:
            Date.now() +
            Number(response.expires_in ?? 3600) * 1000 -
            EXPIRY_MARGIN_MS,
        } satisfies CachedToken);
        resolve(response.access_token);
      },
      // Popup blocked or closed by the user.
      error_callback: () => reject(new AuthNeededError()),
    });
    // Empty prompt lets Google decide: silent when a session + prior consent
    // exist, consent UI otherwise.
    tokenClient.requestAccessToken({ prompt: "" });
  });
}

/**
 * Returns the cached access token, or throws `AuthNeededError` when there
 * is none — the caller should surface a `ConnectButton`. Never opens the
 * GIS popup itself: without a user gesture it would only get blocked.
 */
export async function getAccessToken(): Promise<string> {
  const cached = readCachedToken();
  if (cached !== null) {
    return cached.token;
  }
  throw new AuthNeededError();
}

// Single-flight: a double-click shares one popup instead of opening two.
let inflight: Promise<string> | null = null;

/**
 * Interactive connect — must be called from a user gesture (click), or the
 * popup gets blocked. Also fetches and stores the profile for the UI and
 * for `hint` on future token requests.
 */
export async function connectInteractive(): Promise<string> {
  const cached = readCachedToken();
  let token: string;
  if (cached !== null) {
    token = cached.token;
  } else {
    if (inflight === null) {
      inflight = (async () => {
        try {
          await loadGis();
          return await requestToken();
        } finally {
          inflight = null;
        }
      })();
    }
    token = await inflight;
  }
  try {
    const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const info = (await res.json()) as { email?: string; name?: string };
      safeWrite(localStorage, PROFILE_KEY, {
        email: info.email,
        name: info.name,
      } satisfies Profile);
      emitProfileChange();
    }
  } catch {
    // Profile is cosmetic; the token is what matters.
  }
  return token;
}

/** Revokes the current grant and forgets the account. */
export async function disconnect(): Promise<void> {
  const cached = readCachedToken();
  if (cached !== null) {
    try {
      await loadGis();
      window.google!.accounts.oauth2.revoke(cached.token);
    } catch {
      // Best effort — still clear local state.
    }
  }
  evictToken();
  safeRemove(localStorage, PROFILE_KEY);
  emitProfileChange();
}
