import { Hono } from "hono";
import type { Env, Session } from "../types";
import { createSession, clearSession, setOAuthState, getOAuthState, clearOAuthState } from "../auth";
import { generateToken } from "../utils";

type AuthEnv = { Bindings: Env; Variables: { session: Session | null; csrfToken: string } };

const auth = new Hono<AuthEnv>();

auth.get("/login", (c) => {
  const returnTo = c.req.query("returnTo") ?? "/dashboard";
  const state = generateToken();

  setOAuthState(c, state, returnTo);

  const params = new URLSearchParams({
    client_id: c.env.GITHUB_CLIENT_ID,
    redirect_uri: new URL("/auth/callback", c.req.url).toString(),
    state,
    scope: "read:user",
  });

  return c.redirect(`https://github.com/login/oauth/authorize?${params}`);
});

auth.get("/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");

  if (!code || !state) {
    return c.text("Missing code or state", 400);
  }

  // Verify state
  const stored = getOAuthState(c);
  if (!stored || stored.state !== state) {
    return c.text("Invalid state parameter", 400);
  }
  clearOAuthState(c);

  // Exchange code for access token
  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      client_id: c.env.GITHUB_CLIENT_ID,
      client_secret: c.env.GITHUB_CLIENT_SECRET,
      code,
    }),
  });

  const tokenData = (await tokenRes.json()) as { access_token?: string; error?: string };
  if (!tokenData.access_token) {
    return c.text(`OAuth error: ${tokenData.error ?? "unknown"}`, 400);
  }

  // Fetch user info
  const userRes = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "Quando",
    },
  });

  if (!userRes.ok) {
    return c.text("Failed to fetch user info from GitHub", 500);
  }

  const user = (await userRes.json()) as { id: number; login: string; avatar_url: string };

  // Create session
  await createSession(c, {
    github_id: String(user.id),
    github_login: user.login,
    avatar_url: user.avatar_url,
  });

  return c.redirect(stored.returnTo);
});

auth.post("/logout", (c) => {
  clearSession(c);
  return c.redirect("/");
});

export { auth };
