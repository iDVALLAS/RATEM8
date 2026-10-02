import { CONFIG } from "@/lib/config";

/**
 * Provenance — named author, "Last updated" date, and a "How this was
 * made" line. Rendered on every content page so humans and agents can
 * see where the words came from.
 */
type ProvenanceProps = {
  updated: string;
  author?: string;
  reviewedBy?: string;
  className?: string;
};

export default function Provenance({ updated, author, reviewedBy, className = "" }: ProvenanceProps) {
  return (
    <aside className={`provenance ${className}`} aria-label="Page provenance">
      <dl>
        <div>
          <dt>Author</dt>
          <dd>{author ?? CONFIG.provenance.author}</dd>
        </div>
        <div>
          <dt>Last updated</dt>
          <dd>
            <time dateTime={updated}>{updated}</time>
          </dd>
        </div>
        <div>
          <dt>How this was made</dt>
          <dd>AI-assisted draft, reviewed by {reviewedBy ?? CONFIG.provenance.reviewedBy} before publishing.</dd>
        </div>
      </dl>
    </aside>
  );
}
