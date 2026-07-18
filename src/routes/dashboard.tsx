import { Hono } from "hono";
import type { Env, Session } from "../types";
import { requireAuth } from "../auth";
import * as db from "../db/queries";
import { Dashboard } from "../views/dashboard";

type DashEnv = { Bindings: Env; Variables: { session: Session | null; csrfToken: string } };

const dashboard = new Hono<DashEnv>();

dashboard.get("/dashboard", requireAuth, async (c) => {
  const session = c.get("session")!;
  const [polls, stats] = await Promise.all([
    db.listPollsByCreator(c.env.DB, session.github_id),
    db.getSiteStats(c.env.DB),
  ]);
  return c.html(<Dashboard session={session} polls={polls} stats={stats} />);
});

export { dashboard };
