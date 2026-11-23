import Link from "next/link";
import { copy } from "@/lib/copy";
import Footer from "@/components/Footer";
import { LAUNCH_STATES_LONG } from "@/lib/states";
import { COMING_SOON_SPONSOR } from "@/lib/config";
import Wordmark from "@/components/Wordmark";
import PilotMenu from "@/components/PilotMenu";

const t = copy.comingSoonHome.tester;

/**
 * ComingSoonHomePage — the public-facing (unauthenticated) homepage.
 *
 * Renders for visitors who don't have a `loanm8_demo_auth` cookie.
 * Quiet, brand-correct, small orb + "M8 is being built." + preview
 * link. Footer compliance disclosure stays (regulated-entity homepage
 * has to carry it even in stealth).
 *
 * app/page.tsx picks between this and MarketingHomePage based on the
 * cookie — this file just owns the coming-soon markup.
 *
 * D90: top right, "TESTER ACCESS" over the LoanM8 logo (the tester password
 * page) and "PILOT" over the MLO Command Center logo (PilotMenu: sign up or
 * sign in). Styles: the "D90 coming-soon entry buttons" block in globals.css.
 */
export default function ComingSoonHomePage() {
  return (
    <>
      <main className="relative grain min-h-screen flex flex-col">
        <header className="px-4 sm:px-6 py-4 sm:py-6">
          <div className="cs-head mx-auto max-w-7xl flex items-center justify-between">
            <span className="flex items-center gap-3">
              <span className="orb" style={{ width: 20, height: 20 }} />
              <span className="font-display font-medium tracking-tight text-lg">
                Loan<span style={{ color: "var(--color-m8-green)" }}>M8</span>
              </span>
            </span>
            {/* D90: two labeled buttons (they replace D60's "Loan officer login" and the old text link). */}
            <div className="cs-entry">
              <Link href={t.href} className="cs-entry__btn" aria-label={t.aria}>
                <span className="cs-entry__label" aria-hidden="true">
                  <span className="cs-entry__label-full">{t.label}</span>
                  <span className="cs-entry__label-short">{t.short}</span>
                </span>
                <span className="cs-entry__pill">
                  <Wordmark className="cs-wordmark" />
                </span>
              </Link>
              <PilotMenu />
            </div>
          </div>
        </header>

        <section className="flex-1 px-6 py-20 flex flex-col items-center justify-center text-center">
          <div className="mb-14">
            <span className="orb" style={{ width: 180, height: 180 }} />
          </div>

          <p
            className="font-mono text-[11px] tracking-[0.2em] uppercase mb-6"
            style={{ color: "var(--color-m8-green)" }}
          >
            Loan Intelligence
          </p>

          <h1
            className="tagline text-5xl sm:text-7xl mb-10"
            style={{ maxWidth: "20ch" }}
          >
            M8 is being built.
          </h1>

          {/* Hotfix: the sponsoring company with the LoanM8 name, full contrast (Texas team-name rule). */}
          <p className="text-lg mb-8" style={{ color: "var(--fg)" }}>
            Loan<span style={{ color: "var(--color-m8-green)" }}>M8</span>{" "}
            <span style={{ color: "var(--fg-soft)" }}>powered by</span>{" "}
            <b style={{ fontWeight: 500 }}>{COMING_SOON_SPONSOR.dba}</b> · NMLS #{COMING_SOON_SPONSOR.nmls}
          </p>

          <p
            className="text-lg leading-relaxed max-w-md mx-auto font-light"
            style={{ color: "var(--muted)" }}
          >
            AI-powered mortgage rate shopping, built by an originator who
            closes every loan personally. Coming soon to {LAUNCH_STATES_LONG}
            {" "}— with more markets to follow.
          </p>

          <div className="mt-12 flex flex-col items-center gap-4">
            {/* C1: the live M8 chat is public; this is the homepage chat entry point. */}
            <Link
              href="/chat"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-medium text-base transition-all"
              style={{
                background: "var(--color-m8-green)",
                color: "var(--color-m8-forest)",
              }}
            >
              {copy.comingSoonHome.chat}
              <span aria-hidden="true" className="cta-arrow">→</span>
            </Link>
            <p
              className="font-mono text-[10px] tracking-[0.15em] uppercase"
              style={{ color: "var(--muted)" }}
            >
              {copy.comingSoonHome.chatNote}
            </p>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
