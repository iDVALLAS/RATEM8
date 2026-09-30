// LoanM8 QA script. Needs Playwright available to Node and a server on
// http://localhost:3100 started with NEXT_PUBLIC_STEALTH_MODE=false.
// Env: QA_CHROME = path to a Chromium binary (optional; Playwright's own
// browser is used when unset), QA_OUT = folder for screenshots.
import fs from "node:fs";
import { chromium } from "playwright";
const base = "http://localhost:3100";
const routes = ["/", "/second-look", "/join", "/agents", "/calculators", "/calculators/points-breakeven", "/calculators/rent-vs-buy", "/calculators/affordability", "/states/washington", "/principles", "/loan-estimate", "/sample-brief", "/chat", "/ai", "/privacy", "/terms", "/disclosures", "/tools", "/tools/points", "/tools/amortization"];
const b = await chromium.launch({ executablePath: process.env.QA_CHROME || undefined });
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
const findings = new Map();
for (const r of routes) {
  await page.goto(base + r, { waitUntil: "networkidle" });
  const res = await page.evaluate(() => {
    const out = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const seen = new Set();
    let n;
    while ((n = walker.nextNode())) {
      const t = n.textContent.trim();
      if (!t) continue;
      const el = n.parentElement;
      if (!el || seen.has(el)) continue;
      seen.add(el);
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") continue;
      const fam = cs.fontFamily;
      const first = fam.split(",")[0].replace(/["']/g, "").trim();
      const ok = /Fraunces|Geist|JetBrains/i.test(first) || first.startsWith("__");
      const issues = [];
      if (!ok) issues.push(`family=${first}`);
      if (cs.fontStyle === "italic" && !/Fraunces/i.test(first)) issues.push(`synthesized-italic(${first})`);
      const w = parseInt(cs.fontWeight, 10);
      if (/JetBrains/i.test(first) && w >= 600) issues.push(`mono-weight-${w}`);
      if (/Fraunces/i.test(first) && w < 400) issues.push(`fraunces-weight-${w}`);
      const px = parseFloat(cs.fontSize);
      if (px < 9.5 && el.tagName !== "SUP") issues.push(`tiny-${px}px`);
      if (issues.length) {
        const cls = (typeof el.className === "string" ? el.className : "").split(" ").slice(0, 3).join(".");
        out.push({ tag: el.tagName.toLowerCase(), cls, text: t.slice(0, 40), issues: issues.join(",") });
      }
    }
    return out;
  });
  for (const f of res) {
    const key = `${f.issues} | ${f.tag}.${f.cls}`;
    if (!findings.has(key)) findings.set(key, { routes: new Set(), text: f.text });
    findings.get(key).routes.add(r);
  }
}
for (const [k, v] of findings) console.log(`${k}  «${v.text}»  ${[...v.routes].slice(0, 4).join(" ")}`);
console.log(`\n${findings.size} distinct findings`);
await b.close();
