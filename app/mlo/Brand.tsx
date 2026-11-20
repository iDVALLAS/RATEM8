import Link from "next/link";

/**
 * The MLO Command logo, exactly as the owner supplied it (2026-11-20), with
 * "Powered by LoanM8" drawn in. Shared by the app bar and the sign-in pages.
 * Files: public/brand/mlo-command-logo*.webp (trimmed only; the master is
 * mlo-command-logo.png).
 */
export default function Brand({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="cc-brand" aria-label={label}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="cc-logo"
        src="/brand/mlo-command-logo-320.webp"
        srcSet="/brand/mlo-command-logo-320.webp 320w, /brand/mlo-command-logo-640.webp 640w"
        sizes="(min-width: 521px) 155px, 125px"
        width={1600}
        height={641}
        alt=""
        decoding="async"
      />
    </Link>
  );
}
