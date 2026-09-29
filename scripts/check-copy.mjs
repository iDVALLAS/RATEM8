#!/usr/bin/env node
/**
 * scripts/check-copy.mjs — fails when any banned phrase appears in the
 * shipped code (app/, components/, lib/, public/, middleware.ts).
 *
 * Run: npm run check:copy
 * The list mirrors COMPLIANCE.md rule 2 (+ rule 3, rule 10 words).
 * Matching is case-insensitive and ignores this script, docs, and the
 * compliance/attorney markdown files (which must quote the phrases).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const SCAN_DIRS = ["app", "components", "lib", "public"];
const SCAN_FILES = ["middleware.ts"];
const EXT = new Set([".ts", ".tsx", ".js", ".mjs", ".css", ".md", ".txt", ".json", ".svg"]);

const BANNED = [
  "get a quote in 60 seconds",
  "lock in today's rate",
  "lock in today’s rate",
  "best rates",
  "guaranteed",
  "lowest rates",
  "we'll beat any offer",
  "we’ll beat any offer",
  "beat any offer",
  "pre-approved in minutes",
  "preapproved in minutes",
  "limited time",
  "countdown",
  "trusted by",
  "testimonial",
  "social proof",
  "act now",
  "don't miss",
  "hurry",
  "six figures",
  "six-figure",
  "ground floor",
  "referral fee",
  "commission",
  "comp split",
];

// "save $X" — a dollar-savings promise in marketing copy.
const BANNED_REGEX = [/\bsave \$\s?\d/i, /\bsave up to \$/i];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (entry === "node_modules" || entry === ".next") continue;
      walk(p, out);
    } else if (EXT.has(p.slice(p.lastIndexOf(".")))) {
      out.push(p);
    }
  }
  return out;
}

const files = [];
for (const d of SCAN_DIRS) {
  try {
    walk(join(ROOT, d), files);
  } catch {
    /* dir may not exist */
  }
}
for (const f of SCAN_FILES) files.push(join(ROOT, f));

let failures = 0;
for (const file of files) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    const lower = line.toLowerCase();
    for (const phrase of BANNED) {
      if (lower.includes(phrase)) {
        failures++;
        console.error(`✗ ${relative(ROOT, file)}:${i + 1}  "${phrase}"`);
      }
    }
    for (const re of BANNED_REGEX) {
      if (re.test(line)) {
        failures++;
        console.error(`✗ ${relative(ROOT, file)}:${i + 1}  ${re}`);
      }
    }
  });
}

if (failures > 0) {
  console.error(`\ncheck:copy failed — ${failures} banned phrase${failures === 1 ? "" : "s"} found.`);
  process.exit(1);
}
console.log(`check:copy passed — ${files.length} files scanned, no banned phrases.`);
