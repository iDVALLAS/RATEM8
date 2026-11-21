/**
 * lib/blob/private.ts — the private Vercel Blob store (D65.1). SERVER-ONLY.
 *
 * Videos and voicemails live in a PRIVATE store: a file's own address can't
 * be opened without the store's credentials. People reach them only through
 * Command Center's routes, which check who's asking first:
 *  - the loan officer, signed in (their own files);
 *  - a client, through their own watch link (/v/<token>/media);
 *  - Twilio, through a short-lived signed address for one voicemail.
 *
 * Credentials: BLOB_READ_WRITE_TOKEN (needed for uploads from the browser),
 * or BLOB_STORE_ID with Vercel's built-in OIDC token for everything the
 * server does itself. Files saved before the switch (public addresses) still
 * play through the same routes.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { get as blobGet } from "@vercel/blob";

const env = (k: string) => process.env[k]?.trim() || undefined;

/** The server can reach the store (read-write token, or the store id with Vercel's OIDC token). */
export const blobOn = () => !!(env("BLOB_READ_WRITE_TOKEN") || env("BLOB_STORE_ID"));
/** Browsers can upload straight to the store (that needs the read-write token, which signs their one-file pass). */
export const browserUploadOn = () => !!env("BLOB_READ_WRITE_TOKEN");
/** D76: what a loan officer reads when browser uploads aren't on yet (no setup words). */
export const UPLOADS_OFF = "Uploading isn't turned on yet. Your owner finishes it once for everyone.";
/** What the owner does when only the store id is set. */
export const NEEDS_TOKEN =
  "The private Blob store is connected, but uploads from the browser need its read-write token. In Vercel: Storage → loanm8-private → Projects → reconnect ratem-8 with \"Add a read-write token env var\" ticked, then redeploy.";

const HOST = /^[a-z0-9]+\.(public|private)\.blob\.vercel-storage\.com$/i;

/** A file address in a Vercel Blob store (public or private), cleaned, or null. */
export function blobAddress(url: string): { url: string; pathname: string; access: "public" | "private" } | null {
  try {
    const u = new URL(url);
    const m = u.hostname.match(HOST);
    if (u.protocol !== "https:" || !m || u.username || u.password || u.port) return null;
    const pathname = decodeURIComponent(u.pathname.replace(/^\//, ""));
    if (!pathname || pathname.includes("..")) return null;
    return { url: `${u.origin}${u.pathname}`, pathname, access: m[1].toLowerCase() as "public" | "private" };
  } catch {
    return null;
  }
}

export type Got = { stream: ReadableStream<Uint8Array>; contentType: string; length: string | null; range: string | null };
export type Getter = (url: string, opts: { access: "public" | "private"; headers?: Record<string, string> }) => Promise<Got | null>;
export const realGetter: Getter = async (url, opts) => {
  const r = await blobGet(url, { access: opts.access, headers: opts.headers });
  if (!r || r.statusCode !== 200) return null;
  return { stream: r.stream, contentType: r.blob.contentType, length: r.headers.get("content-length"), range: r.headers.get("content-range") };
};

/**
 * Streams one stored file to whoever the route has already checked.
 * Passes a byte range through (so video can seek), never lets a browser
 * or proxy keep a copy, and never sends the file's own address.
 */
export async function streamFile(url: string, req: Request | null, opts: { contentType?: string; download?: string } = {}, getter: Getter = realGetter): Promise<Response> {
  const a = blobAddress(url);
  if (!a) return new Response("Not found", { status: 404 });
  const range = req?.headers.get("range");
  let r: Awaited<ReturnType<Getter>>;
  try {
    r = await getter(a.url, { access: a.access, headers: range && /^bytes=\d*-\d*$/.test(range) ? { Range: range } : undefined });
  } catch (e) {
    console.warn(`[blob] read failed: ${e instanceof Error ? e.name : "error"}`);
    return new Response("Not available", { status: 502 });
  }
  if (!r) return new Response("Not found", { status: 404 });
  const h = new Headers({ "Content-Type": opts.contentType || r.contentType || "application/octet-stream", "Cache-Control": "private, no-store", "Accept-Ranges": "bytes", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" });
  const len = r.length;
  const cr = r.range;
  if (len) h.set("Content-Length", len);
  if (cr) h.set("Content-Range", cr);
  if (opts.download) h.set("Content-Disposition", `attachment; filename="${opts.download.replace(/[^\w.-]/g, "_")}"`);
  return new Response(r.stream, { status: cr ? 206 : 200, headers: h });
}

// ---- Signed addresses for one file (for Twilio, which can't sign in) ----

function key(): Buffer | null {
  const s = env("CC_LINK_SECRET");
  if (s) return createHash("sha256").update(`cc-media:${s}`).digest();
  const db = env("DATABASE_URL");
  return db ? createHash("sha256").update(`cc-media-db:${db}`).digest() : null;
}
const mac = (k: Buffer, payload: string) => createHmac("sha256", k).update(payload).digest("base64url").slice(0, 32);

/** Query string (?id=…&e=…&s=…) for one file, good for ttlSeconds. Null without a key. */
export function signMedia(kind: string, id: string, now = new Date(), ttlSeconds = 3_600): string | null {
  const k = key();
  if (!k) return null;
  const e = Math.floor(now.getTime() / 1000) + ttlSeconds;
  return `id=${encodeURIComponent(id)}&e=${e}&s=${mac(k, `${kind}.${id}.${e}`)}`;
}

/** The file id a signed address names, if it's genuine and not expired. */
export function readMedia(kind: string, params: URLSearchParams, now = new Date()): string | null {
  const k = key();
  const id = params.get("id") ?? "";
  const e = Number(params.get("e"));
  const s = params.get("s") ?? "";
  if (!k || !id || id.length > 80 || !Number.isInteger(e) || !s) return null;
  if (e < Math.floor(now.getTime() / 1000)) return null;
  const want = Buffer.from(mac(k, `${kind}.${id}.${e}`));
  const got = Buffer.from(s);
  return want.length === got.length && timingSafeEqual(want, got) ? id : null;
}
