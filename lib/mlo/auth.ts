/**
 * lib/mlo/auth.ts — re-check admin credentials inside server actions.
 * Middleware already gates /mlo/*; this is defense in depth so an action
 * can never run without the same credentials. Returns the acting user.
 */
import { headers } from "next/headers";
import { timingSafeEqual } from "node:crypto";

function eq(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function requireAdmin(): Promise<string> {
  const user = process.env.MLO_ADMIN_USER;
  const pass = process.env.MLO_ADMIN_PASSWORD;
  if (!user || !pass) throw new Error("MLO admin is not configured.");
  const header = (await headers()).get("authorization") ?? "";
  if (!header.startsWith("Basic ")) throw new Error("Not authorized.");
  const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  const i = decoded.indexOf(":");
  if (i <= 0 || !eq(decoded.slice(0, i), user) || !eq(decoded.slice(i + 1), pass)) throw new Error("Not authorized.");
  return decoded.slice(0, i);
}
