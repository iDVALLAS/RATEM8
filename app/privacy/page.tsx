import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import { copy } from "@/lib/copy";

export const metadata = {
  title: "Privacy — RateM8",
  description:
    "We don't sell leads. We don't share your data. Full policy ships with platform launch.",
};

export default function PrivacyPage() {
  return (
    <>
      <Nav />
      <main>
        <section>
          <div className="mx-auto max-w-3xl px-6 py-24">
            <div className="principle-label">PRIVACY</div>
            <h1 className="font-display text-4xl sm:text-5xl mt-4 leading-tight">
              {copy.privacy.heading}
            </h1>
            <p className="mt-6 text-[var(--muted)] leading-relaxed">
              {copy.privacy.intro}
            </p>

            <ul className="mt-10 space-y-4">
              {copy.privacy.points.map((p) => (
                <li
                  key={p}
                  className="pl-5 border-l-2 border-[var(--color-m8-green)] text-[var(--fg)] leading-relaxed"
                >
                  {p}
                </li>
              ))}
            </ul>

            <p className="mt-12 text-sm text-[var(--muted)]">
              Last updated: v1 launch. The full policy ships with the M8 chat
              platform.
            </p>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
