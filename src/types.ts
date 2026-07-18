import type { Context } from "hono";

export interface Env {
  DB: D1Database;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  SESSION_SECRET: string;
}

export interface Session {
  github_id: string;
  github_login: string;
  avatar_url: string;
  expires_at: number;
}

export type AppContext = Context<{ Bindings: Env; Variables: { session: Session | null; csrfToken: string } }>;

export interface Poll {
  id: string;
  creator_github_id: string;
  creator_login: string;
  title: string;
  description: string | null;
  link: string | null;
  timezone: string;
  poll_type: "date" | "datetime";
  duration: number | null;
  responses_hidden: number;
  chosen_slot: number | null;
  closed_at: string | null;
  created_at: string;
}

export interface Slot {
  id: number;
  poll_id: string;
  position: number;
  date: string;
  start_time: string | null;
}

export interface Response {
  id: number;
  poll_id: string;
  github_id: string;
  github_login: string;
  created_at: string;
  updated_at: string;
}

export interface ResponseValue {
  response_id: number;
  slot_id: number;
  value: "yes" | "no" | "maybe";
}

export interface SiteStats {
  activePolls: number;
  closedPolls: number;
  totalResponses: number;
  topCreators: { login: string; count: number }[];
}

export interface PollWithSlots extends Poll {
  slots: Slot[];
}

export interface ResponseWithValues extends Response {
  values: Record<number, "yes" | "no" | "maybe">;
}
