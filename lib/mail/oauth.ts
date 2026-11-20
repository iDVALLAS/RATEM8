/**
 * lib/mail/oauth.ts — connecting a loan officer's own mailbox (D52).
 * SERVER-ONLY.
 *
 * Send-only on purpose: Gmail asks for gmail.send (a "sensitive" scope:
 * Google verifies the app's brand, no security assessment), Microsoft 365
 * for Mail.Send. Neither can read the inbox. Sign-in is the standard
 * authorization-code flow with PKCE and a one-time state value.
 */
import { createHash, randomBytes } from "node:crypto";
import type { MailProvider } from "./store";

export const GMAIL_SEND = "https://www.googleapis.com/auth/gmail.send";
export const MS_SEND = "Mail.Send";

type Cfg = { clientId: string; clientSecret: string };
export function providerConfig(p: MailProvider): Cfg | null {
  const id = (p === "google" ? process.env.GOOGLE_OAUTH_CLIENT_ID : process.env.MS_OAUTH_CLIENT_ID)?.trim();
  const secret = (p === "google" ? process.env.GOOGLE_OAUTH_CLIENT_SECRET : process.env.MS_OAUTH_CLIENT_SECRET)?.trim();
  return id && secret ? { clientId: id, clientSecret: secret } : null;
}
export const providersOn = (): MailProvider[] => (["google", "microsoft"] as const).filter((p) => !!providerConfig(p));
export const PROVIDER_LABEL: Record<MailProvider, string> = { google: "Gmail", microsoft: "Microsoft 365" };

/** The exact address to register with Google and Microsoft. */
export const redirectUri = (origin: string, p: MailProvider) => `${origin.replace(/\/+$/, "")}/api/cc/mail/callback/${p}`;

const MS_TENANT = () => process.env.MS_OAUTH_TENANT?.trim() || "common";
const ENDPOINTS = {
  google: { auth: "https://accounts.google.com/o/oauth2/v2/auth", token: "https://oauth2.googleapis.com/token", scope: `openid email ${GMAIL_SEND}` },
  microsoft: { auth: () => `https://login.microsoftonline.com/${MS_TENANT()}/oauth2/v2.0/authorize`, token: () => `https://login.microsoftonline.com/${MS_TENANT()}/oauth2/v2.0/token`, scope: `openid email offline_access User.Read ${MS_SEND}` },
};

export const newVerifier = () => randomBytes(32).toString("base64url");
export const challengeOf = (verifier: string) => createHash("sha256").update(verifier).digest("base64url");

export function authUrl(p: MailProvider, origin: string, state: string, verifier: string, loginHint?: string): string | null {
  const cfg = providerConfig(p);
  if (!cfg) return null;
  const q = new URLSearchParams({ client_id: cfg.clientId, redirect_uri: redirectUri(origin, p), response_type: "code", state, code_challenge: challengeOf(verifier), code_challenge_method: "S256" });
  if (p === "google") {
    q.set("scope", ENDPOINTS.google.scope);
    q.set("access_type", "offline");
    q.set("prompt", "consent");
    q.set("include_granted_scopes", "false");
    if (loginHint) q.set("login_hint", loginHint);
    return `${ENDPOINTS.google.auth}?${q}`;
  }
  q.set("scope", ENDPOINTS.microsoft.scope);
  q.set("response_mode", "query");
  q.set("prompt", "select_account");
  if (loginHint) q.set("login_hint", loginHint);
  return `${ENDPOINTS.microsoft.auth()}?${q}`;
}

export type Tokens = { access: string; refresh: string | null; expiresAt: string; scope: string };
type Fetch = typeof fetch;
let fetcher: Fetch = (...a) => fetch(...a);
export const setMailFetchForTests = (f: Fetch | null) => void (fetcher = f ?? ((...a) => fetch(...a)));
export const mailFetch: Fetch = (...a) => fetcher(...a);

/** "invalid_grant" means the person (or their admin) took the permission back. */
export class TokenError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

async function tokenCall(p: MailProvider, body: Record<string, string>, now: Date): Promise<Tokens> {
  const cfg = providerConfig(p);
  if (!cfg) throw new TokenError("not_configured");
  const url = p === "google" ? ENDPOINTS.google.token : ENDPOINTS.microsoft.token();
  const extra: Record<string, string> = p === "microsoft" ? { scope: ENDPOINTS.microsoft.scope } : {};
  let res: Response;
  try {
    res = await mailFetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, ...extra, ...body }) });
  } catch {
    throw new TokenError("network");
  }
  const j = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error?: string };
  if (!res.ok || !j.access_token) throw new TokenError(j.error || `http_${res.status}`);
  return { access: j.access_token, refresh: j.refresh_token ?? null, expiresAt: new Date(now.getTime() + Math.max(60, Number(j.expires_in) || 3600) * 1000).toISOString(), scope: j.scope ?? "" };
}

export const exchangeCode = (p: MailProvider, code: string, verifier: string, origin: string, now = new Date()) =>
  tokenCall(p, { grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: redirectUri(origin, p) }, now);

export const refreshTokens = (p: MailProvider, refresh: string, now = new Date()) => tokenCall(p, { grant_type: "refresh_token", refresh_token: refresh }, now);

/** Whether the person left the send permission ticked (Google lets them untick it). */
export function grantedSend(p: MailProvider, scope: string): boolean {
  const s = scope.split(/\s+/);
  return p === "google" ? s.includes(GMAIL_SEND) : s.some((x) => x.toLowerCase() === "mail.send" || x.toLowerCase().endsWith("/mail.send"));
}

/** The mailbox's own address. */
export async function mailboxAddress(p: MailProvider, access: string): Promise<string | null> {
  const url = p === "google" ? "https://openidconnect.googleapis.com/v1/userinfo" : "https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName";
  try {
    const res = await mailFetch(url, { headers: { Authorization: `Bearer ${access}` } });
    if (!res.ok) return null;
    const j = (await res.json()) as { email?: string; email_verified?: boolean; mail?: string | null; userPrincipalName?: string };
    const e = p === "google" ? (j.email_verified === false ? null : j.email) : j.mail || j.userPrincipalName;
    return e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e.toLowerCase() : null;
  } catch {
    return null;
  }
}

/** Best effort: Google can revoke from here; Microsoft is removed from the account's app list. */
export async function revoke(p: MailProvider, refresh: string): Promise<void> {
  if (p !== "google") return;
  await mailFetch("https://oauth2.googleapis.com/revoke", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: refresh }) }).catch(() => null);
}
