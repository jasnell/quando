import type { FC } from "hono/jsx";
import { Layout } from "./layout";
import type { Session, PollWithSlots } from "../types";
import { formatSlotHeader } from "../utils";

interface PollEditProps {
  session: Session;
  csrfToken: string;
  poll: PollWithSlots;
  cspNonce?: string;
  success?: boolean;
}

export const PollEdit: FC<PollEditProps> = ({ session, csrfToken, poll, cspNonce, success }) => {
  const isClosed = poll.closed_at !== null;

  return (
    <Layout title={`Edit: ${poll.title}`} session={session} csrfToken={csrfToken} cspNonce={cspNonce} scripts={["/poll-create.js"]}>
      <div class="page-header">
        <h1>Edit poll</h1>
        <div>
          <a href={`/p/${poll.id}/admin`} class="btn btn-sm btn-outline">
            Manage poll
          </a>
          {" "}
          <a href={`/p/${poll.id}`} class="btn btn-sm btn-outline">
            View poll
          </a>
        </div>
      </div>

      {success && (
        <div class="alert alert-success" role="status">
          Poll updated successfully.
        </div>
      )}

      {/* Metadata form */}
      <form method="post" action={`/p/${poll.id}/edit`} class="poll-form">
        <input type="hidden" name="_csrf" value={csrfToken} />

        <div class="form-group">
          <label for="title">Title</label>
          <input type="text" id="title" name="title" required maxlength={200} class="input" value={poll.title} />
        </div>

        <div class="form-group">
          <label for="description">Description <small>(optional)</small></label>
          <textarea id="description" name="description" maxlength={2000} rows={3} class="input">{poll.description ?? ""}</textarea>
        </div>

        <div class="form-group">
          <label for="link">Link <small>(optional)</small></label>
          <input type="url" id="link" name="link" maxlength={2000} class="input" value={poll.link ?? ""} />
        </div>

{""}

        <div class="form-group">
          <label class="checkbox-label">
            <input type="checkbox" name="responses_hidden" value="1" checked={!!poll.responses_hidden} />
            <span>Hide responses until poll is closed</span>
          </label>
        </div>

        {!isClosed && (
          <div class="form-group">
            <label for="edit-closes-at">Response deadline <small>(optional)</small></label>
            <input
              type="datetime-local"
              id="edit-closes-at"
              name="closes_at"
              class="input max-w-md"
              value={poll.closes_at ? poll.closes_at.slice(0, 16) : ""}
            />
            <small class="muted">Leave blank to remove deadline.</small>
          </div>
        )}

        <div class="form-actions">
          <button type="submit" class="btn">
            Save changes
          </button>
        </div>
      </form>

      {/* Existing slots (read-only) */}
      <div class="edit-section">
        <h2>Time slots</h2>
        <p class="muted">
          Existing slots cannot be changed or removed. You can add new slots below.
        </p>
        <div class="existing-slots">
          {poll.slots.map((slot) => (
            <div class="existing-slot-chip">
              {formatSlotHeader(slot.date, slot.start_time, poll.timezone, poll.duration)}
            </div>
          ))}
        </div>
      </div>

      {/* Add new slots */}
      {!isClosed && (
        <div class="edit-section">
          <h2>Add time slots</h2>
          <form method="post" action={`/p/${poll.id}/slots`} id="add-slots-form" class="poll-form"
                data-schedule-mode={poll.schedule_mode} data-poll-type={poll.poll_type} data-poll-timezone={poll.timezone}>
            <input type="hidden" name="_csrf" value={csrfToken} />
            <input type="hidden" name="schedule_mode" value={poll.schedule_mode} />
            <input type="hidden" name="poll_type" value={poll.poll_type} />

            <div class="form-group" id="date-picker-group">
              <div id="calendar-container" class={`calendar-container ${poll.schedule_mode === "weekly" ? "hidden" : ""}`}>
                <noscript><p>JavaScript is required to use the date picker.</p></noscript>
              </div>
              <div id="weekday-container" class={`weekday-container ${poll.schedule_mode === "specific" ? "hidden" : ""}`}>
              </div>
            </div>

            {poll.poll_type === "datetime" && (
              <div class="form-group" id="default-time-group">
                <label>Set all times to</label>
                <div class="default-time-row">
                  <input type="time" id="default-time" value="10:00" class="input input-time" />
                  <button type="button" id="apply-default-time" class="btn btn-sm">
                    Apply to all
                  </button>
                </div>
              </div>
            )}

            <div class="form-group">
              <label>New slots to add</label>
              <div id="selected-slots" class="selected-slots">
                <p class="muted">No dates selected yet. Click dates on the calendar above.</p>
              </div>
            </div>

            <div class="form-actions">
              <button type="submit" class="btn" id="create-btn" disabled>
                Add slots
              </button>
            </div>
          </form>
        </div>
      )}
    </Layout>
  );
};
