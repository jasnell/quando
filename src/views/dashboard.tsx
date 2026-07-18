import type { FC } from "hono/jsx";
import { Layout } from "./layout";
import type { Session, Poll, SiteStats } from "../types";
import type { ApiToken } from "../db/queries";
import { Stats } from "./stats";

interface DashboardProps {
  session: Session;
  csrfToken: string;
  polls: (Poll & { response_count: number })[];
  respondedPolls: Poll[];
  stats: SiteStats;
  apiTokens: ApiToken[];
  newToken?: string;
  cspNonce?: string;
}

export const Dashboard: FC<DashboardProps> = ({ session, csrfToken, polls, respondedPolls, stats, apiTokens, newToken, cspNonce }) => {
  return (
    <Layout title="My polls" session={session} csrfToken={csrfToken} cspNonce={cspNonce}>
      <div class="page-header">
        <h1>My polls</h1>
        <a href="/new" class="btn">
          New poll
        </a>
      </div>

      {polls.length === 0 ? (
        <div class="empty-state">
          <p>You haven't created any polls yet.</p>
          <a href="/new" class="btn btn-lg">
            Create your first poll
          </a>
        </div>
      ) : (
        <div class="poll-list">
          {polls.map((poll) => (
            <a href={`/p/${poll.id}`} class="poll-card">
              <div class="poll-card-header">
                <h3>{poll.title}</h3>
                {poll.closed_at && <span class="badge badge-closed">Closed</span>}
                {poll.chosen_slot && <span class="badge badge-chosen">Time chosen</span>}
              </div>
              <p class="poll-card-meta">
                Created {new Date(poll.created_at + "Z").toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
                {" "}&middot; {poll.timezone}
                {" "}&middot; {poll.response_count} response{poll.response_count !== 1 ? "s" : ""}
              </p>
              {poll.description && (
                <p class="poll-card-desc">
                  {poll.description.length > 120
                    ? poll.description.slice(0, 120) + "..."
                    : poll.description}
                </p>
              )}
            </a>
          ))}
        </div>
      )}

      {respondedPolls.length > 0 && (
        <>
           <div class="page-header pt-1">
            <h2>Polls I've responded to</h2>
          </div>
          <div class="poll-list">
            {respondedPolls.map((poll) => (
              <a href={`/p/${poll.id}`} class="poll-card">
                <div class="poll-card-header">
                  <h3>{poll.title}</h3>
                  {poll.closed_at && <span class="badge badge-closed">Closed</span>}
                  {poll.chosen_slot && <span class="badge badge-chosen">Time chosen</span>}
                </div>
                <p class="poll-card-meta">
                  by @{poll.creator_login}
                  {" "}&middot;{" "}
                  {new Date(poll.created_at + "Z").toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>
                {poll.description && (
                  <p class="poll-card-desc">
                    {poll.description.length > 120
                      ? poll.description.slice(0, 120) + "..."
                      : poll.description}
                  </p>
                )}
              </a>
            ))}
          </div>
        </>
      )}

      <Stats stats={stats} />

      <details class="account-section collapsible-section" open={!!newToken || undefined}>
        <summary><h2>API tokens</h2></summary>
        <p class="muted">
          Create tokens to use the Quando REST API or MCP server.
        </p>

        {newToken && (
          <div class="alert alert-token" role="alert">
            <strong>Token created!</strong> Copy it now — it won't be shown again.
            <div class="token-display">
              <code>{newToken}</code>
            </div>
          </div>
        )}

        {apiTokens.length > 0 && (
          <div class="token-list">
            {apiTokens.map((t) => {
              const isExpired = t.expires_at && new Date(t.expires_at).getTime() <= Date.now();
              return (
                <div class={`token-item ${isExpired ? "token-expired" : ""}`}>
                  <div>
                    <strong>{t.name}</strong>
                    {isExpired && <span class="badge badge-closed">Expired</span>}
                    <br />
                    <span class="muted">
                      Created {new Date(t.created_at + "Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      {t.expires_at
                        ? ` · ${isExpired ? "Expired" : "Expires"} ${new Date(t.expires_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
                        : " · Never expires"
                      }
                    </span>
                  </div>
                  <form method="post" action={`/api-tokens/${t.id}/revoke`} class="inline-form">
                    <input type="hidden" name="_csrf" value={csrfToken} />
                    <button type="submit" class="btn-link text-error" data-confirm="Revoke this API token? Any tools using it will stop working.">
                      Revoke
                    </button>
                  </form>
                </div>
              );
            })}
          </div>
        )}

        <form method="post" action="/api-tokens/create" class="token-create-form">
          <input type="hidden" name="_csrf" value={csrfToken} />
          <input type="text" name="token_name" placeholder="Token name (e.g. MCP)" class="input max-w-sm" maxLength={100} required />
          <select name="token_expiry" class="input max-w-select">
            <option value="30">30 days</option>
            <option value="60">60 days</option>
            <option value="90" selected>90 days</option>
            <option value="180">180 days</option>
            <option value="365">1 year</option>
            <option value="never">Never</option>
          </select>
          <button type="submit" class="btn btn-sm btn-outline">Create token</button>
        </form>
      </details>

      <details class="account-section collapsible-section">
        <summary><h2>Your data</h2></summary>
        <p class="muted">
          Quando stores your GitHub username, the polls you create, and the
          responses you submit. See our <a href="/privacy">privacy policy</a>.
        </p>
        <div class="account-actions">
          <a href="/account/export" class="btn btn-sm btn-outline">
            Download my data
          </a>
          <form method="post" action="/account/delete" class="inline-form">
            <input type="hidden" name="_csrf" value={csrfToken} />
            <button
              type="submit"
              class="btn btn-sm btn-danger"
              data-confirm="Delete all your data? This will remove all your polls and responses permanently. This cannot be undone."
            >
              Delete all my data
            </button>
          </form>
        </div>
      </details>
    </Layout>
  );
};
