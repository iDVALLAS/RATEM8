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

export type Attachment = { filename: string; contentType: string; content: Uint8Array };
export type PlainMail = { fromName: string; fromEmail: string; to: string; subject: string; text: string; replyTo?: string | null; attachments?: Attachment[] };

/** A file name safe for a header: no quotes, slashes or line breaks. */
export const safeFilename = (s: string) => oneLine(s).replace(/["\\/\x00-\x1f]/g, "").slice(0, 120) || "file";
const b64lines = (b: Buffer) => b.toString("base64").replace(/.{76}/g, "$&\r\n");

export function buildMime(m: PlainMail, now = new Date(), messageIdDomain?: string): string {
  const body = b64lines(Buffer.from(m.text.replace(/\r?\n/g, "\r\n"), "utf8"));
  const domain = messageIdDomain ?? m.fromEmail.split("@")[1] ?? "localhost";
  const headers = [
    `From: ${named(m.fromName, m.fromEmail)}`,
    `To: ${addr(m.to)}`,
    ...(m.replyTo ? [`Reply-To: ${addr(m.replyTo)}`] : []),
    `Subject: ${encodeWord(oneLine(m.subject))}`,
    `Date: ${now.toUTCString().replace("GMT", "+0000")}`,
    `Message-ID: <${now.getTime().toString(36)}.${Math.random().toString(36).slice(2, 10)}@${domain}>`,
    "MIME-Version: 1.0",
  ];
  const files = m.attachments ?? [];
  if (!files.length) return `${[...headers, "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64"].join("\r\n")}\r\n\r\n${body}`;
  const boundary = `cc_${now.getTime().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
  const parts = [
    `--${boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${body}`,
    ...files.map((f) => {
      const name = encodeWord(safeFilename(f.filename));
      const type = /^[a-z]+\/[a-z0-9.+-]+$/i.test(f.contentType) ? f.contentType : "application/octet-stream";
      return `--${boundary}\r\nContent-Type: ${type}; name="${name}"\r\nContent-Disposition: attachment; filename="${name}"\r\nContent-Transfer-Encoding: base64\r\n\r\n${b64lines(Buffer.from(f.content))}`;
    }),
  ];
  return `${[...headers, `Content-Type: multipart/mixed; boundary="${boundary}"`].join("\r\n")}\r\n\r\n${parts.join("\r\n")}\r\n--${boundary}--`;
}

export const base64url = (s: string) => Buffer.from(s, "utf8").toString("base64url");
