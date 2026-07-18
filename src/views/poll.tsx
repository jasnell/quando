import type { FC } from "hono/jsx";
import { Layout } from "./layout";
import type { OgMeta } from "./layout";
import type { Session, PollWithSlots, ResponseWithValues } from "../types";
import { formatSlotHeader, addMinutes, isPollExpired } from "../utils";

interface PollViewProps {
  session: Session;
  csrfToken: string;
  poll: PollWithSlots;
  responses: ResponseWithValues[];
  userResponse: ResponseWithValues | null;
  cspNonce?: string;
  ogMeta?: OgMeta;
}

function generateMarkdown(poll: PollWithSlots, responses: ResponseWithValues[]): string {
  const lines: string[] = [];

  lines.push(`## ${poll.title}`);
  lines.push("");
  if (poll.description) {
    lines.push(poll.description);
    lines.push("");
  }
  if (poll.link) {
    lines.push(poll.link);
    lines.push("");
  }
  if (poll.poll_type === "datetime") {
    lines.push(`*Times shown in ${poll.timezone}*`);
    lines.push("");
  }

  if (poll.chosen_slot) {
    const slot = poll.slots.find((s) => s.id === poll.chosen_slot);
    if (slot) {
      lines.push(`**Chosen time: ${formatSlotHeader(slot.date, slot.start_time, poll.timezone, poll.duration)}**`);
      lines.push("");
    }
  }

  // Build markdown table
  const headers = poll.slots.map((s) => formatSlotHeader(s.date, s.start_time, poll.timezone, poll.duration));

  lines.push(`| | ${headers.join(" | ")} |`);
  lines.push(`|---|${headers.map(() => "---").join("|")}|`);

  for (const r of responses) {
    const cells = poll.slots.map((slot) => {
      const val = r.values[slot.id] ?? "no";
      return val === "yes" ? "\u2705" : val === "maybe" ? "\u2753" : "\u274c";
    });
    lines.push(`| @${r.github_login} | ${cells.join(" | ")} |`);
  }

  // Totals row
  const totals = poll.slots.map((slot) =>
    String(responses.filter((r) => r.values[slot.id] === "yes").length)
  );
  lines.push(`| **Yes** | ${totals.join(" | ")} |`);

  // Add notes section if any comments exist
  const commented = responses.filter((r) => r.comment);
  if (commented.length > 0) {
    lines.push("");
    lines.push("**Notes:**");
    for (const r of commented) {
      lines.push(`- @${r.github_login}: ${r.comment}`);
    }
  }

  lines.push("");
  lines.push(`*${responses.length} response${responses.length !== 1 ? "s" : ""} · [View poll]()*`);

  return lines.join("\n");
}

const ValueIcon: FC<{ value: string }> = ({ value }) => {
  const symbol = value === "yes" ? "\u2713" : value === "maybe" ? "?" : "\u2717";
  const label = value === "yes" ? "Yes" : value === "maybe" ? "Maybe" : "No";
  return (
    <span aria-label={label} role="img">
      {symbol}
    </span>
  );
};

export const PollView: FC<PollViewProps> = ({ session, csrfToken, poll, responses, userResponse, cspNonce, ogMeta }) => {
  const isClosed = poll.closed_at !== null;
  const isExpired = isPollExpired(poll.slots, poll.timezone, poll.duration, poll.schedule_mode);
  const isDeadlinePassed = poll.closes_at ? new Date(poll.closes_at).getTime() <= Date.now() : false;
  const acceptingResponses = !isClosed && !isExpired && !isDeadlinePassed;
  const isCreator = session.github_id === poll.creator_github_id;
  const canSeeResponses = !poll.responses_hidden || isCreator || isClosed;
  const chosenSlot = poll.chosen_slot;
  const hasComments = responses.some((r) => r.comment);

  // Compute totals
  const totals: Record<number, number> = {};
  for (const slot of poll.slots) {
    totals[slot.id] = 0;
  }
  if (canSeeResponses) {
    for (const r of responses) {
      for (const slot of poll.slots) {
        if (r.values[slot.id] === "yes") {
          totals[slot.id] = (totals[slot.id] ?? 0) + 1;
        }
      }
    }
  }

  // Find the max total to highlight best slots
  const maxTotal = Math.max(0, ...Object.values(totals));

  return (
    <Layout title={poll.title} session={session} csrfToken={csrfToken} cspNonce={cspNonce} scripts={["/poll-respond.js"]} ogMeta={ogMeta}>
      <div class="poll-header">
        <h1>{poll.title}</h1>
        <p class="poll-meta">
          Created by <strong>@{poll.creator_login}</strong>
          {poll.poll_type === "datetime" && (
            <span>
              {" "}
              &middot; Times in <span class="tz-label">{poll.timezone}</span>
            </span>
          )}
          {isClosed && <span class="badge badge-closed">Closed</span>}
          {!isClosed && isExpired && <span class="badge badge-expired">Expired</span>}
          {!isClosed && !isExpired && isDeadlinePassed && <span class="badge badge-expired">Deadline passed</span>}
        </p>
        {poll.description && <p class="poll-description">{poll.description}</p>}
        {poll.link && (
          <p class="poll-link">
            <a href={poll.link} target="_blank" rel="noopener noreferrer ugc">{poll.link}</a>
          </p>
        )}
        {poll.closes_at && !isClosed && (
          <p class="poll-deadline">
            Responses due by{" "}
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
        {chosenSlot && (
          <div class="chosen-banner">
            Chosen time:{" "}
            <strong>
              {(() => {
                const slot = poll.slots.find((s) => s.id === chosenSlot);
                return slot ? formatSlotHeader(slot.date, slot.start_time, poll.timezone, poll.duration) : "—";
              })()}
            </strong>
            {poll.schedule_mode !== "weekly" && (
              <a href={`/p/${poll.id}/ics`} class="btn btn-sm btn-outline chosen-ics-btn" download>
                Download .ics
              </a>
            )}
          </div>
        )}
        {isCreator && (
          <a href={`/p/${poll.id}/admin`} class="btn btn-sm btn-outline">
            Manage poll
          </a>
        )}
      </div>

      {/* View toggle + export */}
      {(canSeeResponses && responses.length > 0 || acceptingResponses) && (
        <div class="poll-toolbar">
          <div class="view-toggle" id="view-toggle">
          <button type="button" class="view-toggle-btn active" data-view="table" aria-pressed="true">Table</button>
          <button type="button" class="view-toggle-btn" data-view="list" aria-pressed="false">List</button>
          </div>
          {canSeeResponses && responses.length > 0 && (
            <button type="button" class="btn btn-sm btn-outline" id="copy-markdown-btn">
              Copy as Markdown
            </button>
          )}
        </div>
      )}

      {canSeeResponses && responses.length > 0 && (
        <textarea id="markdown-source" class="sr-only" readonly>{generateMarkdown(poll, responses)}</textarea>
      )}

      {/* Results — table view */}
      {canSeeResponses && responses.length > 0 && (
        <div class="results-section view-table">
          <h2>Responses ({responses.length})</h2>
          <div class="grid-scroll">
            <table class="response-grid" data-timezone={poll.timezone} data-poll-type={poll.poll_type} data-duration={poll.duration ?? ""}>
              <thead>
                <tr>
                  <th class="name-col"></th>
                  {poll.slots.map((slot) => (
                    <th
                      class={`slot-col ${chosenSlot === slot.id ? "chosen" : ""} ${canSeeResponses && totals[slot.id] === maxTotal && maxTotal > 0 ? "best" : ""}`}
                      data-date={slot.date}
                      data-time={slot.start_time ?? ""}
                    >
                      <div class="slot-header">
                        {formatSlotHeader(slot.date, slot.start_time, poll.timezone, poll.duration)}
                      </div>
                      <div class="slot-local-time"></div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {responses.map((r) => (
                   <tr>
                    <td class="name-col">
                      <span class="respondent-name">@{r.github_login}</span>
                      {r.timezone && <span class="respondent-tz" title={r.timezone.replace(/_/g, " ")}>{r.timezone.replace(/_/g, " ").replace(/^.*\//, "")}</span>}
                      {r.comment && <div class="respondent-comment" title={r.comment}>{r.comment}</div>}
                    </td>
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

      {/* Results — list view */}
      {canSeeResponses && responses.length > 0 && (
        <div class="results-section view-list" style="display:none">
          <h2>Responses ({responses.length})</h2>
          <div class="slot-card-list">
            {poll.slots.map((slot) => {
              const isBest = totals[slot.id] === maxTotal && maxTotal > 0;
              const isChosen = chosenSlot === slot.id;
              const yesCount = totals[slot.id] ?? 0;
              const maybeCount = responses.filter((r) => r.values[slot.id] === "maybe").length;
              return (
                <div
                  class={`slot-card ${isBest ? "slot-card-best" : ""} ${isChosen ? "slot-card-chosen" : ""}`}
                  data-date={slot.date}
                  data-time={slot.start_time ?? ""}
                >
                  <div class="slot-card-header">
                    <div class="slot-card-time">
                      {formatSlotHeader(slot.date, slot.start_time, poll.timezone, poll.duration)}
                    </div>
                    <div class="slot-card-local-time" data-timezone={poll.timezone} data-poll-type={poll.poll_type} data-duration={poll.duration ?? ""}></div>
                    <div class="slot-card-summary">
                      <span class="summary-yes">{yesCount} yes</span>
                      <span class="summary-maybe">{maybeCount} maybe</span>
                    </div>
                  </div>
                  <div class="slot-card-respondents">
                    {responses.map((r) => {
                      const val = r.values[slot.id] ?? "no";
                      return (
                        <span class={`respondent-chip value-${val}`} title={r.timezone ? `${r.timezone.replace(/_/g, " ")}${r.comment ? " — " + r.comment : ""}` : (r.comment ?? undefined)}>
                          <ValueIcon value={val} />{" "}
                          @{r.github_login}
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!canSeeResponses && (
        <div class="hidden-notice">
          <p>Responses are hidden until the poll is closed.</p>
          <p>
            {responses.length} response{responses.length !== 1 ? "s" : ""} so far.
          </p>
        </div>
      )}

      {/* Response form */}
      {acceptingResponses && (
        <div class="respond-section">
          <h2>{userResponse ? `Your response (@${session.github_login})` : `Respond (@${session.github_login})`}</h2>
          <form method="post" action={`/p/${poll.id}/respond`} id="respond-form">
            <input type="hidden" name="_csrf" value={csrfToken} />
            <input type="hidden" name="respondent_timezone" id="respondent-timezone" value="" />
            {/* Table view */}
            <div class="view-table">
              <div class="grid-scroll">
                <table class="response-grid respond-input" data-timezone={poll.timezone} data-poll-type={poll.poll_type} data-duration={poll.duration ?? ""}>
                  <thead>
                    <tr>
                      {poll.slots.map((slot) => (
                        <th
                          class="slot-col"
                          data-date={slot.date}
                          data-time={slot.start_time ?? ""}
                        >
                          <div class="slot-header">
                            {formatSlotHeader(slot.date, slot.start_time, poll.timezone, poll.duration)}
                          </div>
                          <div class="slot-local-time"></div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      {poll.slots.map((slot) => {
                        const currentVal = userResponse?.values[slot.id] ?? "no";
                        return (
                          <td class="input-cell">
                            <button
                              type="button"
                              class={`toggle-btn value-${currentVal}`}
                              data-slot-id={slot.id}
                              data-value={currentVal}
                              aria-label={`${formatSlotHeader(slot.date, slot.start_time, poll.timezone, poll.duration)}: ${currentVal}`}
                            >
                              {currentVal === "yes" ? "\u2713" : currentVal === "maybe" ? "?" : "\u2717"}
                            </button>
                            <input type="hidden" name={`slot_${slot.id}`} value={currentVal} />
                          </td>
                        );
                      })}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* List view */}
            <div class="view-list" style="display:none">
              <div class="respond-card-list">
                {poll.slots.map((slot) => {
                  const currentVal = userResponse?.values[slot.id] ?? "no";
                  return (
                    <div
                      class="respond-card"
                      data-date={slot.date}
                      data-time={slot.start_time ?? ""}
                    >
                      <div class="respond-card-time">
                        <div class="slot-header">
                          {formatSlotHeader(slot.date, slot.start_time, poll.timezone, poll.duration)}
                        </div>
                        <div class="slot-card-local-time" data-timezone={poll.timezone} data-poll-type={poll.poll_type} data-duration={poll.duration ?? ""}></div>
                      </div>
                      <div class="respond-card-buttons" role="group" aria-label={formatSlotHeader(slot.date, slot.start_time, poll.timezone, poll.duration)}>
                        <button
                          type="button"
                          class={`respond-opt ${currentVal === "yes" ? "active" : ""}`}
                          data-slot-id={slot.id}
                          data-opt="yes"
                          aria-pressed={currentVal === "yes" ? "true" : "false"}
                        >
                          {"\u2713"} Yes
                        </button>
                        <button
                          type="button"
                          class={`respond-opt ${currentVal === "maybe" ? "active" : ""}`}
                          data-slot-id={slot.id}
                          data-opt="maybe"
                          aria-pressed={currentVal === "maybe" ? "true" : "false"}
                        >
                          ? Maybe
                        </button>
                        <button
                          type="button"
                          class={`respond-opt ${currentVal === "no" ? "active" : ""}`}
                          data-slot-id={slot.id}
                          data-opt="no"
                          aria-pressed={currentVal === "no" ? "true" : "false"}
                        >
                          {"\u2717"} No
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div class="form-group" style="margin-top: 1rem">
              <label for="comment">Note <small>(optional, max 500 chars)</small></label>
              <textarea name="comment" id="comment" class="input" rows={2} maxLength={500} placeholder="e.g. &quot;Only available after 10am&quot;">{userResponse?.comment ?? ""}</textarea>
            </div>

            <div class="form-actions">
              <button type="submit" class="btn">
                {userResponse ? "Update response" : "Submit response"}
              </button>
            </div>
          </form>
        </div>
      )}
    </Layout>
  );
};
