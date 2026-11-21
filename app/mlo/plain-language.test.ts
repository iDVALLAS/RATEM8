import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { DESTS, DIRECT, GROUPS, TABS, groupLabelOf } from "./nav";
import * as ccPages from "@/lib/content/cc-pages";
import * as loa from "@/lib/content/loa";
import * as importCheck from "@/lib/content/import-check";
import * as contactsImport from "@/lib/content/contacts-import";
import * as contactTags from "@/lib/content/contact-tags";
import * as commandCenter from "@/lib/content/command-center";
import * as mlo from "@/lib/content/mlo";

/**
 * D76: the plain-language pass. Pages a loan officer uses every day never
 * show hosting or header names; the owner's technical steps are folded and
 * shown to the owner only (TechSteps), and owner-only content keys start
 * with "owner".
 */
const BANNED = /Vercel|X-CC-Key/;
const ROOT = process.cwd();

describe("Command Center navigation (D76)", () => {
  it("gives every destination a group label, used as its page's eyebrow", () => {
    for (const d of DESTS) {
      expect(GROUPS[d.group], d.key).toBeTruthy();
      expect(groupLabelOf(d.key), d.key).toBe(GROUPS[d.group]);
    }
    expect(groupLabelOf("nope")).toBeNull();
  });

  it("has the phone tabs and desktop links from the spec, all real destinations", () => {
    expect([...TABS]).toEqual(["home", "inbox", "concierge", "contacts", "pipeline"]);
    expect(TABS[Math.floor(TABS.length / 2)]).toBe("concierge");
    for (const k of [...TABS, ...DIRECT]) expect(DESTS.some((d) => d.key === k), k).toBe(true);
    expect([...DIRECT]).toEqual(["inbox", "contacts", "pipeline"]);
  });

  it("uses the new names", () => {
    expect(DESTS.find((d) => d.key === "agents")?.label).toBe("AI assistants");
    expect(DESTS.find((d) => d.key === "team")?.label).toBe("People & roles");
  });
});

/** Every string in a content module, skipping owner-only keys (and admin-page subtrees given). */
function strings(v: unknown, path: string, skip: RegExp, out: { path: string; text: string }[] = []) {
  if (typeof v === "string") out.push({ path, text: v });
  else if (typeof v === "function") {
    try {
      const r = (v as (...a: unknown[]) => unknown)(3, 8);
      if (typeof r === "string") out.push({ path: `${path}()`, text: r });
    } catch {
      /* needs other arguments: its literal text is covered by the file scan below */
    }
  } else if (Array.isArray(v)) v.forEach((x, i) => strings(x, `${path}[${i}]`, skip, out));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) if (!skip.test(k)) strings(x, `${path}.${k}`, skip, out);
  return out;
}

describe("plain words in Command Center content (D76)", () => {
  it("has no hosting or header names outside owner-only keys", () => {
    const mods: [string, unknown, RegExp][] = [
      ["cc-pages", ccPages, /^owner/i],
      ["loa", loa, /^owner/i],
      ["import-check", importCheck, /^owner/i],
      ["contacts-import", contactsImport, /^owner/i],
      ["contact-tags", contactTags, /^owner/i],
      ["command-center", commandCenter, /^owner/i],
      // /mlo/setup, /mlo/pricing and its receiver are Platform (admin) pages.
      ["mlo", mlo, /^(owner|setup|receive|pricing)$/i],
    ];
    const bad = mods.flatMap(([name, m, skip]) => strings(m, name, skip)).filter((s) => BANNED.test(s.text));
    expect(bad).toEqual([]);
  });
});

const ADMIN_DIRS = DESTS.filter((d) => d.admin && d.href.startsWith("/mlo/")).map((d) => `app${d.href}/`);
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : /\.tsx$/.test(n) ? [p] : [];
  });
/** The page's own words: comments and owner-only technical folds removed. */
function visibleSource(src: string): string {
  return src
    .replace(/<TechSteps\b[\s\S]*?<\/TechSteps>/g, "")
    .replace(/<NotOnYet\b[^>]*>[\s\S]*?<\/NotOnYet>/g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("plain words on Command Center pages (D76)", () => {
  it("strips owner-only folds and comments before checking", () => {
    expect(visibleSource(`a <TechSteps owner={o}><p>In Vercel</p></TechSteps> b`)).toBe("a  b");
    expect(visibleSource(`<NotOnYet what="videos" icon="video" owner={o}>\n<p>In Vercel</p>\n</NotOnYet>`)).toBe("");
    expect(visibleSource("/* Vercel */ x // X-CC-Key\n// Vercel\ny")).toBe(" x // X-CC-Key\n\ny");
  });

  it("never shows a loan officer a hosting or header name", () => {
    const bad: string[] = [];
    for (const f of walk(join(ROOT, "app", "mlo"))) {
      const rel = relative(ROOT, f).split("\\").join("/");
      if (ADMIN_DIRS.some((d) => rel.startsWith(d))) continue;
      const text = visibleSource(readFileSync(f, "utf8"));
      text.split("\n").forEach((line, i) => {
        if (BANNED.test(line)) bad.push(`${rel}:${i + 1}: ${line.trim().slice(0, 120)}`);
      });
    }
    expect(bad).toEqual([]);
  });

  it("keeps hosting and header names out of the messages a loan officer gets back", () => {
    const files = ["lib/messaging/service.ts", "lib/clientpage/draft.ts", "lib/journey/docs.ts", "lib/ai/meter.ts", "lib/connect/catalog.ts", "lib/videos/service.ts", "app/mlo/concierge/actions.ts"];
    const bad = files.flatMap((f) =>
      visibleSource(readFileSync(join(ROOT, f), "utf8"))
        .split("\n")
        .filter((l) => BANNED.test(l))
        .map((l) => `${f}: ${l.trim().slice(0, 120)}`),
    );
    expect(bad).toEqual([]);
  });
});
