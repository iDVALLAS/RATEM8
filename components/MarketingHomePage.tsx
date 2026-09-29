import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import Hero from "@/components/home/Hero";
import StatesStrip from "@/components/home/StatesStrip";
import Principles from "@/components/home/Principles";
import HowItWorks from "@/components/home/HowItWorks";
import SecondLookTeaser from "@/components/home/SecondLookTeaser";
import AgentsBand from "@/components/home/AgentsBand";
import MloBand from "@/components/home/MloBand";
import About from "@/components/home/About";
import "@/components/home/home.css";

/**
 * MarketingHomePage — the LoanM8 homepage (site brief, Section 8).
 *
 * Nav → Hero (orb, headline, four-button grid, trust strip) →
 * states strip → the eight principles → how it works → Second Look
 * teaser → for agents → for MLOs → about → Footer.
 *
 * Uses Nav and Footer directly (not PageShell) because the hero is
 * custom. Server component; only the hero orb and the Scenes ship JS.
 */
export default function MarketingHomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Nav />
      <main id="main" className="flex-1">
        <Hero />
        <StatesStrip />
        <Principles />
        <HowItWorks />
        <SecondLookTeaser />
        <AgentsBand />
        <MloBand />
        <About />
      </main>
      <Footer />
    </div>
  );
}
