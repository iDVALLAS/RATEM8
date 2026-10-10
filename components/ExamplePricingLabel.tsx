import { EXAMPLE_PRICING_LABEL } from "@/lib/config";

/**
 * ExamplePricingLabel — the persistent label every rate card with
 * illustrative pricing carries (v21; the scripted demo and /sample-brief).
 * Text is locked in config: "Example — illustrative pricing, not an offer".
 * It is part of the card, never dismissible, and stays visible at every width.
 */
export default function ExamplePricingLabel({ className = "" }: { className?: string }) {
  return (
    <span className={`example-label ${className}`.trim()} role="note">
      {EXAMPLE_PRICING_LABEL}
    </span>
  );
}
