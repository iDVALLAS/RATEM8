/**
 * lib/mlo/page-auth.ts — who is looking at a /mlo page (D1). SERVER-ONLY.
 * Pages call these at the top; middleware only does a first pass.
 */
import { redirect } from "next/navigation";
import { currentUser, isAdmin } from "@/lib/accounts/auth";
import type { User } from "@/lib/accounts/store";
import { adminActor } from "./auth";
import { mfaOn, mfaRequired } from "@/lib/accounts/mfa";

export type Viewer = { user: User | null; admin: boolean; label: string };

/** Anyone signed in (any role) or the shared admin login; otherwise to /sign-in. */
export async function requireViewer(opts: { allowWithoutMfa?: boolean } = {}): Promise<Viewer> {
  const user = await currentUser().catch(() => null);
  if (user) {
    // D34: when the owner requires a second sign-in step, set it up before anything else.
    if (!opts.allowWithoutMfa && mfaRequired() && !(await mfaOn(user.id))) redirect("/mlo/security?required=1");
    return { user, admin: isAdmin(user), label: user.email };
  }
  const basic = await adminActor();
  if (basic) return { user: null, admin: true, label: basic };
  redirect("/sign-in");
}

/** Admin pages (setup, pricing, voice, training): owners, team leads and the shared login. */
export async function requireAdminPage(): Promise<Viewer> {
  const v = await requireViewer();
  if (!v.admin) redirect("/mlo");
  return v;
}
