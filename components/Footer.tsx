import Link from "next/link";
import Wordmark from "./Wordmark";
import { copy } from "@/lib/copy";

export default function Footer() {
  return (
    <footer className="border-t border-[var(--rule)] mt-32">
      <div className="mx-auto max-w-6xl px-6 py-14 grid gap-10 md:grid-cols-3">
        <div>
          <Wordmark showSubname />
          <p className="mt-6 text-sm text-[var(--muted)] max-w-xs leading-relaxed">
            {copy.footer.blurb}
          </p>
        </div>

        <div className="text-sm space-y-3">
          <div className="principle-label">Site</div>
          <ul className="space-y-2">
            <li>
              <Link href="/" className="hover:text-[var(--color-m8-green)]">
                Home
              </Link>
            </li>
            <li>
              <Link
                href="/agents"
                className="hover:text-[var(--color-m8-green)]"
              >
                For agents
              </Link>
            </li>
            <li>
              <Link
                href="/privacy"
                className="hover:text-[var(--color-m8-green)]"
              >
                Privacy
              </Link>
            </li>
          </ul>
        </div>

        <div className="text-sm space-y-3">
          <div className="principle-label">Compliance</div>
          <ul className="space-y-2 text-[var(--muted)]">
            <li>NMLS #[XXXXXX]</li>
            <li>Equal Housing Lender</li>
            <li>Licensed in Washington and Arizona</li>
          </ul>
        </div>
      </div>

      <div className="border-t border-[var(--rule)]">
        <div className="mx-auto max-w-6xl px-6 py-6 text-xs text-[var(--muted)] leading-relaxed">
          {copy.footer.disclaimer}
        </div>
      </div>
    </footer>
  );
}
