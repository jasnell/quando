#!/usr/bin/env node

// Quando MCP Server — wraps the Quando REST API for AI assistants.
//
// Environment variables:
//   QUANDO_API_TOKEN  — API token (create one at /dashboard)
//   QUANDO_BASE_URL   — Base URL (default: https://quando.jasnell.workers.dev)

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const API_TOKEN = process.env.QUANDO_API_TOKEN;
const BASE_URL = (process.env.QUANDO_BASE_URL || "https://quando.jasnell.workers.dev").replace(/\/$/, "");

if (!API_TOKEN) {
  console.error("QUANDO_API_TOKEN environment variable is required");
  process.exit(1);
}

// --- API client ---

async function api(method, path, body) {
  const url = `${BASE_URL}/api${path}`;
  const opts = {
    method,
    headers: {
      Authorization: `Bearer ${API_TOKEN}`,
      "Content-Type": "application/json",
    },
  };
  if (body !== undefined) {
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `API error ${res.status}`);
  }
  return data;
}

// --- Tool definitions ---

const TOOLS = [
  {
    name: "list_polls",
    description:
      "List polls you created and polls you've responded to. Returns two arrays: 'created' and 'responded'.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_poll",
    description:
      "Get full details of a poll including slots, responses, and your response. Returns poll metadata, all slots with dates/times, response tallies, and your current response if any.",
    inputSchema: {
      type: "object",
      properties: {
        poll_id: {
          type: "string",
          description: "The poll UUID",
        },
      },
      required: ["poll_id"],
    },
  },
  {
    name: "create_poll",
    description:
      "Create a new scheduling poll. Returns the created poll with its slots.",
    inputSchema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Poll title (max 200 chars)",
        },
        description: {
          type: "string",
          description: "Optional description",
        },
        link: {
          type: "string",
          description: "Optional URL (e.g. GitHub issue link)",
        },
        timezone: {
          type: "string",
          description:
            "IANA timezone (e.g. America/New_York). Defaults to UTC.",
        },
        schedule_mode: {
          type: "string",
          enum: ["specific", "weekly"],
          description:
            "'specific' for calendar dates, 'weekly' for days of the week. Defaults to 'specific'.",
        },
        poll_type: {
          type: "string",
          enum: ["date", "datetime"],
          description:
            "'datetime' for specific times, 'date' for whole days. Defaults to 'datetime'.",
        },
        duration: {
          type: "number",
          description:
            "Meeting duration in minutes (5-480). Only for datetime polls.",
        },
        responses_hidden: {
          type: "boolean",
          description:
            "Hide responses until poll is closed. Defaults to false.",
        },
        closes_at: {
          type: "string",
          description:
            "Optional response deadline as ISO 8601 datetime string.",
        },
        slots: {
          type: "array",
          description:
            "Array of time slots. Each slot has a 'date' (YYYY-MM-DD or weekday name like 'monday') and optional 'start_time' (HH:MM).",
          items: {
            type: "object",
            properties: {
              date: {
                type: "string",
                description:
                  "Date (YYYY-MM-DD) or weekday name (e.g. 'monday')",
              },
              start_time: {
                type: "string",
                description: "Start time in HH:MM format (for datetime polls)",
              },
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
    description:
      "Submit or update your response to a poll. Provide yes/no/maybe for each slot by slot_id.",
    inputSchema: {
      type: "object",
      properties: {
        poll_id: {
          type: "string",
          description: "The poll UUID",
        },
        values: {
          type: "object",
          description:
            "Object mapping slot_id (as string) to 'yes', 'no', or 'maybe'. Get slot IDs from get_poll.",
          additionalProperties: {
            type: "string",
            enum: ["yes", "no", "maybe"],
          },
        },
        comment: {
          type: "string",
          description: "Optional note (max 500 chars)",
        },
      },
      required: ["poll_id", "values"],
    },
  },
  {
    name: "close_poll",
    description: "Close a poll you created. No more responses will be accepted.",
    inputSchema: {
      type: "object",
      properties: {
        poll_id: {
          type: "string",
          description: "The poll UUID",
        },
      },
      required: ["poll_id"],
    },
  },
  {
    name: "choose_slot",
    description:
      "Mark the winning time slot on a poll you created. This displays a banner on the poll page.",
    inputSchema: {
      type: "object",
      properties: {
        poll_id: {
          type: "string",
          description: "The poll UUID",
        },
        slot_id: {
          type: "number",
          description: "The slot ID to choose. Get slot IDs from get_poll.",
        },
      },
      required: ["poll_id", "slot_id"],
    },
  },
  {
    name: "delete_poll",
    description:
      "Permanently delete a poll you created and all its responses.",
    inputSchema: {
      type: "object",
      properties: {
        poll_id: {
          type: "string",
          description: "The poll UUID",
        },
      },
      required: ["poll_id"],
    },
  },
];

// --- MCP Server ---

const server = new Server(
  { name: "quando", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let result;

    switch (name) {
      case "list_polls":
        result = await api("GET", "/polls");
        break;

      case "get_poll":
        result = await api("GET", `/polls/${args.poll_id}`);
        break;

      case "create_poll":
        result = await api("POST", "/polls", {
          title: args.title,
          description: args.description,
          link: args.link,
          timezone: args.timezone,
          schedule_mode: args.schedule_mode,
          poll_type: args.poll_type,
          duration: args.duration,
          responses_hidden: args.responses_hidden,
          closes_at: args.closes_at,
          slots: args.slots,
        });
        break;

      case "respond_to_poll":
        result = await api("POST", `/polls/${args.poll_id}/respond`, {
          values: args.values,
          comment: args.comment,
        });
        break;

      case "close_poll":
        result = await api("POST", `/polls/${args.poll_id}/close`);
        break;

      case "choose_slot":
        result = await api("POST", `/polls/${args.poll_id}/choose`, {
          slot_id: args.slot_id,
        });
        break;

      case "delete_poll":
        result = await api("DELETE", `/polls/${args.poll_id}`);
        break;

      default:
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  } catch (err) {
    return {
      content: [{ type: "text", text: `Error: ${err.message}` }],
      isError: true,
    };
  }
});

// --- Start ---

const transport = new StdioServerTransport();
await server.connect(transport);
