/**
 * lib/videos/store.ts — video messages and who each was sent to (D55).
 * SERVER-ONLY. Neon tables cc_videos and cc_video_sends when DATABASE_URL is
 * set, else memory. The video files themselves live in Vercel Blob.
 */
import { neon } from "@neondatabase/serverless";
import { databaseUrl } from "@/lib/m8/server";

/** A caption line: seconds from the start, and the words. */
export type Cue = { start: number; end: number; text: string };

export type VideoStatus = "checking" | "ok" | "held" | "deleted";

export type Video = {
  id: string;
  ownerUserId: string;
  title: string;
  /** The video in Vercel Blob (public, unguessable address). */
  url: string;
  pathname: string;
  contentType: string;
  size: number;
  posterUrl: string | null;
  posterPathname: string | null;
  durationSec: number;
  /**
   * checking: the word check hasn't finished. ok: it passed and the video can
   * be sent. held: it didn't pass (reason says why). deleted: gone.
   */
  status: VideoStatus;
  reason: string;
  /** The word check, one piece per 50 seconds of sound. */
  parts: (string | null)[];
  partCues: Cue[][];
  /** Seconds of sound in each piece (the true length, whatever the browser said). */
  partSeconds: number[];
  transcript: string;
  cues: Cue[];
  createdAt: string;
  checkedAt: string | null;
  deletedAt: string | null;
};

export type VideoSend = {
  /** The watch link's token (/v/<token>). */
  token: string;
  videoId: string;
  ownerUserId: string;
  contactId: string;
  contactName: string;
  channel: "text" | "email";
  status: "sending" | "sent" | "failed";
  at: string;
  views: number;
  firstViewedAt: string | null;
  lastViewedAt: string | null;
};

export interface VideoStore {
  video(id: string): Promise<Video | null>;
  putVideo(v: Video): Promise<void>;
  videosFor(ownerUserId: string, limit?: number): Promise<Video[]>;
  send(token: string): Promise<VideoSend | null>;
  putSend(s: VideoSend): Promise<void>;
  sendsFor(ownerUserId: string, limit?: number): Promise<VideoSend[]>;
  sendsForContact(contactId: string, limit?: number): Promise<VideoSend[]>;
  /** Adds a view; returns the send as it is now (null if no such link). */
  addView(token: string, at: string): Promise<VideoSend | null>;
}

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

class MemoryVideoStore implements VideoStore {
  private v = new Map<string, Video>();
  private s = new Map<string, VideoSend>();
  async video(id: string) {
    const x = this.v.get(id);
    return x ? clone(x) : null;
  }
  async putVideo(x: Video) {
    this.v.set(x.id, clone(x));
  }
  async videosFor(owner: string, limit = 50) {
    return [...this.v.values()].filter((x) => x.ownerUserId === owner && x.status !== "deleted").sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit).map(clone);
  }
  async send(token: string) {
    const x = this.s.get(token);
    return x ? clone(x) : null;
  }
  async putSend(x: VideoSend) {
    this.s.set(x.token, clone(x));
  }
  async sendsFor(owner: string, limit = 100) {
    return [...this.s.values()].filter((x) => x.ownerUserId === owner && x.status === "sent").sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit).map(clone);
  }
  async sendsForContact(contactId: string, limit = 20) {
    return [...this.s.values()].filter((x) => x.contactId === contactId && x.status === "sent").sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit).map(clone);
  }
  async addView(token: string, at: string) {
    const x = this.s.get(token);
    if (!x) return null;
    x.views += 1;
    x.firstViewedAt ??= at;
    x.lastViewedAt = at;
    return clone(x);
  }
}

type Q = (t: string, p?: unknown[]) => Promise<Record<string, unknown>[]>;
const parse = <T>(v: unknown): T => (typeof v === "string" ? JSON.parse(v) : v) as T;

class NeonVideoStore implements VideoStore {
  private ready: Promise<unknown> | null = null;
  constructor(private q: Q) {}
  private init() {
    return (this.ready ??= Promise.all([
      this.q(`CREATE TABLE IF NOT EXISTS cc_videos (id text PRIMARY KEY, owner_user_id text NOT NULL, status text NOT NULL, created_at text NOT NULL, data jsonb NOT NULL)`),
      this.q(`CREATE TABLE IF NOT EXISTS cc_video_sends (token text PRIMARY KEY, video_id text NOT NULL, owner_user_id text NOT NULL, contact_id text NOT NULL, status text NOT NULL, at text NOT NULL, data jsonb NOT NULL)`),
    ]).catch((e) => {
      this.ready = null;
      throw e;
    }));
  }
  async video(id: string) {
    await this.init();
    const r = await this.q(`SELECT data FROM cc_videos WHERE id = $1`, [id]);
    return r[0] ? parse<Video>(r[0].data) : null;
  }
  async putVideo(x: Video) {
    await this.init();
    await this.q(`INSERT INTO cc_videos (id, owner_user_id, status, created_at, data) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, data = EXCLUDED.data`, [x.id, x.ownerUserId, x.status, x.createdAt, JSON.stringify(x)]);
  }
  async videosFor(owner: string, limit = 50) {
    await this.init();
    const r = await this.q(`SELECT data FROM cc_videos WHERE owner_user_id = $1 AND status <> 'deleted' ORDER BY created_at DESC LIMIT $2`, [owner, limit]);
    return r.map((x) => parse<Video>(x.data));
  }
  async send(token: string) {
    await this.init();
    const r = await this.q(`SELECT data FROM cc_video_sends WHERE token = $1`, [token]);
    return r[0] ? parse<VideoSend>(r[0].data) : null;
  }
  async putSend(x: VideoSend) {
    await this.init();
    await this.q(`INSERT INTO cc_video_sends (token, video_id, owner_user_id, contact_id, status, at, data) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (token) DO UPDATE SET status = EXCLUDED.status, data = EXCLUDED.data`, [x.token, x.videoId, x.ownerUserId, x.contactId, x.status, x.at, JSON.stringify(x)]);
  }
  async sendsFor(owner: string, limit = 100) {
    await this.init();
    const r = await this.q(`SELECT data FROM cc_video_sends WHERE owner_user_id = $1 AND status = 'sent' ORDER BY at DESC LIMIT $2`, [owner, limit]);
    return r.map((x) => parse<VideoSend>(x.data));
  }
  async sendsForContact(contactId: string, limit = 20) {
    await this.init();
    const r = await this.q(`SELECT data FROM cc_video_sends WHERE contact_id = $1 AND status = 'sent' ORDER BY at DESC LIMIT $2`, [contactId, limit]);
    return r.map((x) => parse<VideoSend>(x.data));
  }
  async addView(token: string, at: string) {
    await this.init();
    // One statement, so two people pressing play together both count.
    const r = await this.q(
      `UPDATE cc_video_sends SET data = jsonb_set(jsonb_set(jsonb_set(data, '{views}', to_jsonb(COALESCE((data->>'views')::int, 0) + 1)), '{lastViewedAt}', to_jsonb($2::text)), '{firstViewedAt}', COALESCE(NULLIF(data->'firstViewedAt', 'null'::jsonb), to_jsonb($2::text))) WHERE token = $1 RETURNING data`,
      [token, at],
    );
    return r[0] ? parse<VideoSend>(r[0].data) : null;
  }
}

let override: VideoStore | null = null;
let neonStore: NeonVideoStore | null = null;
const g = globalThis as unknown as { __lm8VideoMemory?: MemoryVideoStore };
const memory = (g.__lm8VideoMemory ??= new MemoryVideoStore());
export const setVideoStoreForTests = (s: VideoStore | null) => void (override = s);
export const newMemoryVideoStore = (): VideoStore => new MemoryVideoStore();
export function videoStore(): VideoStore {
  if (override) return override;
  const url = databaseUrl();
  if (!url) return memory;
  if (!neonStore) {
    const sql = neon(url);
    neonStore = new NeonVideoStore((t, p) => sql.query(t, p ?? []) as Promise<Record<string, unknown>[]>);
  }
  return neonStore;
}
