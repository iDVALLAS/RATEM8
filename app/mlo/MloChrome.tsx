import Link from "next/link";
import { mloContent } from "@/lib/content/mlo";
import type { Flash } from "@/lib/mlo/flash";
import type { Tenant } from "@/lib/pricing/tenants";

type NavKey = "home" | "inbox" | "contacts" | "rules" | "team" | "setup" | "pricing" | "voice" | "training";

/** D1: admins see the admin areas; everyone signed in sees Home, Team and Sign out. */
export function MloNav({ current, tenantId, admin = true, signedIn = false }: { current: NavKey; tenantId: string; admin?: boolean; signedIn?: boolean }) {
  const q = `?t=${encodeURIComponent(tenantId)}`;
  const link = (key: NavKey, href: string, label: string) => (
    <Link href={href} aria-current={current === key ? "page" : undefined}>{label}</Link>
  );
  return (
    <nav className="mlo-nav" aria-label="MLO admin">
      {link("home", "/mlo", mloContent.nav.home)}
      {link("inbox", "/mlo/inbox", mloContent.nav.inbox)}
      {link("contacts", "/mlo/contacts", mloContent.nav.contacts)}
      {link("rules", "/mlo/rules", mloContent.nav.rules)}
      {link("team", "/mlo/team", mloContent.nav.team)}
      {admin ? (
        <>
          {link("setup", `/mlo/setup${q}`, mloContent.nav.setup)}
          {link("pricing", `/mlo/pricing${q}`, mloContent.nav.pricing)}
          {link("voice", `/mlo/voice${q}`, mloContent.nav.voice)}
          {link("training", `/mlo/training${q}`, mloContent.nav.training)}
          <Link href="/rates">{mloContent.nav.rates}</Link>
        </>
      ) : null}
      {signedIn ? (
        <form action="/api/cc/signout" method="post" className="mlo-signout">
          <button type="submit">{mloContent.nav.signOut}</button>
        </form>
      ) : null}
    </nav>
  );
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
