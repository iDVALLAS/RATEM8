import Link from "next/link";

type CTAButtonProps = {
  href: string;
  variant?: "primary" | "secondary";
  children: React.ReactNode;
  ariaLabel?: string;
};

export default function CTAButton({
  href,
  variant = "primary",
  children,
  ariaLabel,
}: CTAButtonProps) {
  const base =
    "group inline-flex items-center justify-between gap-4 px-6 py-5 rounded-xl border transition-all w-full sm:w-72 text-left";
  const styles =
    variant === "primary"
      ? "bg-[var(--color-m8-green)] text-[var(--color-m8-forest)] border-[var(--color-m8-green)] hover:bg-[var(--color-m8-deep)] hover:border-[var(--color-m8-deep)]"
      : "bg-transparent text-[var(--fg)] border-[var(--rule)] hover:border-[var(--color-m8-green)]";

  const isExternal = href.startsWith("http");
  const inner = (
    <>
      <span className="font-medium leading-tight">{children}</span>
      <span
        aria-hidden="true"
        className="text-xl transition-transform group-hover:translate-x-1"
      >
        →
      </span>
    </>
  );

  if (isExternal) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={ariaLabel}
        className={`${base} ${styles}`}
      >
        {inner}
      </a>
    );
  }

  return (
    <Link href={href} aria-label={ariaLabel} className={`${base} ${styles}`}>
      {inner}
    </Link>
  );
}
