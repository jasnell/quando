import { Hono } from "hono";
import type { Env } from "../types";
import * as db from "../db/queries";
import { isPollExpired } from "../utils";

type McpEnv = {
  Bindings: Env;
  Variables: { apiUser: { github_id: string; github_login: string } };
};

const mcp = new Hono<McpEnv>();

// --- Bearer token auth (same as REST API) ---
mcp.use("*", async (c, next) => {
  const auth = c.req.header("Authorization");
  if (!auth?.startsWith("Bearer ")) {
    return c.json(
      { jsonrpc: "2.0", error: { code: -32000, message: "Missing or invalid Authorization header" }, id: null },
      401,
    );
  }
  const token = auth.slice(7);
  const user = await db.validateApiToken(c.env.DB, token);
  if (!user) {
    return c.json(
      { jsonrpc: "2.0", error: { code: -32000, message: "Invalid API token" }, id: null },
      401,
    );
  }
  c.set("apiUser", user);
  await next();
});

// --- Tool definitions (same as mcp/server.mjs) ---

const TOOLS = [
  {
    name: "list_polls",
    description:
      "List polls you created and polls you've responded to. Returns two arrays: 'created' and 'responded'.",
    inputSchema: { type: "object" as const, properties: {}, required: [] as string[] },
  },
  {
    name: "get_poll",
    description:
      "Get full details of a poll including slots, responses, and your response.",
    inputSchema: {
      type: "object" as const,
      properties: {
        poll_id: { type: "string", description: "The poll UUID" },
      },
      required: ["poll_id"],
    },
  },
  {
    name: "create_poll",
    description: "Create a new scheduling poll. Returns the created poll with its slots.",
    inputSchema: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "Poll title (max 200 chars)" },
        description: { type: "string", description: "Optional description" },
        link: { type: "string", description: "Optional URL (e.g. GitHub issue link)" },
        timezone: { type: "string", description: "IANA timezone (e.g. America/New_York). Defaults to UTC." },
        schedule_mode: { type: "string", enum: ["specific", "weekly"], description: "'specific' for calendar dates, 'weekly' for days of the week." },
        poll_type: { type: "string", enum: ["date", "datetime"], description: "'datetime' for specific times, 'date' for whole days." },
        duration: { type: "number", description: "Duration in minutes (5-480). Only for datetime polls." },
        responses_hidden: { type: "boolean", description: "Hide responses until poll is closed." },
        closes_at: { type: "string", description: "Optional response deadline as ISO 8601 datetime." },
        slots: {
          type: "array",
          description: "Array of time slots. Each has 'date' (YYYY-MM-DD or weekday name) and optional 'start_time' (HH:MM).",
          items: {
            type: "object",
            properties: {
              date: { type: "string", description: "Date (YYYY-MM-DD) or weekday name" },
              start_time: { type: "string", description: "Start time HH:MM (for datetime polls)" },
            },
            required: ["date"],
          },
        },
      },
      required: ["title", "slots"],
    },
  },
  {
    name: "respond_to_poll",
    description: "Submit or update your response to a poll. Provide yes/no/maybe for each slot by slot_id.",
    inputSchema: {
      type: "object" as const,
      properties: {
        poll_id: { type: "string", description: "The poll UUID" },
        values: {
          type: "object",
          description: "Object mapping slot_id to 'yes', 'no', or 'maybe'.",
          additionalProperties: { type: "string", enum: ["yes", "no", "maybe"] },
        },
        comment: { type: "string", description: "Optional note (max 500 chars)" },
        timezone: { type: "string", description: "Responder's IANA timezone (e.g. America/New_York). Optional." },
      },
      required: ["poll_id", "values"],
    },
  },
  {
    name: "close_poll",
    description: "Close a poll you created. No more responses will be accepted.",
    inputSchema: {
      type: "object" as const,
      properties: { poll_id: { type: "string", description: "The poll UUID" } },
      required: ["poll_id"],
    },
  },
  {
    name: "choose_slot",
    description: "Mark the winning time slot on a poll you created.",
    inputSchema: {
      type: "object" as const,
      properties: {
        poll_id: { type: "string", description: "The poll UUID" },
        slot_id: { type: "number", description: "The slot ID to choose." },
      },
      required: ["poll_id", "slot_id"],
    },
  },
  {
    name: "delete_poll",
    description: "Permanently delete a poll you created and all its responses.",
    inputSchema: {
      type: "object" as const,
      properties: { poll_id: { type: "string", description: "The poll UUID" } },
      required: ["poll_id"],
    },
  },
];

// --- Tool execution (calls DB directly, no HTTP round-trip) ---

async function executeTool(
  name: string,
  args: Record<string, unknown>,
  dbBinding: D1Database,
  user: { github_id: string; github_login: string },
): Promise<{ content: { type: string; text: string }[]; isError?: boolean }> {
  try {
    let result: unknown;

    switch (name) {
      case "list_polls": {
        const [created, responded] = await Promise.all([
          db.listPollsByCreator(dbBinding, user.github_id),
          db.listPollsRespondedTo(dbBinding, user.github_id),
        ]);
        const seen = new Set(created.map((p) => p.id));
        const respondedOnly = responded.filter((p) => !seen.has(p.id));
        result = { created, responded: respondedOnly };
        break;
      }

      case "get_poll": {
        const poll = await db.getPollWithSlots(dbBinding, args.poll_id as string);
        if (!poll) return { content: [{ type: "text", text: "Poll not found" }], isError: true };
        const isCreator = poll.creator_github_id === user.github_id;
        const isClosed = poll.closed_at !== null;
        const canSee = !poll.responses_hidden || isCreator || isClosed;
        const responses = canSee ? await db.getResponses(dbBinding, args.poll_id as string) : [];
        const userResponse = await db.getUserResponse(dbBinding, args.poll_id as string, user.github_id);
        result = { poll, responses, userResponse };
        break;
      }

      case "create_poll": {
        const title = (args.title as string)?.trim();
        if (!title || title.length > 200) return { content: [{ type: "text", text: "Title required (max 200 chars)" }], isError: true };
        const slots = args.slots as { date: string; start_time?: string }[];
        if (!slots?.length) return { content: [{ type: "text", text: "At least one slot required" }], isError: true };
        if (slots.length > 50) return { content: [{ type: "text", text: "Max 50 slots" }], isError: true };

        const limits = await db.getCreatorLimits(dbBinding, user.github_id);
        if (limits.activeCount >= 10) return { content: [{ type: "text", text: "Max 10 active polls reached" }], isError: true };
        if (limits.recentCount >= 5) return { content: [{ type: "text", text: "Max 5 polls per hour" }], isError: true };

        let link: string | null = null;
        if (args.link && (args.link as string).trim()) {
          try {
            const u = new URL(args.link as string);
            if (u.protocol !== "https:" && u.protocol !== "http:") return { content: [{ type: "text", text: "Link must be http(s)" }], isError: true };
            link = args.link as string;
          } catch { return { content: [{ type: "text", text: "Invalid link URL" }], isError: true }; }
        }

        let closesAt: string | null = null;
        if (args.closes_at) {
          const d = new Date(args.closes_at as string);
          if (isNaN(d.getTime())) return { content: [{ type: "text", text: "Invalid closes_at date" }], isError: true };
          if (d.getTime() < Date.now()) return { content: [{ type: "text", text: "Deadline must be in the future" }], isError: true };
          closesAt = d.toISOString();
        }

        const pollId = crypto.randomUUID();
        const scheduleMode = (args.schedule_mode as string) ?? "specific";
        const pollType = (args.poll_type as string) ?? "datetime";
        const duration = pollType === "datetime" ? ((args.duration as number) ?? null) : null;

        const mappedSlots = slots.map((s) => ({
          date: s.date,
          start_time: pollType === "datetime" ? (s.start_time ?? null) : null,
        }));

        await db.createPoll(
          dbBinding,
          {
            id: pollId,
            creator_github_id: user.github_id,
            creator_login: user.github_login,
            title,
            description: (args.description as string)?.trim() || null,
            link,
            timezone: (args.timezone as string) ?? "UTC",
            schedule_mode: scheduleMode,
            poll_type: pollType,
            duration,
            responses_hidden: (args.responses_hidden as boolean) ?? false,
            closes_at: closesAt,
          },
          mappedSlots,
        );

        result = await db.getPollWithSlots(dbBinding, pollId);
        break;
      }

      case "respond_to_poll": {
        const poll = await db.getPollWithSlots(dbBinding, args.poll_id as string);
        if (!poll) return { content: [{ type: "text", text: "Poll not found" }], isError: true };
        if (poll.closed_at) return { content: [{ type: "text", text: "Poll is closed" }], isError: true };
        if (isPollExpired(poll.slots, poll.timezone, poll.duration, poll.schedule_mode))
          return { content: [{ type: "text", text: "Poll has expired" }], isError: true };
        if (poll.closes_at && new Date(poll.closes_at).getTime() <= Date.now())
          return { content: [{ type: "text", text: "Response deadline has passed" }], isError: true };

        const values = args.values as Record<string, string>;
        const slotValues: { slot_id: number; value: "yes" | "no" | "maybe" }[] = [];
        for (const slot of poll.slots) {
          const v = values?.[String(slot.id)] ?? "no";
          if (v !== "yes" && v !== "no" && v !== "maybe")
            return { content: [{ type: "text", text: `Invalid value for slot ${slot.id}: ${v}` }], isError: true };
          slotValues.push({ slot_id: slot.id, value: v as "yes" | "no" | "maybe" });
        }

        let comment = (args.comment as string)?.trim() || null;
        if (comment && comment.length > 500) comment = comment.slice(0, 500);
        const respTz = (args.timezone as string)?.trim() || null;

        await db.upsertResponse(dbBinding, args.poll_id as string, user.github_id, user.github_login, slotValues, comment, respTz);
        result = await db.getUserResponse(dbBinding, args.poll_id as string, user.github_id);
        break;
      }

      case "close_poll": {
        const poll = await db.getPoll(dbBinding, args.poll_id as string);
        if (!poll) return { content: [{ type: "text", text: "Poll not found" }], isError: true };
        if (poll.creator_github_id !== user.github_id) return { content: [{ type: "text", text: "Forbidden" }], isError: true };
        await db.closePoll(dbBinding, args.poll_id as string);
        result = { ok: true };
        break;
      }

      case "choose_slot": {
        const poll = await db.getPollWithSlots(dbBinding, args.poll_id as string);
        if (!poll) return { content: [{ type: "text", text: "Poll not found" }], isError: true };
        if (poll.creator_github_id !== user.github_id) return { content: [{ type: "text", text: "Forbidden" }], isError: true };
        if (!args.slot_id || !poll.slots.some((s) => s.id === (args.slot_id as number)))
          return { content: [{ type: "text", text: "Invalid slot_id" }], isError: true };
        await db.chooseSlot(dbBinding, args.poll_id as string, args.slot_id as number);
        result = { ok: true };
        break;
      }

      case "delete_poll": {
        const poll = await db.getPoll(dbBinding, args.poll_id as string);
        if (!poll) return { content: [{ type: "text", text: "Poll not found" }], isError: true };
        if (poll.creator_github_id !== user.github_id) return { content: [{ type: "text", text: "Forbidden" }], isError: true };
        await db.deletePoll(dbBinding, args.poll_id as string);
        result = { ok: true };
        break;
      }

      default:
        return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
    }

    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
  }
}

// --- JSON-RPC handler (Streamable HTTP transport) ---

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

mcp.post("/", async (c) => {
  const user = c.get("apiUser");
  const body = await c.req.json<JsonRpcRequest | JsonRpcRequest[]>();

  // Handle single request or batch
  const requests = Array.isArray(body) ? body : [body];
  const responses: unknown[] = [];

  for (const req of requests) {
    if (req.jsonrpc !== "2.0") {
      responses.push({ jsonrpc: "2.0", error: { code: -32600, message: "Invalid Request" }, id: req.id ?? null });
      continue;
    }

    // Notifications (no id) — acknowledge silently
    const isNotification = req.id === undefined || req.id === null;

    switch (req.method) {
      case "initialize":
        if (!isNotification) {
          responses.push({
            jsonrpc: "2.0",
            id: req.id,
            result: {
              protocolVersion: "2025-03-26",
              capabilities: { tools: {} },
              serverInfo: { name: "quando", version: "1.0.0" },
            },
          });
        }
        break;

      case "notifications/initialized":
        // Client acknowledgment — no response needed
        break;

      case "tools/list":
        if (!isNotification) {
          responses.push({
            jsonrpc: "2.0",
            id: req.id,
            result: { tools: TOOLS },
          });
        }
        break;

      case "tools/call": {
        const toolName = (req.params as { name: string })?.name;
        const toolArgs = ((req.params as { arguments?: Record<string, unknown> })?.arguments) ?? {};
        const toolResult = await executeTool(toolName, toolArgs, c.env.DB, user);

        if (!isNotification) {
          responses.push({
            jsonrpc: "2.0",
            id: req.id,
            result: toolResult,
          });
        }
        break;
      }

      default:
        if (!isNotification) {
          responses.push({
            jsonrpc: "2.0",
            error: { code: -32601, message: `Method not found: ${req.method}` },
            id: req.id,
          });
        }
        break;
    }
  }

  // Batch → array response; single → single response
  const result = Array.isArray(body) ? responses : responses[0];
  return c.json(result as object);
});

// Allow GET for session-less health check / capability discovery
mcp.get("/", (c) => {
  return c.json({
    name: "quando",
    version: "1.0.0",
    protocol: "mcp",
    protocolVersion: "2025-03-26",
  });
});

export { mcp };
