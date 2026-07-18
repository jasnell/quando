import { Hono } from "hono";
import type { Env, Session } from "../types";
import { requireAuth } from "../auth";
import { isPollExpired, generateICS } from "../utils";
import * as db from "../db/queries";
import { PollView } from "../views/poll";
import type { OgMeta } from "../views/layout";
import { PollNew } from "../views/poll-new";
import { PollAdmin } from "../views/poll-admin";

type PollEnv = { Bindings: Env; Variables: { session: Session | null; csrfToken: string; cspNonce: string } };

const polls = new Hono<PollEnv>();

// --- Create poll ---

polls.get("/new", requireAuth, async (c) => {
  const session = c.get("session")!;
  const csrfToken = c.get("csrfToken");
  const cspNonce = c.get("cspNonce");

  // Support "use as template" — load source poll if ?from= is provided
  const fromId = c.req.query("from");
  let template = undefined;
  if (fromId) {
    template = await db.getPollWithSlots(c.env.DB, fromId) ?? undefined;
  }

  return c.html(<PollNew session={session} csrfToken={csrfToken} cspNonce={cspNonce} template={template} />);
});

polls.post("/new", requireAuth, async (c) => {
  const session = c.get("session")!;
  const csrfToken = c.get("csrfToken");
  const cspNonce = c.get("cspNonce");
  const form = await c.req.formData();

  // Rate limits
  const limits = await db.getCreatorLimits(c.env.DB, session.github_id);
  if (limits.activeCount >= 10) {
    return c.html(
      <PollNew session={session} csrfToken={csrfToken} cspNonce={cspNonce} error="You have reached the limit of 10 active polls. Close or delete an existing poll first." />,
      429
    );
  }
  if (limits.recentCount >= 5) {
    return c.html(
      <PollNew session={session} csrfToken={csrfToken} cspNonce={cspNonce} error="You can create at most 5 polls per hour. Please try again later." />,
      429
    );
  }

  const title = (form.get("title") as string | null)?.trim();
  const description = (form.get("description") as string | null)?.trim() || null;
  let link: string | null = null;
  const rawLink = (form.get("link") as string | null)?.trim() || null;
  if (rawLink && rawLink.length <= 2000) {
    try {
      const url = new URL(rawLink);
      if (url.protocol === "https:" || url.protocol === "http:") {
        link = rawLink;
      } else {
        return c.html(<PollNew session={session} csrfToken={csrfToken} cspNonce={cspNonce} error="Link must be an http or https URL." />, 400);
      }
    } catch {
      return c.html(<PollNew session={session} csrfToken={csrfToken} cspNonce={cspNonce} error="Link must be a valid URL." />, 400);
    }
  }
  const timezone = (form.get("timezone") as string | null)?.trim() ?? "UTC";
  const scheduleMode = (form.get("schedule_mode") as string | null) === "weekly" ? "weekly" as const : "specific" as const;
  const pollType = (form.get("poll_type") as string | null) === "date" ? "date" : "datetime";
  const responsesHidden = form.get("responses_hidden") === "1";

  // Parse response deadline
  let closesAt: string | null = null;
  const rawClosesAt = (form.get("closes_at") as string | null)?.trim() || null;
  if (rawClosesAt) {
    // Validate it's a reasonable datetime
    const closesDate = new Date(rawClosesAt);
    if (isNaN(closesDate.getTime())) {
      return c.html(<PollNew session={session} csrfToken={csrfToken} cspNonce={cspNonce} error="Invalid deadline date." />, 400);
    }
    if (closesDate.getTime() < Date.now()) {
      return c.html(<PollNew session={session} csrfToken={csrfToken} cspNonce={cspNonce} error="Deadline must be in the future." />, 400);
    }
    closesAt = closesDate.toISOString();
  }

  // Parse duration (only for datetime polls)
  let duration: number | null = null;
  if (pollType === "datetime") {
    const rawDuration = (form.get("duration") as string | null)?.trim();
    if (rawDuration && rawDuration !== "custom") {
      duration = parseInt(rawDuration, 10);
    } else if (rawDuration === "custom") {
      const customVal = (form.get("custom_duration") as string | null)?.trim();
      duration = customVal ? parseInt(customVal, 10) : null;
    }
    if (duration !== null && (isNaN(duration) || duration < 5 || duration > 480)) {
      return c.html(<PollNew session={session} csrfToken={csrfToken} cspNonce={cspNonce} error="Duration must be between 5 and 480 minutes." />, 400);
    }
  }

  // Validate title
  if (!title || title.length > 200) {
    return c.html(<PollNew session={session} csrfToken={csrfToken} cspNonce={cspNonce} error="Title is required (max 200 characters)." />, 400);
  }

  // Parse slots from form data
  // Slots are submitted as slot_date[] and slot_time[] arrays
  const slotDates = form.getAll("slot_date") as string[];
  const slotTimes = form.getAll("slot_time") as string[];

  if (slotDates.length === 0) {
    return c.html(<PollNew session={session} csrfToken={csrfToken} cspNonce={cspNonce} error="At least one date must be selected." />, 400);
  }

  if (slotDates.length > 50) {
    return c.html(<PollNew session={session} csrfToken={csrfToken} cspNonce={cspNonce} error="Maximum 50 slots allowed." />, 400);
  }

  // Build slot objects
  const slots: { date: string; start_time: string | null }[] = [];
  for (let i = 0; i < slotDates.length; i++) {
    const date = slotDates[i]!;
    const time = pollType === "datetime" ? (slotTimes[i] ?? null) : null;

    // Validate date format
    const validWeekdays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
    if (scheduleMode === "weekly") {
      if (!validWeekdays.includes(date)) {
        return c.html(<PollNew session={session} csrfToken={csrfToken} cspNonce={cspNonce} error={`Invalid day: ${date}`} />, 400);
      }
    } else {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return c.html(<PollNew session={session} csrfToken={csrfToken} cspNonce={cspNonce} error={`Invalid date: ${date}`} />, 400);
      }
    }

    // Validate time format (HH:MM) if present
    if (time && !/^\d{2}:\d{2}$/.test(time)) {
      return c.html(<PollNew session={session} csrfToken={csrfToken} cspNonce={cspNonce} error={`Invalid time: ${time}`} />, 400);
    }

    slots.push({ date, start_time: time || null });
  }

  const pollId = crypto.randomUUID();

  await db.createPoll(
    c.env.DB,
    {
      id: pollId,
      creator_github_id: session.github_id,
      creator_login: session.github_login,
      title,
      description,
      link,
      timezone,
      schedule_mode: scheduleMode,
      poll_type: pollType,
      duration,
      responses_hidden: responsesHidden,
      closes_at: closesAt,
    },
    slots
  );

  return c.redirect(`/p/${pollId}`);
});

// --- View poll ---

polls.get("/p/:id", requireAuth, async (c) => {
  const session = c.get("session")!;
  const csrfToken = c.get("csrfToken");
  const cspNonce = c.get("cspNonce");
  const pollId = c.req.param("id") as string;

  const poll = await db.getPollWithSlots(c.env.DB, pollId);
  if (!poll) {
    return c.text("Poll not found", 404);
  }

  const responses = await db.getResponses(c.env.DB, pollId);
  const userResponse = await db.getUserResponse(c.env.DB, pollId, session.github_id);

  // Build OG metadata for social sharing
  const isClosed = poll.closed_at !== null;
  const slotCount = poll.slots.length;
  const respCount = responses.length;
  const status = isClosed ? "Closed" : "Open";
  const parts: string[] = [];
  if (poll.description) {
    parts.push(poll.description.length > 120 ? poll.description.slice(0, 117) + "..." : poll.description);
  }
  parts.push(`${slotCount} time slot${slotCount !== 1 ? "s" : ""} · ${respCount} response${respCount !== 1 ? "s" : ""} · ${status}`);
  const reqUrl = new URL(c.req.url);
  const ogMeta: OgMeta = {
    title: poll.title,
    description: parts.join(" — "),
    url: `${reqUrl.origin}/p/${poll.id}`,
    image: `${reqUrl.origin}/og-image.png`,
  };

  return c.html(
    <PollView session={session} csrfToken={csrfToken} poll={poll} responses={responses} userResponse={userResponse} cspNonce={cspNonce} ogMeta={ogMeta} />
  );
});

// --- Respond to poll ---

polls.post("/p/:id/respond", requireAuth, async (c) => {
  const session = c.get("session")!;
  const pollId = c.req.param("id") as string;

  const poll = await db.getPollWithSlots(c.env.DB, pollId);
  if (!poll) {
    return c.text("Poll not found", 404);
  }

  if (poll.closed_at) {
    return c.text("Poll is closed", 400);
  }

  if (isPollExpired(poll.slots, poll.timezone, poll.duration, poll.schedule_mode)) {
    return c.text("Poll has expired", 400);
  }

  if (poll.closes_at && new Date(poll.closes_at).getTime() <= Date.now()) {
    return c.text("Response deadline has passed", 400);
  }

  const form = await c.req.formData();
  const slotValues: { slot_id: number; value: "yes" | "no" | "maybe" }[] = [];

  for (const slot of poll.slots) {
    const value = (form.get(`slot_${slot.id}`) as string | null) ?? "no";
    if (value !== "yes" && value !== "no" && value !== "maybe") {
      return c.text(`Invalid value for slot ${slot.id}`, 400);
    }
    slotValues.push({ slot_id: slot.id, value });
  }

  let comment = (form.get("comment") as string | null)?.trim() || null;
  if (comment && comment.length > 500) {
    comment = comment.slice(0, 500);
  }
  const respondentTz = (form.get("respondent_timezone") as string | null)?.trim() || null;
  await db.upsertResponse(c.env.DB, pollId, session.github_id, session.github_login, slotValues, comment, respondentTz);

  return c.redirect(`/p/${pollId}`);
});

// --- Admin ---

polls.get("/p/:id/admin", requireAuth, async (c) => {
  const session = c.get("session")!;
  const csrfToken = c.get("csrfToken");
  const cspNonce = c.get("cspNonce");
  const pollId = c.req.param("id") as string;

  const poll = await db.getPollWithSlots(c.env.DB, pollId);
  if (!poll) {
    return c.text("Poll not found", 404);
  }

  if (poll.creator_github_id !== session.github_id) {
    return c.text("Forbidden", 403);
  }

  const responses = await db.getResponses(c.env.DB, pollId);

  return c.html(<PollAdmin session={session} csrfToken={csrfToken} poll={poll} responses={responses} cspNonce={cspNonce} />);
});

polls.post("/p/:id/close", requireAuth, async (c) => {
  const session = c.get("session")!;
  const pollId = c.req.param("id") as string;

  const poll = await db.getPoll(c.env.DB, pollId);
  if (!poll || poll.creator_github_id !== session.github_id) {
    return c.text("Forbidden", 403);
  }

  await db.closePoll(c.env.DB, pollId);
  return c.redirect(`/p/${pollId}/admin`);
});

polls.post("/p/:id/choose", requireAuth, async (c) => {
  const session = c.get("session")!;
  const pollId = c.req.param("id") as string;

  const poll = await db.getPoll(c.env.DB, pollId);
  if (!poll || poll.creator_github_id !== session.github_id) {
    return c.text("Forbidden", 403);
  }

  const form = await c.req.formData();
  const slotId = Number(form.get("slot_id"));
  if (!slotId) {
    return c.text("Invalid slot", 400);
  }

  await db.chooseSlot(c.env.DB, pollId, slotId);
  return c.redirect(`/p/${pollId}/admin`);
});

// --- Calendar invite (.ics) download ---

polls.get("/p/:id/ics", requireAuth, async (c) => {
  const pollId = c.req.param("id") as string;

  const poll = await db.getPollWithSlots(c.env.DB, pollId);
  if (!poll) {
    return c.text("Poll not found", 404);
  }

  if (!poll.chosen_slot) {
    return c.text("No time has been chosen yet", 400);
  }

  // Weekly polls don't have concrete dates — skip .ics
  if (poll.schedule_mode === "weekly") {
    return c.text("Calendar invites are not available for weekly polls", 400);
  }

  const slot = poll.slots.find((s) => s.id === poll.chosen_slot);
  if (!slot) {
    return c.text("Chosen slot not found", 400);
  }

  const ics = generateICS(poll, slot);

  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="quando-${pollId.slice(0, 8)}.ics"`,
    },
  });
});

polls.post("/p/:id/delete", requireAuth, async (c) => {
  const session = c.get("session")!;
  const pollId = c.req.param("id") as string;

  const poll = await db.getPoll(c.env.DB, pollId);
  if (!poll || poll.creator_github_id !== session.github_id) {
    return c.text("Forbidden", 403);
  }

  await db.deletePoll(c.env.DB, pollId);
  return c.redirect("/dashboard");
});

export { polls };
