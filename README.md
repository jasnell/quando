# Quando

An open-source scheduling poll. Find a time that works for everyone.

Built on [Cloudflare Workers](https://workers.cloudflare.com/) with
[Hono](https://hono.dev/) and [D1](https://developers.cloudflare.com/d1/).

## Features

- **Visual date picker** — click dates on a calendar, add times, done
- **Weekly polls** — pick days of the week for recurring meetings
- **Timezone-aware** — set the poll timezone; respondents see their local time
- **Meeting duration** — 15-minute increments or custom
- **Yes / Maybe / No** — simple three-state responses
- **Best-slot highlighting** — top slots highlighted automatically
- **Response comments** — respondents can leave a note with their response
- **Response deadline** — optionally auto-close polls at a set time
- **Calendar invite** — download .ics file for the chosen time
- **Table or list view** — respondents toggle between layouts
- **Copy as Markdown** — export results for pasting into a GitHub issue
- **Poll templates** — reuse a poll's settings to create a new one
- **Dark mode** — automatic (system) or manual toggle
- **REST API** — full JSON API with token auth
- **MCP server** — AI assistant integration via Model Context Protocol
- **GitHub authentication** — all users sign in with GitHub
- **GDPR compliance** — data export, account deletion, privacy policy
- **Self-hostable** — one `wrangler deploy` and you're running

## Setup

### Prerequisites

- A [Cloudflare account](https://dash.cloudflare.com/sign-up)
- [Node.js](https://nodejs.org/) 18+
- A [GitHub OAuth App](https://github.com/settings/developers)

### Create the GitHub OAuth App

1. Go to https://github.com/settings/developers
2. Click **OAuth Apps** → **New OAuth App**
3. Set the callback URL to `http://localhost:8787/auth/callback` for local
   dev (update for production later)
4. Note the **Client ID** and generate a **Client Secret**

### Install dependencies

```bash
npm install
```

### Local development

Create a `.dev.vars` file:

```
GITHUB_CLIENT_ID=your_client_id
GITHUB_CLIENT_SECRET=your_client_secret
SESSION_SECRET=your_random_secret
```

Generate a session secret with `openssl rand -hex 32`.

Set up the local database and start the dev server:

```bash
npm run db:migrate:local
npm run dev
```

### Deploy to production

```bash
# Create the D1 database
npm run db:create

# Update wrangler.toml with the database_id from the output

# Run the schema migration
npx wrangler d1 execute quando-db --remote --file=src/db/schema.sql

# Set secrets
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
npx wrangler secret put SESSION_SECRET

# Deploy
npm run deploy
```

Update your GitHub OAuth App callback URL to
`https://quando.<your-subdomain>.workers.dev/auth/callback`.

## REST API

Quando has a JSON API for programmatic access. Authenticate with a Bearer token created on the dashboard.

### Authentication

1. Sign in at `/dashboard`
2. Under **API tokens**, create a token (choose an expiry)
3. Use it in the `Authorization` header:

```bash
curl -H "Authorization: Bearer quando_..." https://quando.jasnell.workers.dev/api/polls
```

### Endpoints

| Method   | Path                     | Description                          |
| -------- | ------------------------ | ------------------------------------ |
| `GET`    | `/api/polls`             | List your created + responded polls  |
| `POST`   | `/api/polls`             | Create a poll                        |
| `GET`    | `/api/polls/:id`         | Get poll with slots and responses    |
| `POST`   | `/api/polls/:id/respond` | Submit or update your response       |
| `POST`   | `/api/polls/:id/close`   | Close a poll (creator only)          |
| `POST`   | `/api/polls/:id/choose`  | Choose the winning slot (creator)    |
| `DELETE` | `/api/polls/:id`         | Delete a poll (creator only)         |

### Create a poll

```bash
curl -X POST https://quando.jasnell.workers.dev/api/polls \
  -H "Authorization: Bearer quando_..." \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Team sync",
    "timezone": "America/New_York",
    "poll_type": "datetime",
    "duration": 60,
    "slots": [
      { "date": "2026-08-03", "start_time": "09:00" },
      { "date": "2026-08-03", "start_time": "14:00" },
      { "date": "2026-08-04", "start_time": "10:00" }
    ]
  }'
```

### Respond to a poll

```bash
curl -X POST https://quando.jasnell.workers.dev/api/polls/POLL_ID/respond \
  -H "Authorization: Bearer quando_..." \
  -H "Content-Type: application/json" \
  -d '{
    "values": { "1": "yes", "2": "maybe", "3": "no" },
    "comment": "Prefer mornings"
  }'
```

Slot IDs are returned by `GET /api/polls/:id` in the `poll.slots` array.

## MCP Server

Quando includes an [MCP](https://modelcontextprotocol.io/) endpoint for AI assistants, served directly from the Worker at `/mcp`.

### Setup

1. Create an API token on the dashboard
2. Set the `QUANDO_API_TOKEN` environment variable
3. Configure your MCP client:

**opencode.json (remote — recommended):**
```json
{
  "mcp": {
    "quando": {
      "type": "remote",
      "url": "https://quando.jasnell.workers.dev/mcp",
      "headers": {
        "Authorization": "Bearer {env:QUANDO_API_TOKEN}"
      }
    }
  }
}
```

A stdio wrapper (`mcp/server.mjs`) is also available for clients that only support local servers:

**opencode.json (stdio):**
```json
{
  "mcp": {
    "quando": {
      "command": "node",
      "args": ["/path/to/quando/mcp/server.mjs"],
      "env": {
        "QUANDO_API_TOKEN": "quando_...",
        "QUANDO_BASE_URL": "https://quando.jasnell.workers.dev"
      }
    }
  }
}
```

### Example prompts

Once configured, you can ask your AI assistant things like:

- "Create a poll for our team sync next week — offer Tuesday, Wednesday, and Thursday at 10am and 2pm EST"
- "What polls do I have open?"
- "Show me the responses for the Q3 planning poll"
- "Mark me as yes for the morning slots and maybe for the afternoon ones on the team sync poll"
- "Which slot has the most yes votes on the team sync? Choose that one and close the poll"
- "Create a new poll using the same settings as the Q3 planning poll but for next month"
- "Add a note to my response on the design review poll saying I can only do 30 minutes"

### Available tools

| Tool               | Description                                      |
| ------------------ | ------------------------------------------------ |
| `list_polls`       | List polls you created and responded to           |
| `get_poll`         | Get poll details, slots, responses                |
| `create_poll`      | Create a new scheduling poll                      |
| `respond_to_poll`  | Submit yes/no/maybe for each slot                 |
| `close_poll`       | Close a poll (stops accepting responses)          |
| `choose_slot`      | Mark the winning time slot                        |
| `delete_poll`      | Permanently delete a poll                         |

## Project structure

```
src/
├── index.tsx            # Entry point, middleware, cron handler
├── types.ts             # TypeScript types
├── auth.ts              # GitHub OAuth, sessions, CSRF
├── utils.ts             # Date formatting, .ics generation
├── routes/
│   ├── auth.ts          # OAuth login/callback/logout
│   ├── polls.tsx        # Poll CRUD, responses, .ics download
│   ├── api.ts           # REST API (JSON, Bearer token auth)
│   ├── mcp.ts           # MCP endpoint (JSON-RPC, Bearer token auth)
│   └── dashboard.tsx    # User's poll list, token management
├── db/
│   ├── schema.sql       # D1 schema
│   └── queries.ts       # Database queries
└── views/
    ├── layout.tsx       # HTML shell, theme toggle
    ├── landing.tsx      # Home page
    ├── poll-new.tsx     # Create poll form (+ template support)
    ├── poll.tsx         # Poll view + response form
    ├── poll-admin.tsx   # Admin controls
    ├── dashboard.tsx    # Poll list, API tokens, data export
    └── stats.tsx        # Usage stats
public/
├── style.css            # Stylesheet (light + dark mode)
├── favicon.svg          # Logo
├── poll-create.js       # Calendar picker, timezone selector
└── poll-respond.js      # Response toggling, view toggle, tz conversion
mcp/
└── server.mjs           # MCP server (stdio, wraps REST API)
```

## License

MIT
