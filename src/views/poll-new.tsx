import type { FC } from "hono/jsx";
import { Layout } from "./layout";
import type { Session } from "../types";

interface PollNewProps {
  session: Session;
  csrfToken: string;
  error?: string;
}

export const PollNew: FC<PollNewProps> = ({ session, csrfToken, error }) => {
  return (
    <Layout title="Create a new poll" session={session} csrfToken={csrfToken} scripts={["/poll-create.js"]}>
      <div class="page-header">
        <h1>Create a new poll</h1>
      </div>

      {error && <div class="alert alert-error" role="alert">{error}</div>}

      <form method="post" action="/new" id="create-poll-form" class="poll-form">
        <input type="hidden" name="_csrf" value={csrfToken} />
        <div class="form-group">
          <label for="title">Title</label>
          <input
            type="text"
            id="title"
            name="title"
            required
            maxlength={200}
            placeholder="e.g. Team sync Q3 planning"
            class="input"
          />
        </div>

        <div class="form-group">
          <label for="description">Description (optional)</label>
          <textarea
            id="description"
            name="description"
            maxlength={2000}
            rows={3}
            placeholder="Add context for your participants..."
            class="input"
          />
        </div>

        <div class="form-group">
          <label for="link">Link (optional)</label>
          <input
            type="url"
            id="link"
            name="link"
            maxlength={2000}
            placeholder="e.g. https://github.com/org/repo/issues/123"
            class="input"
          />
        </div>

        <div class="form-row">
          <div class="form-group">
            <label for="timezone">Timezone</label>
            <div class="tz-select-wrapper">
              <input
                type="text"
                id="timezone-search"
                placeholder="Search timezones..."
                class="input"
                autocomplete="off"
              />
              <select id="timezone" name="timezone" class="input" required>
                {/* Populated by client-side JS with browser timezone as default */}
              </select>
            </div>
          </div>

          <div class="form-group">
            <label>Poll type</label>
            <div class="radio-group">
              <label class="radio-label">
                <input type="radio" name="poll_type" value="datetime" checked />
                <span>Date + time</span>
                <small>Pick specific meeting times</small>
              </label>
              <label class="radio-label">
                <input type="radio" name="poll_type" value="date" />
                <span>Date only</span>
                <small>Pick whole days</small>
              </label>
            </div>
          </div>
        </div>

        <div class="form-group" id="duration-group">
          <label for="duration">Meeting duration</label>
          <div class="duration-row">
            <select id="duration" name="duration" class="input input-duration">
              <option value="15">15 minutes</option>
              <option value="30">30 minutes</option>
              <option value="45">45 minutes</option>
              <option value="60" selected>1 hour</option>
              <option value="75">1 hr 15 min</option>
              <option value="90">1 hr 30 min</option>
              <option value="105">1 hr 45 min</option>
              <option value="120">2 hours</option>
              <option value="custom">Custom...</option>
            </select>
            <div id="custom-duration" class="custom-duration" style="display:none">
              <input
                type="number"
                id="custom-duration-input"
                min={5}
                max={480}
                step={5}
                placeholder="minutes"
                class="input input-time"
              />
              <span class="muted">minutes</span>
            </div>
          </div>
        </div>

        <div class="form-group">
          <label>Select dates</label>
          <div id="calendar-container" class="calendar-container">
            {/* Calendar rendered by client-side JS */}
            <noscript>
              <p>JavaScript is required to use the date picker.</p>
            </noscript>
          </div>
        </div>

        <div class="form-group" id="default-time-group">
          <label>Set all times to</label>
          <div class="default-time-row">
            <input type="time" id="default-time" value="10:00" class="input input-time" />
            <button type="button" id="apply-default-time" class="btn btn-sm">
              Apply to all
            </button>
          </div>
        </div>

        <div class="form-group">
          <label>Selected slots</label>
          <div id="selected-slots" class="selected-slots">
            <p class="muted">No dates selected yet. Click dates on the calendar above.</p>
          </div>
          {/* Hidden inputs for slots are injected by JS */}
        </div>

        <div class="form-group">
          <label class="checkbox-label">
            <input type="checkbox" name="responses_hidden" value="1" />
            <span>Hide responses until poll is closed</span>
          </label>
        </div>

        <div class="form-actions">
          <button type="submit" class="btn btn-lg" id="create-btn" disabled>
            Create poll
          </button>
        </div>
      </form>
    </Layout>
  );
};
