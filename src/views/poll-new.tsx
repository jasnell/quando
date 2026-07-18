import type { FC } from "hono/jsx";
import { Layout } from "./layout";
import type { Session, PollWithSlots } from "../types";

interface PollNewProps {
  session: Session;
  csrfToken: string;
  error?: string;
  cspNonce?: string;
  template?: PollWithSlots;
}

export const PollNew: FC<PollNewProps> = ({ session, csrfToken, error, cspNonce, template }) => {
  // Build template JSON for client-side pre-population
  const templateData = template
    ? JSON.stringify({
        title: template.title,
        description: template.description,
        link: template.link,
        timezone: template.timezone,
        schedule_mode: template.schedule_mode,
        poll_type: template.poll_type,
        duration: template.duration,
        responses_hidden: template.responses_hidden,
        slots: template.slots.map((s) => ({ date: s.date, start_time: s.start_time })),
      })
    : undefined;
  return (
    <Layout title="Create a new poll" session={session} csrfToken={csrfToken} cspNonce={cspNonce} scripts={["/poll-create.js"]}>
      <div class="page-header">
        <h1>Create a new poll</h1>
      </div>

      {error && <div class="alert alert-error" role="alert">{error}</div>}

      <form method="post" action="/new" id="create-poll-form" class="poll-form" data-template={templateData}>
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

        <div class="form-group">
          <label>Schedule</label>
          <div class="radio-group radio-group-horizontal">
            <label class="radio-label">
              <input type="radio" name="schedule_mode" value="specific" checked />
              <span>Specific dates</span>
            </label>
            <label class="radio-label">
              <input type="radio" name="schedule_mode" value="weekly" />
              <span>Days of the week</span>
            </label>
          </div>
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
            <div id="custom-duration" class="custom-duration hidden">
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

        <div class="form-group" id="date-picker-group">
          <label>Select dates</label>
          <div id="calendar-container" class="calendar-container">
            {/* Calendar rendered by client-side JS */}
            <noscript>
              <p>JavaScript is required to use the date picker.</p>
            </noscript>
          </div>
          <div id="weekday-container" class="weekday-container hidden">
            {/* Weekday picker rendered by client-side JS */}
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

        <div class="form-group">
          <label for="closes_at">Response deadline <small>(optional)</small></label>
          <input type="datetime-local" name="closes_at" id="closes_at" class="input max-w-md" />
          <small class="muted">Poll will stop accepting responses after this time.</small>
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
