import Orb from "./Orb";

type WordmarkProps = {
  showSubname?: boolean;
  showMark?: boolean;
  className?: string;
};

export default function Wordmark({
  showSubname = false,
  showMark = true,
  className = "",
}: WordmarkProps) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      {showMark ? <Orb size="mark" /> : null}
      <span className="inline-flex flex-col leading-none">
        <span className="font-display text-xl tracking-tight">
          Rate<span className="text-[var(--color-m8-green)]">M8</span>
        </span>
        {showSubname ? (
          <span className="font-mono text-[10px] tracking-[0.2em] text-[var(--muted)] mt-1">
            LOAN INTELLIGENCE
          </span>
        ) : null}
      </span>
    </span>
  );
}
