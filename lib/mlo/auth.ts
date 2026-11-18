/**
 * lib/mlo/auth.ts — re-check admin credentials inside server actions and
 * admin pages. Middleware only does a first pass on /mlo/*; this is the
 * real check. Returns the acting user's email (or the Basic user name).
 *
 * D1: a Command Center session with an admin role (owner, team lead)
 * counts, and so does the old shared HTTP Basic login unless
 * MLO_BASIC_AUTH="false".
 */
import { headers } from "next/headers";
import { timingSafeEqual } from "node:crypto";
import { currentUser, isAdmin } from "@/lib/accounts/auth";

function eq(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function requireAdmin(): Promise<string> {
  const actor = await adminActor();
  if (!actor) throw new Error("Not authorized.");
  return actor;
}

/** The admin acting on this request, or null. Never throws. */
export async function adminActor(): Promise<string | null> {
  const u = await currentUser().catch(() => null);
  if (isAdmin(u)) return u!.email;
  try {
    return await basicUser();
  } catch {
    return null;
  }
}

async function basicUser(): Promise<string> {
  if (process.env.MLO_BASIC_AUTH === "false") throw new Error("Shared login is off.");
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
