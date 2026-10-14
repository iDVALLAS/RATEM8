import Link from "next/link";
import { mloContent } from "@/lib/content/mlo";
import type { Flash } from "@/lib/mlo/flash";
import type { Tenant } from "@/lib/pricing/tenants";

export function MloNav({ current, tenantId }: { current: "setup" | "pricing"; tenantId: string }) {
  const q = `?t=${encodeURIComponent(tenantId)}`;
  return (
    <nav className="mlo-nav" aria-label="MLO admin">
      <Link href={`/mlo/setup${q}`} aria-current={current === "setup" ? "page" : undefined}>{mloContent.nav.setup}</Link>
      <Link href={`/mlo/pricing${q}`} aria-current={current === "pricing" ? "page" : undefined}>{mloContent.nav.pricing}</Link>
      <Link href="/rates">{mloContent.nav.rates}</Link>
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
