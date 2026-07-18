import type { FC } from "hono/jsx";
import { Layout } from "./layout";
import type { Session, Poll, SiteStats } from "../types";
import { Stats } from "./stats";

interface DashboardProps {
  session: Session;
  csrfToken: string;
  polls: Poll[];
  stats: SiteStats;
}

export const Dashboard: FC<DashboardProps> = ({ session, csrfToken, polls, stats }) => {
  return (
    <Layout title="My polls" session={session} csrfToken={csrfToken}>
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

      <Stats stats={stats} />

      <div class="account-section">
        <h2>Your data</h2>
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
      </div>
    </Layout>
  );
};
