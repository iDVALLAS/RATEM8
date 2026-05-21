/**
 * RateM8 footer.
 *
 * Compliance-critical content for a regulated lender website.
 * All NMLS / sponsor / entity values pull from lib/licensing.ts —
 * the single source of truth. Update licensing.ts and disclosures
 * regenerate everywhere.
 *
 * Uses theme tokens so it works correctly in Night, Dim, and Paper modes.
 *
 * IMPORTANT: Verify the NMLS # for sponsoring entities on
 * nmlsconsumeraccess.org before the stealth gate lifts.
 */
import { ANCHOR_LO, STATE_LIST_LONG } from "@/lib/licensing";

export default function Footer() {
  // Group state licenses by sponsoring entity so we render one
  // disclosure sentence per sponsor with the states it covers.
  const sponsorGroups = Array.from(
    ANCHOR_LO.states
      .reduce((acc, s) => {
        const key = `${s.sponsor.name}|${s.sponsor.idNumber}`;
        if (!acc.has(key)) {
          acc.set(key, { sponsor: s.sponsor, states: [] as string[] });
        }
        acc.get(key)!.states.push(s.state);
        return acc;
      }, new Map<string, { sponsor: typeof ANCHOR_LO.states[number]["sponsor"]; states: string[] }>())
      .values()
  );

  return (
    <footer
      className="px-6 py-10 border-t mt-auto"
      style={{ borderColor: "var(--rule)" }}
    >
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6 mb-8">
          <div className="flex items-center gap-3">
            <span className="orb" style={{ width: 18, height: 18 }} />
            <span className="font-display font-medium tracking-tight">
              Rate<span style={{ color: "var(--color-m8-green)" }}>M8</span>
              <span
                className="ml-3 font-mono text-[10px] tracking-[0.2em] uppercase"
                style={{ color: "var(--muted)" }}
              >
                Loan Intelligence
              </span>
            </span>
          </div>
          <div
            className="flex items-center gap-4 text-xs"
            style={{ color: "var(--muted)" }}
          >
            <span aria-label="Equal Housing Lender" title="Equal Housing Lender">
              ⌂
            </span>
            <span>Equal Housing Lender</span>
          </div>
        </div>

        <div
          className="text-xs leading-relaxed font-light max-w-4xl"
          style={{ color: "var(--muted)" }}
        >
          <p className="mb-3">
            {ANCHOR_LO.operatingEntity.tradeName} is the trade name of{" "}
            {ANCHOR_LO.operatingEntity.legalName}. {ANCHOR_LO.name}, NMLS #
            {ANCHOR_LO.nmls}. Licensed in {STATE_LIST_LONG}.
          </p>
          <p className="mb-3">
            {sponsorGroups.map((g, i) => (
              <span key={`${g.sponsor.name}-${g.sponsor.idNumber}`}>
                Sponsored by {g.sponsor.name} ({g.sponsor.idLabel} #
                {g.sponsor.idNumber}) in {g.states.join(", ")}.
                {i < sponsorGroups.length - 1 ? " " : ""}
              </span>
            ))}{" "}
            Equal Housing Lender.
          </p>
          <p>
            This site does not constitute an offer to lend. All loans subject to
            credit approval. Rates and programs subject to change without
            notice. Property must qualify under applicable program guidelines.
          </p>
        </div>

        <p
          className="mt-8 font-mono text-[10px] tracking-[0.12em] uppercase"
          style={{ color: "var(--muted)" }}
        >
          © {new Date().getFullYear()} {ANCHOR_LO.operatingEntity.legalName}.
          All rights reserved.
        </p>
      </div>
    </footer>
  );
}
