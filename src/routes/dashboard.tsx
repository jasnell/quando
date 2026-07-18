import { Hono } from "hono";
import type { Env, Session } from "../types";
import { requireAuth, clearSession } from "../auth";
import * as db from "../db/queries";
import { Dashboard } from "../views/dashboard";

type DashEnv = { Bindings: Env; Variables: { session: Session | null; csrfToken: string } };

const dashboard = new Hono<DashEnv>();

dashboard.get("/dashboard", requireAuth, async (c) => {
  const session = c.get("session")!;
  const csrfToken = c.get("csrfToken");
  const [polls, stats] = await Promise.all([
    db.listPollsByCreator(c.env.DB, session.github_id),
    db.getSiteStats(c.env.DB),
  ]);
  return c.html(<Dashboard session={session} csrfToken={csrfToken} polls={polls} stats={stats} />);
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
