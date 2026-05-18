import Link from "next/link";
import Wordmark from "./Wordmark";

export default function Nav() {
  return (
    <header className="sticky top-0 z-40 backdrop-blur-md bg-[color-mix(in_srgb,var(--bg)_75%,transparent)] border-b border-[var(--rule)]">
      <nav className="mx-auto max-w-6xl px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center" aria-label="RateM8 home">
          <Wordmark />
        </Link>
        <div className="flex items-center gap-7 text-sm">
          <Link
            href="/agents"
            className="text-[var(--muted)] hover:text-[var(--fg)] transition-colors"
          >
            For Agents
          </Link>
          <Link
            href="#about"
            className="text-[var(--muted)] hover:text-[var(--fg)] transition-colors hidden sm:inline"
          >
            About
          </Link>
          <Link
            href="#principles"
            className="text-[var(--muted)] hover:text-[var(--fg)] transition-colors hidden md:inline"
          >
            Principles
          </Link>
        </div>
      </nav>
    </header>
  );
}
