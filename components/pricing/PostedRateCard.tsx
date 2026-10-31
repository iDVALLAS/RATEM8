import { CONFIG } from "@/lib/config";
import { postedRateCopy as c } from "@/lib/content/posted-rate";
import { dayLabel, pacificLabel, POSTED_PRODUCTS, type PostedWeek } from "@/lib/pricing/posted-rate";
import "./pricing.css";

/**
 * PostedRateCard — one of the two posted rates (v37, L4). Server
 * component; the assumptions are a native <details>. The APR sits beside
 * the rate at the same size (Reg Z §1026.24(c)). Shown only while the
 * week is inside its honor window and POSTED_RATES is on.
 */
const fill = (t: string, v: Record<string, string>) => t.replace(/\{(\w+)\}/g, (m, k) => v[k] ?? m);
const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

export default function PostedRateCard({ week, product }: { week: PostedWeek; product: PostedWeek["lines"][number]["product"] }) {
  const line = week.lines.find((l) => l.product === product);
  if (!line) return null;
  const p = CONFIG.pricing.postedProfile;
  const label = POSTED_PRODUCTS.find((x) => x.product === product)!.label;
  const until = pacificLabel(week.honorUntil, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  return (
    <article className="px-posted" aria-label={`${fill(c.eyebrow, { product: label })}: ${line.rate.toFixed(3)}% rate, ${line.apr.toFixed(3)}% APR`}>
      <p className="px-posted__kicker">{fill(c.eyebrow, { product: label })}</p>
      <div className="px-posted__nums">
        <p><strong>{line.rate.toFixed(3)}%</strong><span>{c.rate}</span></p>
        <p><strong>{line.apr.toFixed(3)}%</strong><span>{c.apr}</span></p>
        <p><strong>0</strong><span>{c.points}</span></p>
      </div>
      <p className="px-posted__note">
        {fill(c.profile, { down: String(p.minDownPct), credit: String(p.creditFloor) })}{" "}
        {fill(c.claim, { margin: CONFIG.pricing.postedMargin.toFixed(2), pmms: line.pmms.toFixed(2), released: dayLabel(week.weekOf), until })}{" "}
        {c.subject}
      </p>
      <details className="px-posted__more">
        <summary>{c.assumptions}</summary>
        <ul className="px-assumptions">
          {c.lines.map((t) => (
            <li key={t}>
              {fill(t, {
                price: usd(p.examplePrice),
                down: usd(p.examplePrice - week.loanAmount),
                downPct: String(p.minDownPct),
                loan: usd(week.loanAmount),
                fees: usd(week.financeCharges),
                closingPct: String(CONFIG.pricing.closingCostPct),
                confirmed: pacificLabel(week.confirmedAt),
              })}
            </li>
          ))}
          <li>
            <a href={c.sourceUrl} target="_blank" rel="noreferrer">{c.source}</a>
          </li>
        </ul>
      </details>
    </article>
  );
}
