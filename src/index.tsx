import { Hono } from "hono";
import type { Env, Session } from "./types";
import { sessionMiddleware, validateCsrf } from "./auth";
import { auth } from "./routes/auth";
import { polls } from "./routes/polls";
import { dashboard } from "./routes/dashboard";
import { api } from "./routes/api";
import { mcp as mcpRoute } from "./routes/mcp";
import { Landing } from "./views/landing";
import { Privacy } from "./views/privacy";
import { getSiteStats } from "./db/queries";

type AppEnv = { Bindings: Env; Variables: { session: Session | null; cspNonce: string } };

const app = new Hono<AppEnv>();

// Security headers for HTML pages (generate per-request nonce for inline scripts)
app.use("*", async (c, next) => {
  // Skip CSP/session overhead for API and MCP routes — they have their own Bearer auth
  if (c.req.path.startsWith("/api/") || c.req.path.startsWith("/mcp")) {
    await next();
    c.header("X-Content-Type-Options", "nosniff");
    return;
  }

  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const nonce = btoa(String.fromCharCode(...bytes));
  c.set("cspNonce", nonce);
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header(
    "Content-Security-Policy",
    `default-src 'none'; script-src 'self' 'nonce-${nonce}'; style-src 'self'; img-src 'self' https://avatars.githubusercontent.com; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`
  );
});

// Session middleware runs on all non-API routes
app.use("*", async (c, next) => {
  if (c.req.path.startsWith("/api/") || c.req.path.startsWith("/mcp")) {
    return next();
  }
  return sessionMiddleware(c, next);
});

// CSRF validation on all POSTs (except /auth/* which handles its own state, and /api/* which uses tokens)
app.use("/new", validateCsrf);
app.use("/p/*", validateCsrf);
app.use("/account/*", validateCsrf);
app.use("/api-tokens/*", validateCsrf);

// Landing page
app.get("/", async (c) => {
  const session = c.get("session");
  if (session) {
    return c.redirect("/dashboard");
  }
  const stats = await getSiteStats(c.env.DB);
  const reqUrl = new URL(c.req.url);
  const ogMeta = {
    title: "Quando — Find a time that works for everyone",
    description: "Create a scheduling poll, share the link, see who's free. Open-source, timezone-aware, no fuss.",
    url: reqUrl.origin,
    image: `${reqUrl.origin}/og-image.png`,
  };
  return c.html(<Landing session={session} stats={stats} cspNonce={c.get("cspNonce")} ogMeta={ogMeta} />);
});

// Privacy policy
app.get("/privacy", (c) => {
  const session = c.get("session");
  return c.html(<Privacy session={session} cspNonce={c.get("cspNonce")} />);
});

// Mount route groups
app.route("/auth", auth);
app.route("/api", api);
app.route("/mcp", mcpRoute);
app.route("/", polls);
app.route("/", dashboard);

// --- Scheduled handler: cleanup old polls ---
export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext) {
    // Auto-close polls whose response deadline has passed
    await env.DB.prepare(
      "UPDATE polls SET closed_at = datetime('now') WHERE closed_at IS NULL AND closes_at IS NOT NULL AND closes_at <= datetime('now')"
    ).run();

    // Delete closed polls older than 90 days
    await env.DB.prepare(
      "DELETE FROM polls WHERE closed_at IS NOT NULL AND closed_at < datetime('now', '-90 days')"
    ).run();

    // Delete open specific-date polls whose latest slot is more than 90 days in the past
    await env.DB.prepare(
      `DELETE FROM polls WHERE closed_at IS NULL AND schedule_mode = 'specific' AND id IN (
        SELECT p.id FROM polls p
        JOIN slots s ON s.poll_id = p.id
        GROUP BY p.id
        HAVING MAX(s.date) < date('now', '-90 days')
      )`
    ).run();

    // Delete open weekly polls older than 90 days (no date-based expiration)
    await env.DB.prepare(
      "DELETE FROM polls WHERE closed_at IS NULL AND schedule_mode = 'weekly' AND created_at < datetime('now', '-90 days')"
    ).run();

    // Delete expired API tokens (expired more than 7 days ago)
    await env.DB.prepare(
      "DELETE FROM api_tokens WHERE expires_at IS NOT NULL AND expires_at < datetime('now', '-7 days')"
    ).run();
  },
};
