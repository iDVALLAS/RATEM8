import Image from "next/image";
import Orb from "@/components/Orb";
import { mloContent } from "@/lib/content/mlo";

/**
 * MloCommandLockup — the MLO Command logo over the brand orb, with
 * "powered by LoanM8" tucked under the logo's right end (owner mockup B,
 * 2026-11-20). Heads the loan officer admin pages (/mlo/*).
 *
 * The logo file (public/brand/mlo-command.webp) is the owner's artwork with
 * its greens shifted onto the site palette (hue 160–168, like M8 Green,
 * Deep Green and Forest); shapes are untouched. The orb is the shared
 * <Orb>, so it breathes like every other orb and stops under reduced motion.
 * "M8" in the wordmark is M8 Green, as everywhere.
 */
export default function MloCommandLockup() {
  const c = mloContent.lockup;
  return (
    <div className="mlo-lockup">
      <div className="mlo-lockup__stage">
        <span className="mlo-lockup__orb" aria-hidden="true">
          <Orb style={{ width: "100%", height: "100%" }} />
        </span>
        <Image
          className="mlo-lockup__logo"
          src="/brand/mlo-command.webp"
          alt={c.alt}
          width={1200}
          height={432}
          priority
          sizes="(min-width: 700px) 620px, calc(100vw - 32px)"
        />
        <p className="mlo-lockup__powered">
          {c.poweredBy}{" "}
          <b>
            Loan<span>M8</span>
          </b>
        </p>
      </div>
    </div>
  );
}
