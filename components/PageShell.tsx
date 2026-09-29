import Nav from "./Nav";
import Footer from "./Footer";
import JsonLd from "./JsonLd";
import { breadcrumbJsonLd } from "@/lib/jsonld";

/**
 * PageShell — Nav + main + Footer with an optional breadcrumb list.
 * Every non-homepage route uses this so landmarks and the compliance
 * footer are identical everywhere.
 */
type PageShellProps = {
  children: React.ReactNode;
  crumbs?: { name: string; path: string }[];
  className?: string;
  mainClassName?: string;
};

export default function PageShell({ children, crumbs, className = "", mainClassName = "" }: PageShellProps) {
  return (
    <div className={`flex min-h-screen flex-col ${className}`}>
      {crumbs && crumbs.length > 1 ? <JsonLd data={breadcrumbJsonLd(crumbs)} /> : null}
      <Nav />
      <main id="main" className={`flex-1 ${mainClassName}`}>
        {crumbs && crumbs.length > 1 ? (
          <nav aria-label="Breadcrumb" className="mx-auto max-w-6xl px-4 sm:px-6 pt-6">
            <ol className="flex flex-wrap items-center gap-2 font-mono text-[11px] tracking-[0.14em] uppercase" style={{ color: "var(--muted)" }}>
              {crumbs.map((c, i) => (
                <li key={c.path} className="flex items-center gap-2">
                  {i > 0 ? <span aria-hidden="true">/</span> : null}
                  {i === crumbs.length - 1 ? (
                    <span aria-current="page" style={{ color: "var(--fg-soft)" }}>
                      {c.name}
                    </span>
                  ) : (
                    <a href={c.path} className="hover:text-[var(--accent)]">
                      {c.name}
                    </a>
                  )}
                </li>
              ))}
            </ol>
          </nav>
        ) : null}
        {children}
      </main>
      <Footer />
    </div>
  );
}
