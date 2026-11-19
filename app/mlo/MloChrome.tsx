import Link from "next/link";
import { mloContent } from "@/lib/content/mlo";
import type { Flash } from "@/lib/mlo/flash";
import type { Tenant } from "@/lib/pricing/tenants";

type NavKey = "report" | "home" | "concierge" | "scripts" | "automations" | "calls" | "refi" | "inbox" | "pipeline" | "contacts" | "rules" | "team" | "security" | "network" | "expenses" | "templates" | "academy" | "setup" | "pricing" | "voice" | "training";

/**
 * D43: the menu moved to Command Center's own top bar (CcTopBar, from
 * app/mlo/nav.ts). Pages still call MloNav; it renders nothing now.
 */
export function MloNav(_props: { current: NavKey; tenantId: string; admin?: boolean; signedIn?: boolean }) {
  return null;
}

export function TenantPicker({ tenants, current, base, extra = "" }: { tenants: Tenant[]; current: string; base: string; extra?: string }) {
  if (tenants.length < 2) return <p className="mlo-note">{mloContent.tenantLabel}: {tenants[0]?.brokerageName}</p>;
  return (
    <nav className="mlo-nav" aria-label={mloContent.tenantLabel}>
      {tenants.map((t) => (
        <Link key={t.id} href={`${base}?t=${encodeURIComponent(t.id)}${extra}`} aria-current={t.id === current ? "page" : undefined}>
          {t.brokerageName} · {t.states.join(", ")}
        </Link>
      ))}
    </nav>
  );
}

export function FlashBox({ flash }: { flash: Flash | null }) {
  if (!flash) return null;
  return (
    <div className={`mlo-flash ${flash.ok ? "mlo-flash--ok" : "mlo-flash--err"}`} role={flash.ok ? "status" : "alert"}>
      {flash.lines.map((l) => <p key={l}>{l}</p>)}
    </div>
  );
}
