/**
 * lib/messaging/replies.ts — how many people are waiting for a reply (D76):
 * conversations whose latest message came in from them. The Inbox tab's
 * badge and Home's "replies" chip both use it. SERVER-ONLY.
 */
import type { User } from "@/lib/accounts/store";
import { scopeOf } from "@/lib/contacts/service";
import { touchStore } from "./store";

export async function repliesWaiting(user: User, limit = 200): Promise<number> {
  const threads = await touchStore().threads(scopeOf(user), limit);
  return threads.filter((t) => t.direction === "in").length;
}
