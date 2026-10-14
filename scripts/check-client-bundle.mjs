#!/usr/bin/env node
/**
 * scripts/check-client-bundle.mjs — after `next build`, fail if any
 * browser-delivered file contains a real lender name, an admin credential
 * variable, or a server-only pricing field. Lender identities and the
 * lender ↔ letter mapping must stay on the server.
 *
 * Run: npm run check:bundle (after npm run build)
 */
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const STATIC = join(ROOT, ".next", "static");
if (!existsSync(STATIC)) {
  console.error("check:bundle: .next/static not found. Run npm run build first.");
  process.exit(1);
}

const FORBIDDEN = [
  "MLO_ADMIN_PASSWORD", "MLO_ADMIN_USER", "PRICING_STORE_DIR",
  "restrictsConsumerDisplay", "displayConsent", "sourceSha256", "lenderKey",
  "United Wholesale", "The Loan Store", "Pennymac TPO", "Freedom Mortgage", "REMN Wholesale",
  "Provident Funding", "RISE TPO", "HomeXpress", "Newrez Wholesale", "Kind Lending", "Plaza Home Mortgage",
];

const files = [];
(function walk(d) {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(js|css|json|txt)$/.test(n)) files.push(p);
  }
})(STATIC);

const hits = [];
for (const f of files) {
  const s = readFileSync(f, "utf8");
  for (const word of FORBIDDEN) if (s.includes(word)) hits.push(`${f.slice(ROOT.length)}: ${word}`);
}
if (hits.length) {
  console.error("check:bundle failed — server-only data found in browser files:\n" + hits.join("\n"));
  process.exit(1);
}
console.log(`check:bundle passed — ${files.length} browser files scanned, no lender names or admin secrets.`);
