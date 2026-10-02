import Link from "next/link";
import BookingCTA from "@/components/BookingCTA";
import TrustLine from "@/components/TrustLine";
import ApplyCta from "@/components/mlo/ApplyCta";
import { copy } from "@/lib/copy";

/**
 * NextStepActions — the "// next step" card's actions (v18, Item 2c):
 *   1. Talk to a licensed loan officer (primary, booking)
 *   2. Start your application (outlined; the matched MLO's own link, or
 *      the state picker first when nobody is matched)
 *   3. "Or prep it with M8 first →"
 * then the site-wide trust line.
 */
export default function NextStepActions({ label }: { label: React.ReactNode }) {
  return (
    <div className="next-step__actions">
      <BookingCTA kind="borrower" intake={false}>
        {label}
      </BookingCTA>
      <ApplyCta variant="outline" />
      <Link href={copy.apply.prepHref} className="next-step__prep">
        {copy.apply.prepLink}
      </Link>
      <TrustLine className="font-mono text-[10px] tracking-[0.14em] uppercase" style={{ color: "var(--muted)" }} />
    </div>
  );
}
