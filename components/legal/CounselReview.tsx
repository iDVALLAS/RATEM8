import "./legal.css";

/**
 * CounselReview — a visible marker for a block of legal text that is a
 * DRAFT. Prints "[COUNSEL REVIEW]" in the `.counsel` mono style above
 * the wrapped block so nobody (human or agent) mistakes it for final
 * policy language. The optional `note` says what counsel must decide.
 *
 * Server component. Nothing here is a fact; facts come from config.
 */
export const COUNSEL_TAG = "[COUNSEL REVIEW]";

type CounselReviewProps = {
  note?: string;
  children: React.ReactNode;
  className?: string;
};

export default function CounselReview({ note, children, className = "" }: CounselReviewProps) {
  return (
    <div className={`legal-review ${className}`} data-counsel-review="">
      <p className="counsel legal-review__tag">
        {COUNSEL_TAG}
        {note ? ` — ${note}` : ""}
      </p>
      {children}
    </div>
  );
}
