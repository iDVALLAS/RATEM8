/**
 * lib/pricing/tenants.ts — pricing tenants.
 *
 * The contracting party is the SPONSORING BROKERAGE, not the individual
 * MLO: pricing is per brokerage, and one brokerage's pricing never prices
 * another's scenarios. Tenants are derived from each MLO's per-state
 * sponsor in lib/config.ts (MLO licenses), so a sponsor change there
 * re-routes pricing with no code change. MLOs are
 * seats under a tenant; an individual co-signer can be added as another
 * seat later without a schema change.
 */
import { STATES, ALL_MLOS, type StateCode } from "@/lib/config";

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
  // v15: sponsorship is per MLO, per state. A tenant prices the states
  // where it sponsors at least one MLO; its seats are exactly those MLOs.
  for (const st of STATES) {
    for (const sp of st.sponsors) {
      const id = tenantIdFor(sp);
      if (!map.has(id)) {
        map.set(id, { id, brokerageName: sp.name, brokerageIdLabel: sp.idLabel, brokerageIdNumber: sp.idNumber, states: [], seats: [] });
      }
      const t = map.get(id)!;
      if (!t.states.includes(st.code)) t.states.push(st.code);
      for (const m of ALL_MLOS) {
        const l = m.licenses.find((x) => x.state === st.code);
        if (l && tenantIdFor(l.sponsor) === id && !t.seats.includes(m.nmls)) t.seats.push(m.nmls);
      }
    }
  }
  return Array.from(map.values());
}

export function tenantForState(code: StateCode): Tenant | undefined {
  return listTenants().find((t) => t.states.includes(code));
}

export function tenantById(id: string): Tenant | undefined {
  return listTenants().find((t) => t.id === id);
}
