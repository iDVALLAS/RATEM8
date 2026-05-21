import Footer from "@/components/Footer";
import Link from "next/link";

export const metadata = {
  title: "For Agents — RateM8",
  description:
    "Built for agents who want to build their business at the speed of AI. Real loan officer. Real AI co-pilot. Real partnership.",
  // Per stealth-launch: this page is invisible from the homepage but
  // reachable if someone has the direct URL. Still don't index it.
  robots: { index: false, follow: false },
};

/**
 * /agents — the partnership pitch page.
 *
 * Per v9 spec (Variant C, subscription-based):
 *  - Agents pay RateM8 for platform access, brand tools, AI co-pilot
 *    for their buyers
 *  - Money flows: Agent → RateM8 (clearly legal under RESPA)
 *  - Borrowers may or may not become RateM8 customers — that's their
 *    choice, not a guaranteed deliverable to the agent
 *
 * Headline: "Built for Agents who want to build their business at
 * the speed of AI" (your pick)
 *
 * Centerpiece feature: Property-Specific Live Pre-Approval — the
 * "coming soon" hero feature that's the actual differentiator. Per
 * research, this is the unmet need at the intersection of AI +
 * licensed LO + live wholesale pricing, and nobody has shipped it.
 *
 * IMPORTANT compliance language:
 *  - Never says "we pay you for referrals"
 *  - Never says "qualified leads" as the deliverable
 *  - Frames the offering as platform + brand + tools
 *  - Mentions outcomes (your buyers convert better) without
 *    promising those outcomes as guaranteed deliverables
 *  - Forward-looking statement on pre-approval feature is marked
 *    as "coming soon" so we don't write checks the product can't cash
 *
 * This page is currently behind the stealth gate (middleware redirects
 * /agents to /). When stealth comes down, this page becomes the front
 * door for agent partnerships.
 */
export default function AgentsPage() {
  return (
    <>
      <main className="grain min-h-screen">
        {/* ─── Header ─── */}
        <header className="px-6 py-6 border-b" style={{ borderColor: "var(--rule)" }}>
          <div className="mx-auto max-w-7xl flex items-center justify-between">
            <Link href="/" className="flex items-center gap-3">
              <span className="orb" style={{ width: 20, height: 20 }} />
              <span className="font-display font-medium tracking-tight text-lg">
                Rate<span style={{ color: "var(--color-m8-green)" }}>M8</span>
              </span>
            </Link>
            <Link
              href="/demo"
              className="font-mono text-[10px] tracking-[0.18em] uppercase"
              style={{ color: "var(--color-m8-green)" }}
            >
              See the demo →
            </Link>
          </div>
        </header>

        {/* ─── Hero ─── */}
        <section className="px-6 py-24 sm:py-32">
          <div className="mx-auto max-w-4xl text-center">
            <p
              className="font-mono text-[11px] tracking-[0.2em] uppercase mb-6"
              style={{ color: "var(--color-m8-green)" }}
            >
              For Real Estate Agents
            </p>
            <h1 className="tagline text-4xl sm:text-6xl leading-tight mb-10">
              Built for agents who want to grow their business at the speed of AI.
            </h1>
            <p
              className="text-xl leading-relaxed max-w-2xl mx-auto font-light"
              style={{ color: "var(--muted)" }}
            >
              RateM8 is a partnership platform for top agents. Your buyers get
              a real licensed loan officer + an AI co-pilot that never sleeps.
              You get the tools, the brand, and a pipeline that closes faster.
            </p>

            <div className="mt-14">
              <Link
                href="mailto:jason@ratem8.com?subject=Partner inquiry"
                className="inline-flex items-center gap-2 px-7 py-4 rounded-xl font-medium text-base transition-all"
                style={{
                  background: "var(--color-m8-green)",
                  color: "var(--color-m8-forest)",
                }}
              >
                Become a launch partner
                <span>→</span>
              </Link>
              <p
                className="mt-4 font-mono text-[10px] tracking-[0.15em] uppercase"
                style={{ color: "var(--muted)" }}
              >
                15 minutes with Jason · No pitch deck · No pressure
              </p>
            </div>
          </div>
        </section>

        {/* ─── The centerpiece feature: Property-Specific Pre-Approval ─── */}
        <section
          className="px-6 py-24 border-y"
          style={{
            borderColor: "var(--rule)",
            background: "color-mix(in srgb, var(--color-m8-forest) 8%, transparent)",
          }}
        >
          <div className="mx-auto max-w-5xl">
            <div className="text-center mb-16">
              <p
                className="font-mono text-[11px] tracking-[0.2em] uppercase mb-6"
                style={{ color: "var(--color-m8-green)" }}
              >
                Coming First Half 2026
              </p>
              <h2 className="font-display font-bold text-3xl sm:text-5xl tracking-tight leading-tight mb-8">
                Property-specific pre-approval. In 30 seconds.
              </h2>
              <p
                className="text-lg leading-relaxed max-w-3xl mx-auto font-light"
                style={{ color: "var(--muted)" }}
              >
                Your buyer walks into a showing already pre-approved for{" "}
                <span className="font-serif italic" style={{ color: "var(--fg)" }}>
                  that specific house
                </span>{" "}
                at <span className="font-serif italic" style={{ color: "var(--fg)" }}>that specific price</span>{" "}
                with <span className="font-serif italic" style={{ color: "var(--fg)" }}>that specific rate</span>{" "}
                — not a generic letter for &ldquo;up to&rdquo; some amount that
                tips off the seller. M8 holds the buyer&apos;s full affordability
                envelope. You drop in a listing. The letter generates instantly,
                signed by Jason, calibrated to the listing&apos;s taxes, insurance,
                HOA, and today&apos;s wholesale rate.
              </p>
            </div>

            {/* The split: old way vs RateM8 way */}
            <div className="grid sm:grid-cols-2 gap-6 mt-12">
              <div
                className="p-6 rounded-2xl border"
                style={{
                  borderColor: "var(--rule)",
                  background: "color-mix(in srgb, var(--color-m8-paper) 3%, transparent)",
                }}
              >
                <p
                  className="font-mono text-[10px] tracking-[0.18em] uppercase mb-4"
                  style={{ color: "var(--muted)" }}
                >
                  Today, without M8
                </p>
                <ul className="space-y-3 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
                  <li>Buyer has a generic pre-approval &ldquo;up to $750K&rdquo;</li>
                  <li>Wants to offer $625K on a specific listing</li>
                  <li>You text the LO asking for an updated letter</li>
                  <li>LO replies tomorrow, maybe</li>
                  <li>Listing agent already saw 4 other offers</li>
                  <li>Deal dies. You start over.</li>
                </ul>
              </div>
              <div
                className="p-6 rounded-2xl border-2"
                style={{
                  borderColor: "var(--color-m8-green)",
                  background: "color-mix(in srgb, var(--color-m8-green) 5%, transparent)",
                }}
              >
                <p
                  className="font-mono text-[10px] tracking-[0.18em] uppercase mb-4"
                  style={{ color: "var(--color-m8-green)" }}
                >
                  With M8
                </p>
                <ul className="space-y-3 text-sm leading-relaxed" style={{ color: "var(--fg)" }}>
                  <li>Buyer chats with M8 once, soft-pull only</li>
                  <li>M8 builds the affordability envelope</li>
                  <li>You share a listing → instant property-specific letter</li>
                  <li>Calibrated to the listing&apos;s taxes, insurance, HOA</li>
                  <li>Signed by Jason. Dated this minute.</li>
                  <li>You walk into the offer with the strongest letter on the table.</li>
                </ul>
              </div>
            </div>

            <p
              className="mt-12 text-center font-mono text-[10px] tracking-[0.15em] uppercase max-w-2xl mx-auto leading-relaxed"
              style={{ color: "var(--muted)" }}
            >
              Property-specific pre-approval is in active development. Launch
              partners get early access and pricing locked for the first 12
              months when the feature ships.
            </p>
          </div>
        </section>

        {/* ─── What you get today ─── */}
        <section className="px-6 py-24">
          <div className="mx-auto max-w-5xl">
            <div className="text-center mb-16">
              <p
                className="font-mono text-[11px] tracking-[0.2em] uppercase mb-6"
                style={{ color: "var(--color-m8-green)" }}
              >
                Available now
              </p>
              <h2 className="font-display font-bold text-3xl sm:text-5xl tracking-tight leading-tight">
                What launch partners get on day one.
              </h2>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              <PartnerCard
                title="Your own M8 co-branded subdomain"
                body="agentname.ratem8.com. Your name, photo, brokerage logo on every page. The exact M8 experience your buyers love — with your brand on top."
              />
              <PartnerCard
                title="An LO who actually picks up"
                body="Jason closes every loan on the platform personally. Your buyers get a single point of contact, start to close. No bouncing between processors."
              />
              <PartnerCard
                title="Pipeline visibility"
                body="See where every connected buyer is in the loan process — pre-approval, underwriting, clear-to-close — in real time. Stop chasing status."
              />
              <PartnerCard
                title="Co-branded marketing assets"
                body="Pre-built flyers, listing-presentation inserts, post-close gift kits, social posts. RateM8 + your branding. Use them, modify them, or ignore them."
              />
              <PartnerCard
                title="Anti-steering by design"
                body="M8 shops 14+ wholesale lenders on every file. Your buyers see the lowest-cost, lowest-rate-no-risky-features, and lowest-fees options. Always. By rule."
              />
              <PartnerCard
                title="Honest rate intelligence"
                body="M8 explains the math. No 'lock in today!' urgency. No bait pricing. Your buyers feel like they understood the decision they made — and they remember who introduced them to it."
              />
            </div>
          </div>
        </section>

        {/* ─── The model (compliance-safe language) ─── */}
        <section
          className="px-6 py-20 border-t"
          style={{ borderColor: "var(--rule)" }}
        >
          <div className="mx-auto max-w-3xl text-center">
            <p
              className="font-mono text-[11px] tracking-[0.2em] uppercase mb-6"
              style={{ color: "var(--color-m8-green)" }}
            >
              How the partnership works
            </p>
            <h2 className="font-display font-bold text-3xl sm:text-4xl tracking-tight leading-tight mb-8">
              You pay for the platform. Your buyers choose their own loan.
            </h2>
            <p
              className="text-lg leading-relaxed font-light mb-6"
              style={{ color: "var(--muted)" }}
            >
              RateM8 is a subscription platform for real estate agents.
              Your monthly fee covers your co-branded subdomain, your
              marketing assets, your pipeline dashboard, and access to
              M8 for your buyers. That&apos;s what you pay for.
            </p>
            <p
              className="text-lg leading-relaxed font-light"
              style={{ color: "var(--muted)" }}
            >
              When your buyers use the platform, some of them will choose
              to close their loan with Jason. Some won&apos;t. That&apos;s
              their choice — and that&apos;s what keeps the partnership
              transparent for everyone.
            </p>

            <div className="mt-12">
              <Link
                href="mailto:jason@ratem8.com?subject=Partner inquiry"
                className="inline-flex items-center gap-2 px-7 py-4 rounded-xl font-medium text-base"
                style={{
                  background: "var(--color-m8-green)",
                  color: "var(--color-m8-forest)",
                }}
              >
                Talk to Jason about partnership
                <span>→</span>
              </Link>
              <p
                className="mt-4 font-mono text-[10px] tracking-[0.15em] uppercase"
                style={{ color: "var(--muted)" }}
              >
                Pricing tailored to your business · Launch partner rates available
              </p>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

function PartnerCard({ title, body }: { title: string; body: string }) {
  return (
    <div
      className="p-6 rounded-2xl border"
      style={{ borderColor: "var(--rule)" }}
    >
      <h3 className="font-display font-semibold text-lg leading-snug mb-3">
        {title}
      </h3>
      <p
        className="text-sm leading-relaxed font-light"
        style={{ color: "var(--muted)" }}
      >
        {body}
      </p>
    </div>
  );
}
