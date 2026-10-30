import { FICTIONAL_LABEL } from "@/lib/config";

/**
 * SampleBadge — the mono badge on every frame built around a fictional
 * borrower. L3 text: FICTIONAL_LABEL ("FICTIONAL BORROWER · HOW M8 WORKS").
 */
export default function SampleBadge({ className = "", text = FICTIONAL_LABEL }: { className?: string; text?: string }) {
  return <span className={`sample-badge ${className}`}>{text}</span>;
}
