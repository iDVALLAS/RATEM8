// check:licensing (C2 / L1) — fails when config/licensing.ts still holds an
// unconfirmed-value marker. The launch brief's rule: anything that can't be
// confirmed goes into that file as the marker, and a production build must
// not pass until it is replaced. Run by next.config.ts on `next build`, and
// on its own with `npm run check:licensing`.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const MARKERS = /\b(TBD|VERIFY|XXXX)\b/;

export function findLicensingMarkers(text) {
  return text
    .split("\n")
    .map((line, i) => ({ line: i + 1, text: line.trim() }))
    .filter((l) => MARKERS.test(l.text));
}

export function checkLicensing(root) {
  const file = join(root, "config", "licensing.ts");
  const hits = findLicensingMarkers(readFileSync(file, "utf8"));
  if (hits.length) {
    const lines = hits.map((h) => `  config/licensing.ts:${h.line}  ${h.text}`).join("\n");
    throw new Error(`check:licensing failed — unconfirmed licensing values remain (TBD / VERIFY / XXXX):\n${lines}`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    checkLicensing(join(dirname(fileURLToPath(import.meta.url)), ".."));
    console.log("check:licensing passed — no TBD, VERIFY or XXXX in config/licensing.ts.");
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
