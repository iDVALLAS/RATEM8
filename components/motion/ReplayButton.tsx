"use client";

/**
 * ReplayButton — the small mono "replay" control every scene carries.
 * Works under reduced motion too: the user explicitly asked to see it.
 */
type ReplayButtonProps = {
  onClick: () => void;
  label?: string;
  className?: string;
};

export default function ReplayButton({ onClick, label = "replay", className = "" }: ReplayButtonProps) {
  return (
    <button type="button" onClick={onClick} className={`replay-btn ${className}`} aria-label={`Replay animation: ${label}`}>
      <svg aria-hidden="true" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 12a9 9 0 1 0 3-6.7" />
        <path d="M3 4v5h5" />
      </svg>
      {label}
    </button>
  );
}
