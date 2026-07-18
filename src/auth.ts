import type { Context, Next } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { Env, Session } from "./types";

type HonoContext = Context<{ Bindings: Env; Variables: { session: Session | null; csrfToken: string } }>;

const SESSION_COOKIE = "quando_session";
const OAUTH_STATE_COOKIE = "quando_oauth_state";
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// --- HMAC signing for session cookies ---

async function getSigningKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

async function sign(payload: string, secret: string): Promise<string> {
  const key = await getSigningKey(secret);
  const enc = new TextEncoder();
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return `${payload}.${sigB64}`;
}

async function verify(token: string, secret: string): Promise<string | null> {
  const dotIndex = token.lastIndexOf(".");
  if (dotIndex === -1) return null;

  const payload = token.slice(0, dotIndex);
  const sigB64 = token.slice(dotIndex + 1);

  const key = await getSigningKey(secret);
  const enc = new TextEncoder();
  const sig = Uint8Array.from(atob(sigB64), (c) => c.charCodeAt(0));

  const valid = await crypto.subtle.verify("HMAC", key, sig, enc.encode(payload));
  return valid ? payload : null;
}

// --- Session management ---

export async function createSession(c: HonoContext, session: Omit<Session, "expires_at">): Promise<void> {
  const data: Session = {
    ...session,
    expires_at: Date.now() + SESSION_DURATION_MS,
  };

  const payload = JSON.stringify(data);
  const token = await sign(payload, c.env.SESSION_SECRET);

  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_DURATION_MS / 1000,
  });
}

export async function getSession(c: HonoContext): Promise<Session | null> {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return null;

  const payload = await verify(token, c.env.SESSION_SECRET);
  if (!payload) return null;

  try {
    const session = JSON.parse(payload) as Session;
    if (session.expires_at < Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

export function clearSession(c: HonoContext): void {
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
}

// --- OAuth state (CSRF + return URL) ---

export function setOAuthState(c: HonoContext, state: string, returnTo: string): void {
  const value = JSON.stringify({ state, returnTo });
  setCookie(c, OAUTH_STATE_COOKIE, value, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: 600, // 10 minutes
  });
}

export function getOAuthState(c: HonoContext): { state: string; returnTo: string } | null {
  const value = getCookie(c, OAUTH_STATE_COOKIE);
  if (!value) return null;
  try {
    return JSON.parse(value) as { state: string; returnTo: string };
  } catch {
    return null;
  }
}

export function clearOAuthState(c: HonoContext): void {
  deleteCookie(c, OAUTH_STATE_COOKIE, { path: "/" });
}

// --- CSRF tokens ---

export async function generateCsrfToken(secret: string, sessionId: string): Promise<string> {
  const key = await getSigningKey(secret);
  const enc = new TextEncoder();
  const data = enc.encode(`csrf:${sessionId}`);
  const sig = await crypto.subtle.sign("HMAC", key, data);
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

export async function verifyCsrfToken(secret: string, sessionId: string, token: string): Promise<boolean> {
  const expected = await generateCsrfToken(secret, sessionId);
  // Constant-time comparison
  if (expected.length !== token.length) return false;
  let result = 0;
  for (let i = 0; i < expected.length; i++) {
    result |= expected.charCodeAt(i) ^ token.charCodeAt(i);
  }
  return result === 0;
}

// --- Middleware ---

export async function sessionMiddleware(c: HonoContext, next: Next): Promise<void | globalThis.Response> {
  const session = await getSession(c);
  c.set("session", session);

  // Generate CSRF token for authenticated users
  if (session) {
    const token = await generateCsrfToken(c.env.SESSION_SECRET, session.github_id);
    c.set("csrfToken", token);
  } else {
    c.set("csrfToken", "");
  }

  return next();
}

export async function requireAuth(c: HonoContext, next: Next): Promise<void | globalThis.Response> {
  const session = c.get("session");
  if (!session) {
    const returnTo = new URL(c.req.url).pathname;
    return c.redirect(`/auth/login?returnTo=${encodeURIComponent(returnTo)}`);
  }
  return next();
}

export async function validateCsrf(c: HonoContext, next: Next): Promise<void | globalThis.Response> {
  if (c.req.method !== "POST") return next();

  const session = c.get("session");
  if (!session) return c.text("Unauthorized", 401);

  const contentType = c.req.header("content-type") ?? "";
  let token: string | null = null;

  if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
    const form = await c.req.formData();
    token = form.get("_csrf") as string | null;
  }

  if (!token || !(await verifyCsrfToken(c.env.SESSION_SECRET, session.github_id, token))) {
    return c.text("Invalid CSRF token", 403);
  }

  return next();
}
