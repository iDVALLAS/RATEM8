/**
 * lib/monitoring.ts — server-side error reporting to Sentry (C5).
 *
 * A switch like the C4 services: on when SENTRY_DSN is set in Vercel, a
 * no-op without it. Events go straight to Sentry's envelope endpoint with
 * fetch, so there is no SDK and nothing reaches the browser bundle.
 *
 * Never sends chat text, prompts, IPs or user data: only an error's name,
 * a trimmed message, and tags the caller chooses (route, reason).
 */

type Level = "error" | "warning";

type Dsn = { endpoint: string; publicKey: string; dsn: string };

export function parseDsn(dsn: string | undefined): Dsn | null {
  if (!dsn) return null;
  const m = dsn.trim().match(/^(https?):\/\/([^@/]+)@([^/]+)\/(?:(.*)\/)?(\d+)$/);
  if (!m) return null;
  const [, scheme, publicKey, host, path, projectId] = m;
  return { endpoint: `${scheme}://${host}/${path ? `${path}/` : ""}api/${projectId}/envelope/`, publicKey, dsn: dsn.trim() };
}

export function monitoringOn(): boolean {
  return parseDsn(process.env.SENTRY_DSN) !== null;
}

/** Strips URLs (connection strings), emails, keys and long numbers from an error message. */
export function scrub(message: string): string {
  return message
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/\S+/gi, "[url]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\b(?:sk|pk|rk)-[A-Za-z0-9_-]{6,}/g, "[key]")
    .replace(/\d{6,}/g, "[number]")
    .slice(0, 300);
}

/** Builds the Sentry envelope (exported for tests). */
export function buildEnvelope(dsn: Dsn, level: Level, name: string, message: string, tags: Record<string, string>, now = new Date()): string {
  const eventId = crypto.randomUUID().replace(/-/g, "");
  const event = {
    event_id: eventId,
    timestamp: now.getTime() / 1000,
    platform: "node",
    level,
    logger: "loanm8",
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
    release: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12),
    tags,
    exception: { values: [{ type: name, value: scrub(message) }] },
  };
  return [
    JSON.stringify({ event_id: eventId, dsn: dsn.dsn, sent_at: now.toISOString() }),
    JSON.stringify({ type: "event" }),
    JSON.stringify(event),
  ].join("\n");
}

/** Reports a problem. Never throws, never blocks long (2s timeout). */
export async function report(level: Level, err: unknown, tags: Record<string, string> = {}): Promise<void> {
  const dsn = parseDsn(process.env.SENTRY_DSN);
  if (!dsn) return;
  const name = err instanceof Error ? err.name : "Event";
  const message = err instanceof Error ? err.message : String(err);
  try {
    await fetch(dsn.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-sentry-envelope",
        "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${dsn.publicKey}, sentry_client=loanm8/1.0`,
      },
      body: buildEnvelope(dsn, level, name, message, tags),
      signal: AbortSignal.timeout(2000),
    });
  } catch {
    // Monitoring must never break the chat.
  }
}
