import { Hono } from "hono";
import type { Env, Session } from "./types";
import { sessionMiddleware, validateCsrf } from "./auth";
import { auth } from "./routes/auth";
import { polls } from "./routes/polls";
import { dashboard } from "./routes/dashboard";
import { Landing } from "./views/landing";
import { Privacy } from "./views/privacy";
import { getSiteStats } from "./db/queries";

type AppEnv = { Bindings: Env; Variables: { session: Session | null } };

const app = new Hono<AppEnv>();

// Security headers
app.use("*", async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header(
    "Content-Security-Policy",
    "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' https://avatars.githubusercontent.com; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"
  );
});

// Session middleware runs on all routes
app.use("*", sessionMiddleware);

// CSRF validation on all POSTs (except /auth/* which handles its own state)
app.use("/new", validateCsrf);
app.use("/p/*", validateCsrf);
app.use("/account/*", validateCsrf);

// Landing page
app.get("/", async (c) => {
  const session = c.get("session");
  if (session) {
    return c.redirect("/dashboard");
  }
  const stats = await getSiteStats(c.env.DB);
  return c.html(<Landing session={session} stats={stats} />);
});

// Privacy policy
app.get("/privacy", (c) => {
  const session = c.get("session");
  return c.html(<Privacy session={session} />);
});

// Mount route groups
app.route("/auth", auth);
app.route("/", polls);
app.route("/", dashboard);

// --- Scheduled handler: cleanup old polls ---
export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext) {
    // Delete closed polls older than 90 days
    await env.DB.prepare(
      "DELETE FROM polls WHERE closed_at IS NOT NULL AND closed_at < datetime('now', '-90 days')"
    ).run();

    // Delete open polls whose latest slot is more than 90 days in the past
    // (polls that were never closed but are long expired)
    await env.DB.prepare(
      `DELETE FROM polls WHERE closed_at IS NULL AND id IN (
        SELECT p.id FROM polls p
        JOIN slots s ON s.poll_id = p.id
        GROUP BY p.id
        HAVING MAX(s.date) < date('now', '-90 days')
      )`
    ).run();
  },
};
