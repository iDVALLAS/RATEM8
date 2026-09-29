import { SAMPLE_LABEL } from "@/lib/config";

/**
 * SampleBadge — the mono badge every demo frame carries.
 * Text is locked: "SAMPLE — ILLUSTRATIVE ONLY".
 */
export default function SampleBadge({ className = "", text = SAMPLE_LABEL }: { className?: string; text?: string }) {
  return <span className={`sample-badge ${className}`}>{text}</span>;
}
