import type { Poll, Slot, Response, ResponseWithValues, PollWithSlots, SiteStats } from "../types";

// --- Polls ---

export async function createPoll(
  db: D1Database,
  poll: {
    id: string;
    creator_github_id: string;
    creator_login: string;
    title: string;
    description: string | null;
    link: string | null;
    timezone: string;
    schedule_mode: "specific" | "weekly";
    poll_type: "date" | "datetime";
    duration: number | null;
    responses_hidden: boolean;
    closes_at: string | null;
  },
  slots: { date: string; start_time: string | null }[]
): Promise<void> {
  const stmts: D1PreparedStatement[] = [];

  stmts.push(
    db
      .prepare(
        `INSERT INTO polls (id, creator_github_id, creator_login, title, description, link, timezone, schedule_mode, poll_type, duration, responses_hidden, closes_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        poll.id,
        poll.creator_github_id,
        poll.creator_login,
        poll.title,
        poll.description,
        poll.link,
        poll.timezone,
        poll.schedule_mode,
        poll.poll_type,
        poll.duration,
        poll.responses_hidden ? 1 : 0,
        poll.closes_at
      )
  );

  // Sort slots by date then time, assign positions
  const sorted = [...slots].sort((a, b) => {
    const dateCmp = a.date.localeCompare(b.date);
    if (dateCmp !== 0) return dateCmp;
    return (a.start_time ?? "").localeCompare(b.start_time ?? "");
  });

  for (let i = 0; i < sorted.length; i++) {
    const slot = sorted[i]!;
    stmts.push(
      db
        .prepare("INSERT INTO slots (poll_id, position, date, start_time) VALUES (?, ?, ?, ?)")
        .bind(poll.id, i, slot.date, slot.start_time)
    );
  }

  await db.batch(stmts);
}

export async function getPoll(db: D1Database, id: string): Promise<Poll | null> {
  return db.prepare("SELECT * FROM polls WHERE id = ?").bind(id).first<Poll>();
}

export async function getPollWithSlots(db: D1Database, id: string): Promise<PollWithSlots | null> {
  const poll = await getPoll(db, id);
  if (!poll) return null;

  const { results: slots } = await db
    .prepare("SELECT * FROM slots WHERE poll_id = ? ORDER BY position")
    .bind(id)
    .all<Slot>();

  return { ...poll, slots };
}

export async function closePoll(db: D1Database, id: string): Promise<void> {
  await db.prepare("UPDATE polls SET closed_at = datetime('now') WHERE id = ?").bind(id).run();
}

export async function chooseSlot(db: D1Database, pollId: string, slotId: number): Promise<void> {
  await db.prepare("UPDATE polls SET chosen_slot = ? WHERE id = ?").bind(slotId, pollId).run();
}

export async function deletePoll(db: D1Database, id: string): Promise<void> {
  // CASCADE handles slots, responses, response_values
  await db.prepare("DELETE FROM polls WHERE id = ?").bind(id).run();
}

export async function updatePoll(
  db: D1Database,
  id: string,
  fields: { title?: string; description?: string | null }
): Promise<void> {
  const sets: string[] = [];
  const values: (string | null)[] = [];

  if (fields.title !== undefined) {
    sets.push("title = ?");
    values.push(fields.title);
  }
  if (fields.description !== undefined) {
    sets.push("description = ?");
    values.push(fields.description);
  }

  if (sets.length === 0) return;

  values.push(id);
  await db
    .prepare(`UPDATE polls SET ${sets.join(", ")} WHERE id = ?`)
    .bind(...values)
    .run();
}

export async function listPollsByCreator(db: D1Database, githubId: string): Promise<Poll[]> {
  const { results } = await db
    .prepare("SELECT * FROM polls WHERE creator_github_id = ? ORDER BY created_at DESC")
    .bind(githubId)
    .all<Poll>();
  return results;
}

// --- Responses ---

export async function getResponses(db: D1Database, pollId: string): Promise<ResponseWithValues[]> {
  const { results: responses } = await db
    .prepare("SELECT * FROM responses WHERE poll_id = ? ORDER BY created_at")
    .bind(pollId)
    .all<Response>();

  if (responses.length === 0) return [];

  const responseIds = responses.map((r) => r.id);
  const placeholders = responseIds.map(() => "?").join(",");
  const { results: values } = await db
    .prepare(`SELECT * FROM response_values WHERE response_id IN (${placeholders})`)
    .bind(...responseIds)
    .all<{ response_id: number; slot_id: number; value: "yes" | "no" | "maybe" }>();

  const valueMap = new Map<number, Record<number, "yes" | "no" | "maybe">>();
  for (const v of values) {
    let record = valueMap.get(v.response_id);
    if (!record) {
      record = {};
      valueMap.set(v.response_id, record);
    }
    record[v.slot_id] = v.value;
  }

  return responses.map((r) => ({
    ...r,
    values: valueMap.get(r.id) ?? {},
  }));
}

export async function getUserResponse(
  db: D1Database,
  pollId: string,
  githubId: string
): Promise<ResponseWithValues | null> {
  const response = await db
    .prepare("SELECT * FROM responses WHERE poll_id = ? AND github_id = ?")
    .bind(pollId, githubId)
    .first<Response>();

  if (!response) return null;

  const { results: values } = await db
    .prepare("SELECT * FROM response_values WHERE response_id = ?")
    .bind(response.id)
    .all<{ response_id: number; slot_id: number; value: "yes" | "no" | "maybe" }>();

  const valuesRecord: Record<number, "yes" | "no" | "maybe"> = {};
  for (const v of values) {
    valuesRecord[v.slot_id] = v.value;
  }

  return { ...response, values: valuesRecord };
}

export async function upsertResponse(
  db: D1Database,
  pollId: string,
  githubId: string,
  githubLogin: string,
  slotValues: { slot_id: number; value: "yes" | "no" | "maybe" }[],
  comment: string | null
): Promise<void> {
  // Check for existing response
  const existing = await db
    .prepare("SELECT id FROM responses WHERE poll_id = ? AND github_id = ?")
    .bind(pollId, githubId)
    .first<{ id: number }>();

  const stmts: D1PreparedStatement[] = [];

  let responseId: number;

  if (existing) {
    responseId = existing.id;
    // Update timestamp
    stmts.push(
      db
        .prepare("UPDATE responses SET github_login = ?, comment = ?, updated_at = datetime('now') WHERE id = ?")
        .bind(githubLogin, comment, responseId)
    );
    // Delete old values
    stmts.push(db.prepare("DELETE FROM response_values WHERE response_id = ?").bind(responseId));
  } else {
    // We need to insert and get the ID back - do this outside the batch
    const result = await db
      .prepare(
        "INSERT INTO responses (poll_id, github_id, github_login, comment) VALUES (?, ?, ?, ?) RETURNING id"
       )
      .bind(pollId, githubId, githubLogin, comment)
      .first<{ id: number }>();
    responseId = result!.id;
  }

  // Insert new values
  for (const sv of slotValues) {
    stmts.push(
      db
        .prepare("INSERT INTO response_values (response_id, slot_id, value) VALUES (?, ?, ?)")
        .bind(responseId, sv.slot_id, sv.value)
    );
  }

  if (stmts.length > 0) {
    await db.batch(stmts);
  }
}

// --- Rate limits ---

export async function getCreatorLimits(
  db: D1Database,
  githubId: string
): Promise<{ activeCount: number; recentCount: number }> {
  const [activeRes, recentRes] = await db.batch([
    db.prepare("SELECT COUNT(*) as count FROM polls WHERE creator_github_id = ? AND closed_at IS NULL").bind(githubId),
    db.prepare(
      "SELECT COUNT(*) as count FROM polls WHERE creator_github_id = ? AND created_at > datetime('now', '-1 hour')"
    ).bind(githubId),
  ]);

  return {
    activeCount: (activeRes?.results[0] as { count: number } | undefined)?.count ?? 0,
    recentCount: (recentRes?.results[0] as { count: number } | undefined)?.count ?? 0,
  };
}

// --- Stats ---

export async function getSiteStats(db: D1Database): Promise<SiteStats> {
  const results = await db.batch([
    db.prepare("SELECT COUNT(*) as count FROM polls WHERE closed_at IS NULL"),
    db.prepare("SELECT COUNT(*) as count FROM polls WHERE closed_at IS NOT NULL"),
    db.prepare("SELECT COUNT(*) as count FROM responses"),
    db.prepare(
      `SELECT creator_login as login, COUNT(*) as count
       FROM polls WHERE closed_at IS NULL
       GROUP BY creator_github_id
       ORDER BY count DESC LIMIT 10`
    ),
  ]);

  const [activeRes, closedRes, responsesRes, topRes] = results;

  return {
    activePolls: (activeRes?.results[0] as { count: number } | undefined)?.count ?? 0,
    closedPolls: (closedRes?.results[0] as { count: number } | undefined)?.count ?? 0,
    totalResponses: (responsesRes?.results[0] as { count: number } | undefined)?.count ?? 0,
    topCreators: (topRes?.results as { login: string; count: number }[]) ?? [],
  };
}

// --- Account (GDPR) ---

export async function deleteAllUserData(db: D1Database, githubId: string): Promise<void> {
  // Delete all responses this user has made on any poll
  // (response_values cascade from responses)
  await db
    .prepare("DELETE FROM responses WHERE github_id = ?")
    .bind(githubId)
    .run();

  // Delete all polls this user created
  // (slots, responses, response_values cascade from polls)
  await db
    .prepare("DELETE FROM polls WHERE creator_github_id = ?")
    .bind(githubId)
    .run();
}

export async function exportUserData(
  db: D1Database,
  githubId: string
): Promise<{
  user: { github_id: string; github_login: string };
  polls: (Poll & { slots: Slot[] })[];
  responses: { poll_id: string; poll_title: string; comment: string | null; values: { date: string; start_time: string | null; value: string }[] }[];
}> {
  // Get user's login from any record
  const anyPoll = await db
    .prepare("SELECT creator_login FROM polls WHERE creator_github_id = ? LIMIT 1")
    .bind(githubId)
    .first<{ creator_login: string }>();
  const anyResponse = await db
    .prepare("SELECT github_login FROM responses WHERE github_id = ? LIMIT 1")
    .bind(githubId)
    .first<{ github_login: string }>();
  const login = anyPoll?.creator_login ?? anyResponse?.github_login ?? "";

  // Get all polls created by user
  const { results: polls } = await db
    .prepare("SELECT * FROM polls WHERE creator_github_id = ? ORDER BY created_at")
    .bind(githubId)
    .all<Poll>();

  // Get slots for each poll
  const pollsWithSlots: (Poll & { slots: Slot[] })[] = [];
  for (const poll of polls) {
    const { results: slots } = await db
      .prepare("SELECT * FROM slots WHERE poll_id = ? ORDER BY position")
      .bind(poll.id)
      .all<Slot>();
    pollsWithSlots.push({ ...poll, slots });
  }

  // Get all responses this user has made
  const { results: userResponses } = await db
    .prepare(
      `SELECT r.poll_id, p.title as poll_title, r.id as response_id, r.comment
       FROM responses r
       JOIN polls p ON p.id = r.poll_id
       WHERE r.github_id = ?
       ORDER BY r.created_at`
    )
    .bind(githubId)
    .all<{ poll_id: string; poll_title: string; response_id: number; comment: string | null }>();

  const responsesExport: { poll_id: string; poll_title: string; comment: string | null; values: { date: string; start_time: string | null; value: string }[] }[] = [];
  for (const resp of userResponses) {
    const { results: values } = await db
      .prepare(
        `SELECT s.date, s.start_time, rv.value
         FROM response_values rv
         JOIN slots s ON s.id = rv.slot_id
         WHERE rv.response_id = ?
         ORDER BY s.position`
      )
      .bind(resp.response_id)
      .all<{ date: string; start_time: string | null; value: string }>();
    responsesExport.push({
      poll_id: resp.poll_id,
      poll_title: resp.poll_title,
      comment: resp.comment,
      values,
    });
  }

  return {
    user: { github_id: githubId, github_login: login },
    polls: pollsWithSlots,
    responses: responsesExport,
  };
}

// --- Slots ---

export async function getSlots(db: D1Database, pollId: string): Promise<Slot[]> {
  const { results } = await db
    .prepare("SELECT * FROM slots WHERE poll_id = ? ORDER BY position")
    .bind(pollId)
    .all<Slot>();
  return results;
}
