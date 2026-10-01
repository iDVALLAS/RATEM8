import { CONFIG, hasBooking, NOT_A_CREDIT_PULL } from "@/lib/config";
import CTAButton from "./CTAButton";
import { MloBookingButton } from "./mlo/MloContext";

/**
 * BookingCTA — every consumer CTA on the site is a Calendly booking.
 * When the link isn't configured yet, the button renders as a plain
 * "coming soon" pill instead of a dead link.
 *
 * `intake` adds the "not a credit pull" line under the button — used at
 * every intake point (rule 7).
 */
type BookingCTAProps = {
  kind: keyof typeof CONFIG.calendly;
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "outline" | "pill";
  sub?: string;
  intake?: boolean;
  ariaLabel?: string;
  className?: string;
};

export default function BookingCTA({ kind, children, variant = "primary", sub, intake = true, ariaLabel, className = "" }: BookingCTAProps) {
  const url = CONFIG.calendly[kind];
  const ok = hasBooking(url);
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {kind === "borrower" && CONFIG.pricing.mloRouting ? (
        // v15: per-visitor booking link (the matched MLO's), resolved client-side from MloContext.
        <MloBookingButton fallbackUrl={url} variant={variant} sub={sub} ariaLabel={ariaLabel}>
          {children}
        </MloBookingButton>
      ) : ok ? (
        <CTAButton href={url} variant={variant} sub={sub} ariaLabel={ariaLabel}>
          {children}
        </CTAButton>
      ) : (
        <CTAButton href="#" variant={variant} sub={sub ?? "Booking link coming soon"} ariaLabel={ariaLabel} disabled>
          {children}
        </CTAButton>
      )}
      {intake ? (
        <p className="font-mono text-[10px] tracking-[0.14em] uppercase" style={{ color: "var(--muted)" }}>
          {NOT_A_CREDIT_PULL} · Free · No spam
        </p>
      ) : null}
    </div>
  );
}
