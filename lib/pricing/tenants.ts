/**
 * lib/pricing/tenants.ts — pricing tenants.
 *
 * The contracting party is the SPONSORING BROKERAGE, not the individual
 * MLO: pricing is per brokerage, and one brokerage's pricing never prices
 * another's scenarios. Tenants are derived from the per-state sponsors in
 * lib/config.ts, so a sponsor change there (or, later, in the admin
 * sponsorship setting) re-routes pricing with no code change. MLOs are
 * seats under a tenant; an individual co-signer can be added as another
 * seat later without a schema change.
 */
import { CONFIG, ALL_MLOS, type StateCode } from "@/lib/config";

export type Tenant = {
  id: string;
  brokerageName: string;
  brokerageIdLabel: string;
  brokerageIdNumber: string;
  states: StateCode[];
  /** MLO seats (NMLS numbers from config). */
  seats: string[];
};

/** Fixture tenant for example pricing. Never a real brokerage. */
export const EXAMPLE_TENANT_ID = "example";

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function tenantIdFor(sponsor: { name: string; idNumber: string }): string {
  return `brokerage-${slug(sponsor.name)}-${slug(sponsor.idNumber)}`;
}

export function listTenants(): Tenant[] {
  const map = new Map<string, Tenant>();
  for (const st of CONFIG.states) {
    const id = tenantIdFor(st.sponsor);
    if (!map.has(id)) {
      map.set(id, {
        id,
        brokerageName: st.sponsor.name,
        brokerageIdLabel: st.sponsor.idLabel,
        brokerageIdNumber: st.sponsor.idNumber,
        states: [],
        seats: ALL_MLOS.map((m) => m.nmls),
      });
    }
    map.get(id)!.states.push(st.code);
  }
  return Array.from(map.values());
}

export function tenantForState(code: StateCode): Tenant | undefined {
  return listTenants().find((t) => t.states.includes(code));
}

export function tenantById(id: string): Tenant | undefined {
  return listTenants().find((t) => t.id === id);
}
