#!/usr/bin/env node
/**
 * scripts/check-licensing.mjs — L1. Refuses a production build while
 * lib/config.ts (the licensing source of truth) still carries an
 * unconfirmed marker: TBD, VERIFY, or a run of four X's.
 *
 * Strict (exit 1) when the build is for production:
 *   - VERCEL_ENV=production (a Vercel production deployment), or
 *   - NODE_ENV=production outside Vercel previews and development, or
 *   - LICENSING_STRICT=true.
 * Otherwise (local builds, Vercel previews) it prints the list and passes,
 * so previews keep building while the owner fills the gaps. `next build`
 * sets NODE_ENV=production itself, but that happens after this script runs
 * and on previews too, which is why VERCEL_ENV decides on Vercel.
 *
 * Run: npm run check:licensing (also runs before every `npm run build`).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

export const MARKERS = /\bTBD\b|\bVERIFY\b|XXXX/;

/** Every line of `text` holding an unconfirmed marker, as "line: text". */
export function findGaps(text) {
  const out = [];
  text.split("\n").forEach((line, i) => {
    if (MARKERS.test(line)) out.push(`${i + 1}: ${line.trim().slice(0, 140)}`);
  });
  return out;
}

/** Whether this build must be clean. */
export function isStrict(env) {
  if (env.LICENSING_STRICT === "true") return true;
  if (env.VERCEL_ENV === "production") return true;
  if (env.VERCEL_ENV === "preview" || env.VERCEL_ENV === "development") return false;
  return env.NODE_ENV === "production";
}

function main() {
  const file = fileURLToPath(new URL("../lib/config.ts", import.meta.url));
  const gaps = findGaps(readFileSync(file, "utf8"));
  if (gaps.length === 0) {
    console.log("check:licensing passed — no unconfirmed markers in lib/config.ts.");
    return;
  }
  const list = gaps.map((g) => `  lib/config.ts:${g}`).join("\n");
  if (isStrict(process.env)) {
    console.error(`check:licensing failed — ${gaps.length} unconfirmed value(s) in a production build:\n${list}`);
    process.exit(1);
  }
  console.warn(`check:licensing warning — ${gaps.length} unconfirmed value(s); a production build will fail until they are filled:\n${list}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
