import "./legal.css";

/**
 * LegalSection — one numbered, anchor-addressable section of a legal
 * page. `id` is the anchor the table of contents links to; the h2 is
 * the only heading level the page adds below its single h1.
 */
export type LegalSectionDef = { id: string; title: string };

type LegalSectionProps = LegalSectionDef & {
  index: number;
  children: React.ReactNode;
};

export default function LegalSection({ id, title, index, children }: LegalSectionProps) {
  const headingId = `${id}-heading`;
  return (
    <section id={id} className="legal-section" aria-labelledby={headingId}>
      <p className="legal-section__num" aria-hidden="true">
        {String(index + 1).padStart(2, "0")}
      </p>
      <h2 id={headingId}>{title}</h2>
      {children}
    </section>
  );
}
