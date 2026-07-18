import { Hono } from "hono";
import type { Env } from "../types";
import * as db from "../db/queries";
import { isPollExpired } from "../utils";

type ApiEnv = {
  Bindings: Env;
  Variables: { apiUser: { github_id: string; github_login: string } };
};

const api = new Hono<ApiEnv>();

// --- Bearer token auth middleware ---
api.use("*", async (c, next) => {
  const auth = c.req.header("Authorization");
  if (!auth?.startsWith("Bearer ")) {
    return c.json({ error: "Missing or invalid Authorization header" }, 401);
  }
  const token = auth.slice(7);
  const user = await db.validateApiToken(c.env.DB, token);
  if (!user) {
    return c.json({ error: "Invalid API token" }, 401);
  }
  c.set("apiUser", user);
  await next();
});

// --- List polls ---
api.get("/polls", async (c) => {
  const user = c.get("apiUser");
  const [created, responded] = await Promise.all([
    db.listPollsByCreator(c.env.DB, user.github_id),
    db.listPollsRespondedTo(c.env.DB, user.github_id),
  ]);
  // Merge and dedupe
  const seen = new Set(created.map((p) => p.id));
  const respondedOnly = responded.filter((p) => !seen.has(p.id));
  return c.json({
    created,
    responded: respondedOnly,
  });
});

// --- Get poll ---
api.get("/polls/:id", async (c) => {
  const pollId = c.req.param("id");
  const user = c.get("apiUser");

  const poll = await db.getPollWithSlots(c.env.DB, pollId);
  if (!poll) {
    return c.json({ error: "Poll not found" }, 404);
  }

  const isCreator = poll.creator_github_id === user.github_id;
  const isClosed = poll.closed_at !== null;
  const canSeeResponses = !poll.responses_hidden || isCreator || isClosed;

  const responses = canSeeResponses ? await db.getResponses(c.env.DB, pollId) : [];
  const userResponse = await db.getUserResponse(c.env.DB, pollId, user.github_id);

  return c.json({
    poll,
    responses,
    userResponse,
  });
});

// --- Create poll ---
api.post("/polls", async (c) => {
  const user = c.get("apiUser");
  const body = await c.req.json<{
    title: string;
    description?: string;
    link?: string;
    timezone?: string;
    schedule_mode?: "specific" | "weekly";
    poll_type?: "date" | "datetime";
    duration?: number;
    responses_hidden?: boolean;
    closes_at?: string;
    slots: { date: string; start_time?: string }[];
  }>();

  // Validate
  if (!body.title?.trim() || body.title.length > 200) {
    return c.json({ error: "Title is required (max 200 characters)" }, 400);
  }
  if (!body.slots?.length) {
    return c.json({ error: "At least one slot is required" }, 400);
  }
  if (body.slots.length > 50) {
    return c.json({ error: "Maximum 50 slots allowed" }, 400);
  }

  // Rate limits
  const limits = await db.getCreatorLimits(c.env.DB, user.github_id);
  if (limits.activeCount >= 10) {
    return c.json({ error: "Maximum 10 active polls reached" }, 429);
  }
  if (limits.recentCount >= 5) {
    return c.json({ error: "Maximum 5 polls per hour" }, 429);
  }

  // Validate link
  let link: string | null = null;
  if (body.link?.trim()) {
    try {
      const url = new URL(body.link);
      if (url.protocol !== "https:" && url.protocol !== "http:") {
        return c.json({ error: "Link must be http or https" }, 400);
      }
      link = body.link;
    } catch {
      return c.json({ error: "Invalid link URL" }, 400);
    }
  }

  // Validate deadline
  let closesAt: string | null = null;
  if (body.closes_at) {
    const d = new Date(body.closes_at);
    if (isNaN(d.getTime())) {
      return c.json({ error: "Invalid closes_at date" }, 400);
    }
    if (d.getTime() < Date.now()) {
      return c.json({ error: "Deadline must be in the future" }, 400);
    }
    closesAt = d.toISOString();
  }

  const pollId = crypto.randomUUID();
  const scheduleMode = body.schedule_mode ?? "specific";
  const pollType = body.poll_type ?? "datetime";
  const duration = pollType === "datetime" ? (body.duration ?? null) : null;

  const slots = body.slots.map((s) => ({
    date: s.date,
    start_time: pollType === "datetime" ? (s.start_time ?? null) : null,
  }));

  await db.createPoll(
    c.env.DB,
    {
      id: pollId,
      creator_github_id: user.github_id,
      creator_login: user.github_login,
      title: body.title.trim(),
      description: body.description?.trim() || null,
      link,
      timezone: body.timezone ?? "UTC",
      schedule_mode: scheduleMode,
      poll_type: pollType,
      duration,
      responses_hidden: body.responses_hidden ?? false,
      closes_at: closesAt,
    },
    slots
  );

  const poll = await db.getPollWithSlots(c.env.DB, pollId);
  return c.json({ poll }, 201);
});

// --- Respond to poll ---
api.post("/polls/:id/respond", async (c) => {
  const user = c.get("apiUser");
  const pollId = c.req.param("id");

  const poll = await db.getPollWithSlots(c.env.DB, pollId);
  if (!poll) {
    return c.json({ error: "Poll not found" }, 404);
  }
  if (poll.closed_at) {
    return c.json({ error: "Poll is closed" }, 400);
  }
  if (isPollExpired(poll.slots, poll.timezone, poll.duration, poll.schedule_mode)) {
    return c.json({ error: "Poll has expired" }, 400);
  }
  if (poll.closes_at && new Date(poll.closes_at).getTime() <= Date.now()) {
    return c.json({ error: "Response deadline has passed" }, 400);
  }

  const body = await c.req.json<{
    values: Record<string, "yes" | "no" | "maybe">;
    comment?: string;
  }>();

  // values is { slot_id: "yes"|"no"|"maybe" }
  const slotValues: { slot_id: number; value: "yes" | "no" | "maybe" }[] = [];
  for (const slot of poll.slots) {
    const value = body.values?.[String(slot.id)] ?? "no";
    if (value !== "yes" && value !== "no" && value !== "maybe") {
      return c.json({ error: `Invalid value for slot ${slot.id}: ${value}` }, 400);
    }
    slotValues.push({ slot_id: slot.id, value });
  }

  let comment = body.comment?.trim() || null;
  if (comment && comment.length > 500) {
    comment = comment.slice(0, 500);
  }

  await db.upsertResponse(c.env.DB, pollId, user.github_id, user.github_login, slotValues, comment);

  const userResponse = await db.getUserResponse(c.env.DB, pollId, user.github_id);
  return c.json({ response: userResponse });
});

// --- Close poll ---
api.post("/polls/:id/close", async (c) => {
  const user = c.get("apiUser");
  const pollId = c.req.param("id");

  const poll = await db.getPoll(c.env.DB, pollId);
  if (!poll) {
    return c.json({ error: "Poll not found" }, 404);
  }
  if (poll.creator_github_id !== user.github_id) {
    return c.json({ error: "Forbidden" }, 403);
  }

  await db.closePoll(c.env.DB, pollId);
  return c.json({ ok: true });
});

// --- Choose slot ---
api.post("/polls/:id/choose", async (c) => {
  const user = c.get("apiUser");
  const pollId = c.req.param("id");

  const poll = await db.getPollWithSlots(c.env.DB, pollId);
  if (!poll) {
    return c.json({ error: "Poll not found" }, 404);
  }
  if (poll.creator_github_id !== user.github_id) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const body = await c.req.json<{ slot_id: number }>();
  if (!body.slot_id || !poll.slots.some((s) => s.id === body.slot_id)) {
    return c.json({ error: "Invalid slot_id" }, 400);
  }

  await db.chooseSlot(c.env.DB, pollId, body.slot_id);
  return c.json({ ok: true });
});

// --- Delete poll ---
api.delete("/polls/:id", async (c) => {
  const user = c.get("apiUser");
  const pollId = c.req.param("id");

  const poll = await db.getPoll(c.env.DB, pollId);
  if (!poll) {
    return c.json({ error: "Poll not found" }, 404);
  }
  if (poll.creator_github_id !== user.github_id) {
    return c.json({ error: "Forbidden" }, 403);
  }

  await db.deletePoll(c.env.DB, pollId);
  return c.json({ ok: true });
});

export { api };
