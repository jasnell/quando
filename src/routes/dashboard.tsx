import { Hono } from "hono";
import type { Env, Session } from "../types";
import { requireAuth, clearSession } from "../auth";
import * as db from "../db/queries";
import { Dashboard } from "../views/dashboard";

type DashEnv = { Bindings: Env; Variables: { session: Session | null; csrfToken: string; cspNonce: string } };

const dashboard = new Hono<DashEnv>();

dashboard.get("/dashboard", requireAuth, async (c) => {
  const session = c.get("session")!;
  const csrfToken = c.get("csrfToken");
  const cspNonce = c.get("cspNonce");
  const [polls, respondedPolls, stats, apiTokens] = await Promise.all([
    db.listPollsByCreator(c.env.DB, session.github_id),
    db.listPollsRespondedTo(c.env.DB, session.github_id),
    db.getSiteStats(c.env.DB),
    db.listApiTokens(c.env.DB, session.github_id),
  ]);
  const newToken = c.req.query("new_token") ?? undefined;
  return c.html(<Dashboard session={session} csrfToken={csrfToken} polls={polls} respondedPolls={respondedPolls} stats={stats} apiTokens={apiTokens} newToken={newToken} cspNonce={cspNonce} />);
});

dashboard.post("/api-tokens/create", requireAuth, async (c) => {
  const session = c.get("session")!;
  const form = await c.req.formData();
  const name = (form.get("token_name") as string | null)?.trim() || "Untitled";
  const expiry = (form.get("token_expiry") as string | null) ?? "90";

  // Limit to 10 tokens
  const existing = await db.listApiTokens(c.env.DB, session.github_id);
  if (existing.length >= 10) {
    return c.redirect("/dashboard");
  }

  // Calculate expiration
  let expiresAt: string | null = null;
  if (expiry !== "never") {
    const days = parseInt(expiry, 10);
    if (!isNaN(days) && days > 0) {
      const d = new Date();
      d.setDate(d.getDate() + days);
      expiresAt = d.toISOString();
    }
  }

  const token = await db.createApiToken(c.env.DB, session.github_id, session.github_login, name.slice(0, 100), expiresAt);
  return c.redirect(`/dashboard?new_token=${encodeURIComponent(token)}`);
});

dashboard.post("/api-tokens/:id/revoke", requireAuth, async (c) => {
  const session = c.get("session")!;
  const tokenId = Number(c.req.param("id"));
  if (tokenId) {
    await db.revokeApiToken(c.env.DB, tokenId, session.github_id);
  }
  return c.redirect("/dashboard");
});

dashboard.get("/account/export", requireAuth, async (c) => {
  const session = c.get("session")!;
  const data = await db.exportUserData(c.env.DB, session.github_id);
  return c.json(data, 200, {
    "Content-Disposition": `attachment; filename="quando-data-${session.github_login}.json"`,
  });
});

dashboard.post("/account/delete", requireAuth, async (c) => {
  const session = c.get("session")!;
  await db.deleteAllUserData(c.env.DB, session.github_id);
  clearSession(c);
  return c.redirect("/");
});

export { dashboard };
