import Link from "next/link";

/**
 * D48: the Command Center lockup, shared by the app bar and the sign-in
 * pages. The orb, a larger "LoanM8" (M8 always in M8 Green), and a smaller
 * "Command" over "Center" beside it.
 */
export default function Brand({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="cc-brand" aria-label={label}>
      <span className="cc-brand__orb" aria-hidden="true" />
      <span className="cc-brand__word" aria-hidden="true">Loan<span className="cc-m8">M8</span></span>
      <span className="cc-brand__sub" aria-hidden="true"><span>Command</span><span>Center</span></span>
    </Link>
  );
}
