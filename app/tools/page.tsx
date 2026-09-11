import Link from "next/link";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";

export const metadata = {
  title: "Mortgage calculators — LoanM8",
  description:
    "12 calculators for shopping a mortgage: monthly payment, refi breakeven, rent vs buy, DTI, points buydown, amortization, bi-weekly payoff, VA funding fee, PMI drop, closing costs, escrow, and payoff acceleration. No sign-up, no data collected.",
  robots: { index: false, follow: false }, // stealth-gated
};

/**
 * /tools — the calculator index.
 *
 * Every calc is a standalone client-side page. Grouped into three
 * columns for scannability: Buying, Refinancing, Program-specific.
 *
 * Cards use the same border/spacing rhythm as PrincipleCard.tsx —
 * mono eyebrow, display title, muted description, arrow on hover.
 *
 * v11 Tier 2. Glossary (/learn/glossary), loan comparison
 * (/learn/loan-types), and market pages (/markets/[city]) ship in
 * later PRs.
 */

type CalcMeta = {
  href: string;
  title: string;
  body: string;
  group: "buying" | "refi" | "program";
};

const CALCS: CalcMeta[] = [
  {
    href: "/tools/monthly-payment",
    title: "Monthly payment",
    body: "Full PITI + HOA — not just principal & interest.",
    group: "buying",
  },
  {
    href: "/tools/dti",
    title: "DTI / affordability",
    body: "What you can actually afford, not the maximum a lender will approve.",
    group: "buying",
  },
  {
    href: "/tools/rent-vs-buy",
    title: "Rent vs. buy",
    body: "7-year total cost comparison. Rough sanity check.",
    group: "buying",
  },
  {
    href: "/tools/closing-costs",
    title: "Closing costs",
    body: "State-aware range estimate. Not a Loan Estimate — a budgeting number.",
    group: "buying",
  },
  {
    href: "/tools/escrow",
    title: "Escrow / impound",
    body: "Monthly escrow + upfront cushion at close.",
    group: "buying",
  },
  {
    href: "/tools/refi-breakeven",
    title: "Refi breakeven",
    body: "Months until a refinance pays for itself. Skip if you'll sell first.",
    group: "refi",
  },
  {
    href: "/tools/points",
    title: "Points buydown",
    body: "Are discount points worth paying? Depends on how long you keep the loan.",
    group: "refi",
  },
  {
    href: "/tools/bi-weekly",
    title: "Bi-weekly payments",
    body: "Pay every 2 weeks → one extra payment/year → years shaved off.",
    group: "refi",
  },
  {
    href: "/tools/payoff-acceleration",
    title: "Payoff acceleration",
    body: "Extra $/mo, lump sum, or target date — pick your angle.",
    group: "refi",
  },
  {
    href: "/tools/amortization",
    title: "Amortization visualizer",
    body: "Where every dollar of your payment actually goes. Chart, not a table.",
    group: "refi",
  },
  {
    href: "/tools/va-funding-fee",
    title: "VA funding fee",
    body: "One-time fee on VA loans. Varies by down payment + use count.",
    group: "program",
  },
  {
    href: "/tools/pmi-drop",
    title: "PMI drop-off",
    body: "When PMI auto-drops (78% LTV) vs. when you can request removal (80%).",
    group: "program",
  },
];

const GROUPS: { key: CalcMeta["group"]; label: string }[] = [
  { key: "buying", label: "Buying" },
  { key: "refi", label: "Refinancing + payoff" },
  { key: "program", label: "Program-specific" },
];

export default function ToolsIndex() {
  return (
    <>
      <Nav />

      <main className="min-h-screen">
        <section className="border-b" style={{ borderColor: "var(--rule)" }}>
          <div className="mx-auto max-w-6xl px-6 py-16">
            <p
              className="font-mono text-[11px] tracking-[0.2em] uppercase mb-4"
              style={{ color: "var(--accent)" }}
            >
              Tools
            </p>
            <h1 className="tagline text-4xl sm:text-6xl leading-tight mb-6">
              Calculators that don&rsquo;t lie to you.
            </h1>
            <p
              className="text-lg leading-relaxed font-light max-w-2xl"
              style={{ color: "var(--muted)" }}
            >
              Every mortgage calculator online leaves something out — usually
              taxes, insurance, or the difference between the rate you&rsquo;re
              quoted and what you&rsquo;ll actually pay. These don&rsquo;t. Run
              the numbers, then talk to M8 if you want a real picture.
            </p>
            <p
              className="mt-6 font-mono text-[10px] tracking-[0.15em] uppercase"
              style={{ color: "var(--muted)" }}
            >
              No sign-up · No data collected · Nothing sent to any lender
            </p>
          </div>
        </section>

        {GROUPS.map((group) => {
          const items = CALCS.filter((c) => c.group === group.key);
          return (
            <section
              key={group.key}
              className="border-b"
              style={{ borderColor: "var(--rule)" }}
            >
              <div className="mx-auto max-w-6xl px-6 py-14">
                <p
                  className="font-mono text-[11px] tracking-[0.2em] uppercase mb-8"
                  style={{ color: "var(--muted)" }}
                >
                  {group.label}
                </p>
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map((c) => (
                    <Link
                      key={c.href}
                      href={c.href}
                      className="group block rounded-2xl border p-7 transition-colors"
                      style={{
                        borderColor: "var(--rule)",
                        background: "var(--bg-elevated, transparent)",
                      }}
                    >
                      <h3
                        className="font-display text-2xl leading-snug mb-3 transition-colors group-hover:text-[var(--accent)]"
                        style={{ color: "var(--fg)" }}
                      >
                        {c.title}
                      </h3>
                      <p
                        className="text-sm leading-relaxed font-light"
                        style={{ color: "var(--muted)" }}
                      >
                        {c.body}
                      </p>
                      <span
                        className="mt-6 inline-flex items-center gap-2 font-mono text-[10px] tracking-widest uppercase transition-colors group-hover:text-[var(--accent)]"
                        style={{ color: "var(--muted)" }}
                      >
                        Open <span>→</span>
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            </section>
          );
        })}
      </main>

      <Footer />
    </>
  );
}
