/** Small result messages passed through the redirect URL after a server action. */
export type Flash = { ok: boolean; lines: string[] };

export function encodeFlash(f: Flash): string {
  return Buffer.from(JSON.stringify(f), "utf8").toString("base64url");
}

export function decodeFlash(v: string | undefined): Flash | null {
  if (!v) return null;
  try {
    const f = JSON.parse(Buffer.from(v, "base64url").toString("utf8")) as Flash;
    return typeof f.ok === "boolean" && Array.isArray(f.lines) ? { ok: f.ok, lines: f.lines.slice(0, 20).map(String) } : null;
  } catch {
    return null;
  }
}
