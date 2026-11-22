/**
 * lib/contacts/scope.ts — "Check do-not-call and phone type" from the bulk
 * bar (D78): which people Record permission is limited to. SERVER-ONLY.
 *
 * The address carries either the people picked (`ids=c_…,c_…`, up to 500) or
 * a list's rule (`scope=list&tag=…`). Both are rebuilt from known keys only,
 * and every person is checked with `canSee`; one id outside the viewer's
 * book means nobody (as the bulk bar's other actions).
 */
import type { User } from "@/lib/accounts/store";
import { ruleFromParams, ruleQuery } from "./filter";
import { peopleIn } from "./lists";
import { canSee } from "./service";
import { contactStore, type Contact } from "./store";

const ID = /^c_[A-Za-z0-9_-]{6,40}$/;
export const MAX_SCOPE_IDS = 500;

type Params = { get(k: string): string | null } | Record<string, string | undefined>;
const read = (p: Params, k: string) => (typeof (p as { get?: unknown }).get === "function" ? (p as { get(k: string): string | null }).get(k) : (p as Record<string, string | undefined>)[k]) ?? "";

/** The scope as a clean address part ("" when there is none). */
export function checkScope(p: Params): string {
  const ids = read(p, "ids");
  if (ids) {
    const list = [...new Set(ids.split(",").map((x) => x.trim()).filter((x) => ID.test(x)))].slice(0, MAX_SCOPE_IDS);
    return list.length ? `ids=${list.join(",")}` : "";
  }
  if (read(p, "scope") === "list") {
    const q = ruleQuery(ruleFromParams(p));
    return `scope=list${q ? `&${q}` : ""}`;
  }
  return "";
}

/** The people a scope names, all in the viewer's book (or nobody). */
export async function scopePeople(user: User, scope: string): Promise<Contact[]> {
  if (user.status !== "active" || !scope) return [];
  const p = new URLSearchParams(scope);
  const ids = p.get("ids");
  if (ids) {
    const out: Contact[] = [];
    for (const id of ids.split(",").slice(0, MAX_SCOPE_IDS)) {
      const c = await contactStore().get(id);
      if (!c || !canSee(user, c)) return [];
      out.push(c);
    }
    return out;
  }
  if (p.get("scope") === "list") return peopleIn(user, ruleFromParams(p), 5000);
  return [];
}
