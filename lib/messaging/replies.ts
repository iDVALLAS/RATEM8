/**
 * lib/messaging/replies.ts — how many people are waiting for a reply (D76):
 * conversations whose latest message came in from them. The Inbox tab's
 * badge and Home's "replies" chip both use it. D79: a conversation marked
 * Done or snoozed doesn't count until they write again (or the snooze ends),
 * and a STOP isn't waiting on a reply. SERVER-ONLY.
 */
import type { User } from "@/lib/accounts/store";
import { needsReplyCount } from "@/lib/inbox/service";

export async function repliesWaiting(user: User, now = new Date()): Promise<number> {
  return needsReplyCount(user, now);
}
