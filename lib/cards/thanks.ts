/**
 * lib/cards/thanks.ts — the Thanks.io API (D53). SERVER-ONLY.
 * Each loan officer connects their own Thanks.io account (OAuth 2.0,
 * docs.thanks.io/authentication/oauth.md); their account pays for cards.
 */
import type { CardKind, PostcardSize } from "./store";

const DASH = "https://dashboard.thanks.io";
export const API = "https://api.thanks.io/api/v2";

export function thanksConfig(): { clientId: string; clientSecret: string } | null {
  const id = process.env.THANKSIO_CLIENT_ID?.trim();
  const secret = process.env.THANKSIO_CLIENT_SECRET?.trim();
  return id && secret ? { clientId: id, clientSecret: secret } : null;
}
export const cardsOn = () => !!thanksConfig();
export const cardsRedirect = (origin: string) => `${origin.replace(/\/+$/, "")}/api/cc/cards/callback`;

type Fetch = typeof fetch;
let fetcher: Fetch = (...a) => fetch(...a);
export const setCardsFetchForTests = (f: Fetch | null) => void (fetcher = f ?? ((...a) => fetch(...a)));
const call: Fetch = (...a) => fetcher(...a);

export function thanksAuthUrl(origin: string, state: string): string | null {
  const cfg = thanksConfig();
  if (!cfg) return null;
  const q = new URLSearchParams({ response_type: "code", client_id: cfg.clientId, redirect_uri: cardsRedirect(origin), state });
  return `${DASH}/oauth/authorize?${q}`;
}

export class ThanksError extends Error {
  constructor(public code: string, public status = 0) {
    super(code);
  }
}
export type ThanksTokens = { access: string; refresh: string | null; expiresAt: string };

async function token(body: Record<string, string>, now: Date): Promise<ThanksTokens> {
  const cfg = thanksConfig();
  if (!cfg) throw new ThanksError("not_configured");
  let res: Response;
  try {
    res = await call(`${DASH}/oauth/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body: new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, ...body }) });
  } catch {
    throw new ThanksError("network");
  }
  const j = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; expires_in?: number; error?: string };
  if (!res.ok || !j.access_token) throw new ThanksError(j.error || `http_${res.status}`, res.status);
  return { access: j.access_token, refresh: j.refresh_token ?? null, expiresAt: new Date(now.getTime() + Math.max(60, Number(j.expires_in) || 3600) * 1000).toISOString() };
}
export const thanksExchange = (code: string, origin: string, now = new Date()) => token({ grant_type: "authorization_code", code, redirect_uri: cardsRedirect(origin) }, now);
export const thanksRefresh = (refresh: string, now = new Date()) => token({ grant_type: "refresh_token", refresh_token: refresh }, now);

async function api<T>(accessToken: string, path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await call(`${API}${path}`, { method: init.method ?? "GET", headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}) }, body: init.body ? JSON.stringify(init.body) : undefined });
  } catch {
    throw new ThanksError("network");
  }
  const j = (await res.json().catch(() => ({}))) as T & { message?: string; errors?: Record<string, string[]>; code?: string };
  if (!res.ok) {
    const first = j.errors ? Object.values(j.errors).flat()[0] : null;
    throw new ThanksError(first || j.message || j.code || `http_${res.status}`, res.status);
  }
  return j;
}

export type Style = { id: number; name: string; sample: string };
export type Design = { id: number; name: string; image: string };

export async function listStyles(t: string): Promise<Style[]> {
  const j = await api<{ data?: { handwriting_style_id: number; name: string; sample: string }[] }>(t, "/handwriting-styles");
  return (j.data ?? []).map((s) => ({ id: s.handwriting_style_id, name: s.name, sample: s.sample }));
}

export const templateType = (kind: CardKind, size: PostcardSize | null) => (kind === "notecard" ? "notecard" : size === "6x9" ? "postcard6x9" : "postcard");

/** Their saved front designs (made in Thanks.io, holiday ones included). */
export async function listDesigns(t: string, kind: CardKind, size: PostcardSize | null): Promise<Design[]> {
  const j = await api<{ data?: { id: number; name: string; image: string }[] }>(t, `/image-templates/?type=${templateType(kind, size)}&items_per_page=48`);
  return (j.data ?? []).filter((d) => /^https:\/\//.test(d.image)).map((d) => ({ id: d.id, name: d.name, image: d.image }));
}

export type Recipient = { name: string; address: string; address2?: string; city: string; province: string; postal_code: string; country: "US" };
export type MailBody = {
  recipients: Recipient[];
  message: string;
  image_template_id: number;
  handwriting_style_id?: number;
  size?: PostcardSize;
  return_name?: string;
  return_address?: string;
  return_address2?: string;
  return_city?: string;
  return_state?: string;
  return_postal_code?: string;
  email_lookup: false;
  metadata: Record<string, string>;
};

export type Estimate = { totalCents: number; balanceCents: number | null; covered: boolean | null; testMode: boolean; recipients: number };
export async function estimate(t: string, kind: CardKind, body: MailBody): Promise<Estimate> {
  const j = await api<{ data?: { total_cost_in_cents?: number; current_balance_in_cents?: number; covered_by_balance?: boolean; test_mode?: boolean; total_recipients?: number } }>(t, `/estimate/${kind}`, { method: "POST", body });
  const d = j.data ?? {};
  return { totalCents: Number(d.total_cost_in_cents) || 0, balanceCents: typeof d.current_balance_in_cents === "number" ? d.current_balance_in_cents : null, covered: typeof d.covered_by_balance === "boolean" ? d.covered_by_balance : null, testMode: !!d.test_mode, recipients: Number(d.total_recipients) || body.recipients.length };
}

export async function sendMail(t: string, kind: CardKind, body: MailBody): Promise<{ orderId: number | null }> {
  const j = await api<{ id?: number; data?: { id?: number } }>(t, `/send/${kind}`, { method: "POST", body });
  return { orderId: j.id ?? j.data?.id ?? null };
}
