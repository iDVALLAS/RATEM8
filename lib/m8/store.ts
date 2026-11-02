/**
 * lib/m8/store.ts — chat transcripts and handoff requests in Neon Postgres
 * (C4). On when DATABASE_URL (or POSTGRES_URL) is set in Vercel; every call
 * is a no-op without it.
 *
 * Rules:
 *  - Only redacted text is stored: SSNs, dates of birth and account
 *    numbers are removed before anything reaches here (lib/m8/redact.ts).
 *  - Kept 3 years from the last message (brief C4), then deleted: rows
 *    carry `delete_after`, and expired rows are purged as new ones arrive.
 *  - "Delete my chat" deletes the session's rows at once.
 *  - One row per chat session, keyed by the random session cookie. No IP,
 *    no name. The borrower's email appears only in a handoff they asked for.
 *
 * Tables are created on first use (CREATE TABLE IF NOT EXISTS).
 */
import { neon } from "@neondatabase/serverless";
import { databaseUrl } from "./server";
import type { M8Message } from "./shared";

export const RETENTION = "3 years";

type Sql = ReturnType<typeof neon<false, false>>;
let ready: Promise<Sql> | null = null;

export function storageOn(): boolean {
  return databaseUrl() !== null;
}

async function db(): Promise<Sql | null> {
  const url = databaseUrl();
  if (!url) return null;
  if (!ready) {
    const sql = neon(url);
    ready = (async () => {
      await sql.query(`CREATE TABLE IF NOT EXISTS m8_transcripts (
        session_id text PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        delete_after timestamptz NOT NULL,
        state text,
        mlo_id text,
        notice_version text NOT NULL,
        two_party_state boolean NOT NULL DEFAULT false,
        messages jsonb NOT NULL
      )`);
      await sql.query(`CREATE INDEX IF NOT EXISTS m8_transcripts_delete_after ON m8_transcripts (delete_after)`);
      await sql.query(`CREATE TABLE IF NOT EXISTS m8_handoffs (
        id bigserial PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        delete_after timestamptz NOT NULL,
        session_id text NOT NULL,
        mlo_id text,
        state text,
        reason text NOT NULL,
        summary text NOT NULL,
        email text
      )`);
      return sql;
    })().catch((e) => {
      ready = null;
      throw e;
    });
  }
  return ready;
}

export type TranscriptMeta = { state: string | null; mloId: string | null; noticeVersion: string; twoPartyState: boolean };

/** Saves the whole (redacted) conversation for this session, replacing the previous copy. */
export async function saveTranscript(sessionId: string, messages: M8Message[], meta: TranscriptMeta): Promise<boolean> {
  try {
    const sql = await db();
    if (!sql) return false;
    await sql.query(
      `INSERT INTO m8_transcripts (session_id, delete_after, state, mlo_id, notice_version, two_party_state, messages)
       VALUES ($1, now() + interval '3 years', $2, $3, $4, $5, $6::jsonb)
       ON CONFLICT (session_id) DO UPDATE SET
         updated_at = now(), delete_after = now() + interval '3 years',
         state = EXCLUDED.state, mlo_id = EXCLUDED.mlo_id, notice_version = EXCLUDED.notice_version,
         two_party_state = EXCLUDED.two_party_state, messages = EXCLUDED.messages`,
      [sessionId, meta.state, meta.mloId, meta.noticeVersion, meta.twoPartyState, JSON.stringify(messages)],
    );
    // Retention: purge expired rows now and then (about 1 write in 50).
    if (Math.random() < 0.02) await purgeExpired(sql);
    return true;
  } catch {
    console.error("[m8-store] transcript save failed");
    return false;
  }
}

async function purgeExpired(sql: Sql): Promise<void> {
  await sql.query(`DELETE FROM m8_transcripts WHERE delete_after < now()`);
  await sql.query(`DELETE FROM m8_handoffs WHERE delete_after < now()`);
}

/** "Delete my chat": removes this session's transcript and handoff requests. */
export async function deleteSession(sessionId: string): Promise<boolean> {
  try {
    const sql = await db();
    if (!sql) return false;
    await sql.query(`DELETE FROM m8_transcripts WHERE session_id = $1`, [sessionId]);
    await sql.query(`DELETE FROM m8_handoffs WHERE session_id = $1`, [sessionId]);
    return true;
  } catch {
    console.error("[m8-store] delete failed");
    return false;
  }
}

export type HandoffRecord = { sessionId: string; mloId: string | null; state: string | null; reason: string; summary: string; email: string | null };

export async function saveHandoff(h: HandoffRecord): Promise<boolean> {
  try {
    const sql = await db();
    if (!sql) return false;
    await sql.query(
      `INSERT INTO m8_handoffs (delete_after, session_id, mlo_id, state, reason, summary, email)
       VALUES (now() + interval '3 years', $1, $2, $3, $4, $5, $6)`,
      [h.sessionId, h.mloId, h.state, h.reason, h.summary, h.email],
    );
    return true;
  } catch {
    console.error("[m8-store] handoff save failed");
    return false;
  }
}
