import Link from "next/link";
import PageShell from "@/components/PageShell";
import Orb from "@/components/Orb";
import { copy } from "@/lib/copy";

export default function NotFound() {
  return (
    <PageShell>
      <section className="mx-auto max-w-3xl px-4 sm:px-6 py-24 text-center">
        <div className="flex justify-center mb-10">
          <Orb size="ambient" px={96} />
        </div>
        <p className="code-label">{copy.notFound.eyebrow}</p>
        <h1 className="tagline text-4xl sm:text-6xl mt-4">{copy.notFound.heading}</h1>
        <p className="mt-6 font-light" style={{ color: "var(--muted)" }}>
          {copy.notFound.body}
        </p>
        <Link href="/" className="cta cta--pill mt-10 inline-flex">
          <span className="cta__label">{copy.notFound.cta}</span>
          <span aria-hidden="true">→</span>
        </Link>
      </section>
    </PageShell>
  );
}
