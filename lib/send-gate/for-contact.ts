/**
 * lib/send-gate/for-contact.ts — facts about the sender the gate needs (D3).
 * SERVER-ONLY (reads config). The full per-contact decision is
 * lib/messaging/service.ts gateFor.
 */
import { mloById } from "@/lib/config";
import type { User } from "@/lib/accounts/store";

/** States a user may market loans in: their loan officer record's licenses. Staff without a record: none. */
export function licensedStatesFor(user: User): string[] {
  return mloById(user.mloId)?.licenses.map((l) => l.state) ?? [];
}
