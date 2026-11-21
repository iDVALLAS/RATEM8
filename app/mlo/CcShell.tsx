import { after } from "next/server";
import { currentUser, isAdmin, ROLE_LABELS } from "@/lib/accounts/auth";
import { adminActor } from "@/lib/mlo/auth";
import { listTenants } from "@/lib/pricing/tenants";
import { conciergeStore } from "@/lib/concierge/store";
import CcTopBar from "./CcTopBar";
import Folds from "./Folds";
import { pilotOn } from "@/lib/pilot/service";
import { repliesWaiting } from "@/lib/messaging/replies";
import "./cc-shell.css";

/**
 * D43: the Command Center frame. Every /mlo page renders inside it in place
 * of the public site's PageShell, so the back office has its own top bar
 * (grouped menus, the theme toggle, your account) and phone tabs, and no
 * public menu or footer. The palette is Command Center's own, brighter,
 * and follows the Night, Dim and Paper toggle (cc-shell.css).
 */
export default async function CcShell({ children }: { children: React.ReactNode; crumbs?: unknown; className?: string; mainClassName?: string; stickyCta?: boolean }) {
  const user = await currentUser().catch(() => null);
  const basic = user ? null : await adminActor().catch(() => null);
  const admin = user ? isAdmin(user) : !!basic;
  const [drafts, replies] = user ? await Promise.all([conciergeStore().proposals(user.id, "pending").then((x) => x.length).catch(() => 0), repliesWaiting(user).catch(() => 0)]) : [0, 0];
  // D71: the loan officer's own Full-auto messages that are due go out after this page is sent (never slows it).
  if (user && user.role !== "assistant") {
    after(async () => {
      const { sendQueuedOnOpen } = await import("@/lib/loa/autopilot");
      await sendQueuedOnOpen(user).catch(() => undefined);
    });
  }
  return (
    <div className="cc-app">
      <CcTopBar admin={admin} signedIn={!!user} pilot={pilotOn()} name={user?.name ?? (basic ? "Shared admin login" : "")} email={user?.email ?? ""} role={user ? ROLE_LABELS[user.role] : ""} tenantId={listTenants()[0]?.id ?? ""} badges={{ concierge: drafts, inbox: replies }} />
      <main id="main" className="cc-main">{children}</main>
      <Folds />
      <footer className="cc-foot">
        <span>MLO Command Center · for licensed loan officers</span>
        <a href="/" target="_blank" rel="noopener noreferrer">loanm8.com</a>
      </footer>
    </div>
  );
}
