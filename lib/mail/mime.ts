/**
 * lib/mail/mime.ts — a plain-text email as an RFC 5322 message, for the
 * Gmail API (D52). Header values are stripped of line breaks (no header
 * injection) and encoded when they aren't plain ASCII.
 */
const oneLine = (s: string) => s.replace(/[\r\n]+/g, " ").trim();
const encodeWord = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, "utf8").toString("base64")}?=`);
const addr = (email: string) => {
  const e = oneLine(email);
  if (!/^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/.test(e)) throw new Error("bad address");
  return e;
};
const named = (name: string, email: string) => {
  const n = oneLine(name).replace(/["\\]/g, "");
  return n ? `${/^[\x20-\x7e]*$/.test(n) ? `"${n}"` : encodeWord(n)} <${addr(email)}>` : addr(email);
};

export type PlainMail = { fromName: string; fromEmail: string; to: string; subject: string; text: string; replyTo?: string | null };

export function buildMime(m: PlainMail, now = new Date(), messageIdDomain?: string): string {
  const body = Buffer.from(m.text.replace(/\r?\n/g, "\r\n"), "utf8").toString("base64").replace(/.{76}/g, "$&\r\n");
  const domain = messageIdDomain ?? m.fromEmail.split("@")[1] ?? "localhost";
  const headers = [
    `From: ${named(m.fromName, m.fromEmail)}`,
    `To: ${addr(m.to)}`,
    ...(m.replyTo ? [`Reply-To: ${addr(m.replyTo)}`] : []),
    `Subject: ${encodeWord(oneLine(m.subject))}`,
    `Date: ${now.toUTCString().replace("GMT", "+0000")}`,
    `Message-ID: <${now.getTime().toString(36)}.${Math.random().toString(36).slice(2, 10)}@${domain}>`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
  ];
  return `${headers.join("\r\n")}\r\n\r\n${body}`;
}

export const base64url = (s: string) => Buffer.from(s, "utf8").toString("base64url");
