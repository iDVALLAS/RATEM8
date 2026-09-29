import JsonLd from "@/components/JsonLd";
import { faqJsonLd } from "@/lib/jsonld";
import { copy } from "@/lib/copy";
import type { FaqItem } from "@/lib/content/calculators";

/**
 * Faq — a `.faq` details list plus the matching FAQPage JSON-LD.
 * Everything in the JSON-LD is visible on the page, word for word.
 */
export default function Faq({ items, id = "calc-faq" }: { items: FaqItem[]; id?: string }) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby={`${id}-h`}>
      <JsonLd data={faqJsonLd(items)} />
      <h2 id={`${id}-h`} className="principle-label" style={{ marginBottom: 12 }}>
        {copy.calculators.faq}
      </h2>
      <div className="faq">
        {items.map((f) => (
          <details key={f.q}>
            <summary>{f.q}</summary>
            <p className="faq__a">{f.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
