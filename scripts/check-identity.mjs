#!/usr/bin/env node
/**
 * scripts/check-identity.mjs — fails the build when a loan officer's name,
 * an NMLS number, or an NMLS-labelled digit run is typed anywhere in the
 * shipped code outside lib/config.ts (the one place facts live).
 *
 * Scans app/, components/, lib/, public/, middleware.ts. Docs are exempt.
 * Run: npm run check:identity
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const SCAN_DIRS = ["app", "components", "lib", "public"];
const SCAN_FILES = ["middleware.ts"];
const ALLOW = new Set(["lib/config.ts"]);
const EXT = new Set([".ts", ".tsx", ".js", ".mjs", ".md", ".txt", ".json"]);

const RULES = [
  { name: "MLO name", re: /jason\s+shapiro/i },
  { name: "MLO name", re: /ryder\s+fasse/i },
  // v14: first names alone too (a "Talk to Jason" slipped through before).
  // Copy names an MLO only through MloContext templates ({first}/{name}).
  { name: "MLO first name", re: /\b(?:jason|ryder)\b/i },
  { name: "NMLS number", re: /\b1844143\b/ },
  { name: "NMLS number", re: /\b119822\b/ },
  { name: "NMLS-labelled number", re: /NMLS\s*(?:ID|No\.?|number)?\s*[:#]?\s*#?\s*\d{4,8}\b/i },
];

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (EXT.has(p.slice(p.lastIndexOf(".")))) out.push(p);
  }
}

const files = [];
for (const d of SCAN_DIRS) {
  try { walk(join(ROOT, d), files); } catch { /* missing dir */ }
}
for (const f of SCAN_FILES) files.push(join(ROOT, f));

const hits = [];
for (const f of files) {
  const rel = relative(ROOT, f);
  if (ALLOW.has(rel)) continue;
  const lines = readFileSync(f, "utf8").split("\n");
  lines.forEach((line, i) => {
    for (const r of RULES) if (r.re.test(line)) hits.push(`${rel}:${i + 1}  ${r.name}: ${line.trim().slice(0, 120)}`);
  });
}

if (hits.length) {
  console.error(`check:identity failed — ${hits.length} hardcoded identity fact(s) outside lib/config.ts:\n` + hits.join("\n"));
  process.exit(1);
}
console.log(`check:identity passed — ${files.length} files scanned, no hardcoded MLO names or NMLS numbers outside lib/config.ts.`);
