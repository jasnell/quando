import type { FC } from "hono/jsx";
import { Layout } from "./layout";
import type { Session, PollWithSlots, ResponseWithValues } from "../types";
import type { FC as FC2 } from "hono/jsx";
import { formatSlotHeader } from "../utils";

const ValueIcon: FC2<{ value: string }> = ({ value }) => {
  const symbol = value === "yes" ? "\u2713" : value === "maybe" ? "?" : "\u2717";
  const label = value === "yes" ? "Yes" : value === "maybe" ? "Maybe" : "No";
  return (
    <span aria-label={label} role="img">
      {symbol}
    </span>
  );
};

interface PollAdminProps {
  session: Session;
  csrfToken: string;
  poll: PollWithSlots;
  responses: ResponseWithValues[];
  cspNonce?: string;
}

export const PollAdmin: FC<PollAdminProps> = ({ session, csrfToken, poll, responses, cspNonce }) => {
  const isClosed = poll.closed_at !== null;

  // Compute totals
  const totals: Record<number, number> = {};
  for (const slot of poll.slots) {
    totals[slot.id] = 0;
  }
  for (const r of responses) {
    for (const slot of poll.slots) {
      if (r.values[slot.id] === "yes") {
        totals[slot.id] = (totals[slot.id] ?? 0) + 1;
      }
    }
  }
  const maxTotal = Math.max(0, ...Object.values(totals));

  return (
    <Layout title={`Manage: ${poll.title}`} session={session} csrfToken={csrfToken} cspNonce={cspNonce}>
      <div class="page-header">
        <h1>Manage poll</h1>
        <a href={`/p/${poll.id}`} class="btn btn-sm btn-outline">
          View poll
        </a>
      </div>

      <div class="admin-info">
        <h2>{poll.title}</h2>
        {poll.description && <p class="poll-description">{poll.description}</p>}
        {poll.link && (
          <p class="poll-link">
            <a href={poll.link} target="_blank" rel="noopener noreferrer ugc">{poll.link}</a>
          </p>
        )}
        <p class="poll-meta">
          {responses.length} response{responses.length !== 1 ? "s" : ""}
          {isClosed && <span class="badge badge-closed">Closed</span>}
          {poll.chosen_slot && <span class="badge badge-chosen">Time chosen</span>}
        </p>
        {poll.closes_at && (
          <p class="poll-deadline">
            Response deadline:{" "}
            <strong>
              {new Date(poll.closes_at).toLocaleString("en-US", {
                weekday: "short",
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
                timeZone: poll.timezone,
                timeZoneName: "short",
              })}
            </strong>
          </p>
        )}
      </div>

      {/* Response summary - creator always sees all responses */}
      {responses.length > 0 && (
        <div class="results-section">
          <h3>Responses</h3>
          <div class="grid-scroll">
            <table class="response-grid">
              <thead>
                <tr>
                  <th class="name-col"></th>
                  {poll.slots.map((slot) => (
                    <th
                      class={`slot-col ${poll.chosen_slot === slot.id ? "chosen" : ""} ${totals[slot.id] === maxTotal && maxTotal > 0 ? "best" : ""}`}
                    >
                      {formatSlotHeader(slot.date, slot.start_time, poll.timezone, poll.duration)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {responses.map((r) => (
                  <tr>
                    <td class="name-col">@{r.github_login}</td>
                    {poll.slots.map((slot) => {
                      const val = r.values[slot.id] ?? "no";
                      return (
                        <td class={`value-cell value-${val}`}>
                          <ValueIcon value={val} />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td class="name-col total-label">Yes</td>
                  {poll.slots.map((slot) => (
                    <td
                      class={`value-cell total-cell ${totals[slot.id] === maxTotal && maxTotal > 0 ? "best" : ""}`}
                    >
                      {totals[slot.id]}
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Admin actions */}
      <div class="admin-actions">
        {!isClosed && (
          <>
            <div class="admin-action-group">
              <h3>Choose a time</h3>
              <p class="muted">Mark the winning slot. This displays a banner on the poll page.</p>
              <form method="post" action={`/p/${poll.id}/choose`} class="choose-form">
                <input type="hidden" name="_csrf" value={csrfToken} />
                <select name="slot_id" class="input" required>
                  <option value="">Select a slot...</option>
                  {poll.slots.map((slot) => (
                    <option value={slot.id} selected={poll.chosen_slot === slot.id}>
                      {formatSlotHeader(slot.date, slot.start_time, poll.timezone, poll.duration)} ({totals[slot.id]}{" "}
                      yes)
                    </option>
                  ))}
                </select>
                <button type="submit" class="btn btn-sm">
                  Set chosen time
                </button>
              </form>
            </div>

            <div class="admin-action-group">
              <h3>Close poll</h3>
              <p class="muted">No more responses will be accepted. All responses become visible.</p>
              <form method="post" action={`/p/${poll.id}/close`} class="inline-form">
                <input type="hidden" name="_csrf" value={csrfToken} />
                <button type="submit" class="btn btn-sm btn-warn" data-confirm="Close this poll? No more responses will be accepted.">
                  Close poll
                </button>
              </form>
            </div>
          </>
        )}

        <div class="admin-action-group">
          <h3>Share link</h3>
          <div class="share-link">
            <input
              type="text"
              readonly
              value={`/p/${poll.id}`}
              class="input"
              id="share-url"
            />
          </div>
        </div>

        <div class="admin-action-group">
          <h3>Use as template</h3>
          <p class="muted">Create a new poll pre-filled with this poll's settings and slots.</p>
          <a href={`/new?from=${poll.id}`} class="btn btn-sm btn-outline">
            New poll from template
          </a>
        </div>

        <div class="admin-action-group danger-zone">
          <h3>Danger zone</h3>
          <p class="muted">This cannot be undone.</p>
          <form method="post" action={`/p/${poll.id}/delete`} class="inline-form">
            <input type="hidden" name="_csrf" value={csrfToken} />
            <button type="submit" class="btn btn-sm btn-danger" data-confirm="Delete this poll and all responses? This cannot be undone.">
              Delete poll
            </button>
          </form>
        </div>
      </div>
    </Layout>
  );
};
