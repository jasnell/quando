-- Quando database schema

CREATE TABLE IF NOT EXISTS polls (
  id                TEXT PRIMARY KEY,
  creator_github_id TEXT NOT NULL,
  creator_login     TEXT NOT NULL,
  title             TEXT NOT NULL,
  description       TEXT,
  link              TEXT,
  timezone          TEXT NOT NULL DEFAULT 'UTC',
  schedule_mode     TEXT NOT NULL DEFAULT 'specific' CHECK (schedule_mode IN ('specific', 'weekly')),
  poll_type         TEXT NOT NULL DEFAULT 'datetime' CHECK (poll_type IN ('date', 'datetime')),
  duration          INTEGER,
  responses_hidden  INTEGER NOT NULL DEFAULT 0,
  chosen_slot       INTEGER REFERENCES slots(id),
  closed_at         TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_polls_creator ON polls(creator_github_id);

CREATE TABLE IF NOT EXISTS slots (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  poll_id    TEXT NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  position   INTEGER NOT NULL,
  date       TEXT NOT NULL,
  start_time TEXT
);

CREATE INDEX IF NOT EXISTS idx_slots_poll ON slots(poll_id, position);

CREATE TABLE IF NOT EXISTS responses (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  poll_id      TEXT NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  github_id    TEXT NOT NULL,
  github_login TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_responses_poll_user ON responses(poll_id, github_id);

CREATE TABLE IF NOT EXISTS response_values (
  response_id INTEGER NOT NULL REFERENCES responses(id) ON DELETE CASCADE,
  slot_id     INTEGER NOT NULL REFERENCES slots(id) ON DELETE CASCADE,
  value       TEXT NOT NULL CHECK (value IN ('yes', 'no', 'maybe')),
  PRIMARY KEY (response_id, slot_id)
);
