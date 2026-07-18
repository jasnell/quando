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
    poll_type: "date" | "datetime";
    duration: number | null;
    responses_hidden: boolean;
  },
  slots: { date: string; start_time: string | null }[]
): Promise<void> {
  const stmts: D1PreparedStatement[] = [];

  stmts.push(
    db
      .prepare(
        `INSERT INTO polls (id, creator_github_id, creator_login, title, description, link, timezone, poll_type, duration, responses_hidden)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        poll.id,
        poll.creator_github_id,
        poll.creator_login,
        poll.title,
        poll.description,
        poll.link,
        poll.timezone,
        poll.poll_type,
        poll.duration,
        poll.responses_hidden ? 1 : 0
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
  slotValues: { slot_id: number; value: "yes" | "no" | "maybe" }[]
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
        .prepare("UPDATE responses SET github_login = ?, updated_at = datetime('now') WHERE id = ?")
        .bind(githubLogin, responseId)
    );
    // Delete old values
    stmts.push(db.prepare("DELETE FROM response_values WHERE response_id = ?").bind(responseId));
  } else {
    // We need to insert and get the ID back - do this outside the batch
    const result = await db
      .prepare(
        "INSERT INTO responses (poll_id, github_id, github_login) VALUES (?, ?, ?) RETURNING id"
      )
      .bind(pollId, githubId, githubLogin)
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

// --- Slots ---

export async function getSlots(db: D1Database, pollId: string): Promise<Slot[]> {
  const { results } = await db
    .prepare("SELECT * FROM slots WHERE poll_id = ? ORDER BY position")
    .bind(pollId)
    .all<Slot>();
  return results;
}
