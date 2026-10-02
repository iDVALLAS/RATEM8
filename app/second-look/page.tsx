import type { Metadata } from "next";
import PageShell from "@/components/PageShell";
import Reveal from "@/components/motion/Reveal";
import Provenance from "@/components/Provenance";
import SecondLookDemo from "@/components/second-look/SecondLookDemo";
import LiveUpload from "@/components/second-look/LiveUpload";
import { copy } from "@/lib/copy";
import { CONFIG } from "@/lib/config";

/**
 * /second-look — "Got an offer? Drop it. M8 reads it."
 *
 * Layer 1: a five-scene, scroll-triggered demo over a FICTIONAL Loan
 * Estimate (ships live; no upload, no data risk).
 * Layer 2: the real upload flow, feature-flagged by
 * CONFIG.featureFlags.secondLookLiveUpload (off by default).
 *
 * Compliance: Second Look never compares pricing and never implies
 * LoanM8 can beat the offer. It explains the borrower's own document.
 */

export const metadata: Metadata = {
  title: "Second Look — LoanM8",
  description: copy.secondLook.sub,
};

export default function SecondLookPage() {
  const sl = copy.secondLook;
  return (
    <PageShell
      crumbs={[
        { name: "Home", path: "/" },
        { name: "Second Look", path: "/second-look" },
      ]}
    >
      <section className="mx-auto max-w-6xl px-4 sm:px-6 pt-10 pb-12 sm:pt-16 sm:pb-16">
        <p className="eyebrow">{sl.eyebrow}</p>
        <Reveal
          as="h1"
          text={sl.heading}
          accent={sl.accent}
          underline
          immediate
          className="tagline mt-4 text-4xl sm:text-6xl leading-[1.05] max-w-4xl"
        />
        <p className="mt-6 max-w-2xl text-lg leading-relaxed font-light" style={{ color: "var(--fg-soft)" }}>
          {sl.sub}
        </p>
        <p className="mono-label mt-6">{sl.sampleNote}</p>
      </section>

      <SecondLookDemo />

      <section className="mx-auto max-w-6xl px-4 sm:px-6 pb-16">
        <LiveUpload live={CONFIG.featureFlags.secondLookLiveUpload} />
        <Provenance updated="2026-09-29" />
      </section>
    </PageShell>
  );
}
