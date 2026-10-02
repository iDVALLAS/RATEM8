/**
 * lib/content/mlo.ts — strings for the /mlo admin (internal, auth-gated).
 * Consumer-facing strings stay in lib/copy.ts.
 */
export const mloContent = {
  title: "MLO admin",
  nav: { setup: "Setup", pricing: "Pricing snapshots", rates: "View /rates" },
  tenantLabel: "Sponsoring brokerage",
  setup: {
    heading: "Setup",
    identity: "1 · Identity",
    identityNote: "Identity comes from lib/config.ts. Admin verification is not self-asserted and is not available until accounts exist.",
    notVerified: "Not verified by an administrator yet",
    source: "2 · Pricing source",
    sourceBody: "Manual entry. A licensed person pulls pricing in the sponsoring brokerage's pricing engine (ARIVE) and enters it on the Pricing snapshots page. No engine credentials are asked for or stored.",
    lenders: "3 · Go-to lenders (up to 10)",
    lendersNote: "Keep at least three lenders that can be shown to consumers so the three-option comparison is possible.",
    restricted: "Terms restrict consumer display; needs written consent",
    playbook: "4 · Lender playbook",
    playbookNote: "Your notes appear after the three options as \"Your loan officer's notes\", with the lender shown by letter. They never change ranking or which lenders appear. Notes about borrowers, places, or protected characteristics are rejected.",
    save: "Save lenders and playbook",
    test: "5 · Test price",
    testNote: "This is what borrowers see for the brokerage's first scenario, including where your notes appear.",
    attest: "6 · Review and attest",
    attestBlocked: "Blocked: signing needs the v21 attestation spec and real accounts, which do not exist in this repo yet.",
  },
  pricing: {
    heading: "Pricing snapshots",
    intro: "Enter today's results for one scenario exactly as they appear in the pricing engine, attach the screenshot or PDF they came from, and publish. APR, payments and the three options are computed for you.",
    flagOff: "PRICING_MANUAL is off, so published snapshots are stored but /rates keeps showing example pricing.",
    flagOn: "PRICING_MANUAL is on. A fresh snapshot replaces the example on /rates for this scenario.",
    stale: "Snapshots older than {h} hours are never shown.",
    scenario: "Scenario",
    source: "Source screenshot or PDF (required, kept private)",
    publish: "Publish snapshot",
    recent: "Recent snapshots",
    none: "No snapshots yet for this scenario.",
    columns: ["Pulled", "Shown?", "Inputs hash", "Source", "By"],
  },
} as const;
