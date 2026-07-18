# Quando

An open-source scheduling poll. Find a time that works for everyone.

Built on [Cloudflare Workers](https://workers.cloudflare.com/) with
[Hono](https://hono.dev/) and [D1](https://developers.cloudflare.com/d1/).

## Features

- **Visual date picker** — click dates on a calendar, add times, done
- **Timezone-aware** — set the poll timezone; respondents see their local time
- **Meeting duration** — 15-minute increments or custom
- **Yes / Maybe / No** — simple three-state responses
- **Table or list view** — respondents toggle between layouts
- **Copy as Markdown** — export results for pasting into a GitHub issue
- **GitHub authentication** — all users sign in with GitHub
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

## Project structure

```
src/
├── index.tsx            # Entry point, middleware, cron handler
├── types.ts             # TypeScript types
├── auth.ts              # GitHub OAuth, sessions, CSRF
├── utils.ts             # Date formatting, expiration checks
├── routes/
│   ├── auth.ts          # OAuth login/callback/logout
│   ├── polls.tsx        # Poll CRUD, responses
│   └── dashboard.tsx    # User's poll list
├── db/
│   ├── schema.sql       # D1 schema
│   └── queries.ts       # Database queries
└── views/
    ├── layout.tsx       # HTML shell
    ├── landing.tsx      # Home page
    ├── poll-new.tsx     # Create poll form
    ├── poll.tsx         # Poll view + response form
    ├── poll-admin.tsx   # Admin controls
    ├── dashboard.tsx    # Poll list
    └── stats.tsx        # Usage stats
public/
├── style.css            # Stylesheet
├── favicon.svg          # Logo
├── poll-create.js       # Calendar picker, timezone selector
└── poll-respond.js      # Response toggling, view toggle
```

## License

MIT
