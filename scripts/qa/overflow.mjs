// LoanM8 QA script. Needs Playwright available to Node and a server on
// http://localhost:3100 started with NEXT_PUBLIC_STEALTH_MODE=false.
// Env: QA_CHROME = path to a Chromium binary (optional; Playwright's own
// browser is used when unset), QA_OUT = folder for screenshots.
import fs from "node:fs";
import { chromium } from "playwright";
const base = "http://localhost:3100";
const routes = ["/","/second-look","/join","/agents","/investors","/calculators","/calculators/points-breakeven","/calculators/refinance-breakeven","/calculators/rent-vs-buy","/calculators/affordability","/states/washington","/states/oregon","/states/texas","/principles","/rates","/loan-estimate","/sample-brief","/chat","/ai","/privacy","/terms","/disclosures","/tools","/tools/points"];
const shots = new Set(["/","/second-look","/join","/agents","/investors","/calculators/points-breakeven","/principles","/rates","/loan-estimate","/sample-brief","/chat","/ai","/states/washington","/disclosures"]);
const out = process.argv[2] || process.env.QA_OUT || "/tmp/loanm8-qa";
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.QA_CHROME || undefined });
for (const [name, vp] of [["m", { width: 390, height: 844 }], ["d", { width: 1280, height: 800 }]]) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, reducedMotion: "no-preference" });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  for (const r of routes) {
    await page.goto(base + r, { waitUntil: "networkidle" });
    // scroll through to trigger scenes
    const h = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y < h; y += vp.height * 0.8) { await page.evaluate((y) => window.scrollTo(0, y), y); await page.waitForTimeout(120); }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(400);
    const ov = await page.evaluate(() => {
      const sw = document.documentElement.scrollWidth, cw = document.documentElement.clientWidth;
      const bad = [];
      if (sw > cw + 1) {
        for (const el of document.querySelectorAll("body *")) {
          const r = el.getBoundingClientRect();
          if (r.right > cw + 1 && r.width > 0 && getComputedStyle(el).visibility !== "hidden") { bad.push(el.tagName.toLowerCase() + (el.className && typeof el.className === "string" ? "." + el.className.split(" ").slice(0,2).join(".") : "")); if (bad.length > 6) break; }
        }
      }
      const h1 = document.querySelectorAll("h1").length;
      return { sw, cw, bad, h1 };
    });
    const flag = ov.sw > ov.cw + 1 ? "OVERFLOW" : "ok";
    console.log(`${name} ${r.padEnd(36)} ${flag} sw=${ov.sw} cw=${ov.cw} h1=${ov.h1} ${ov.bad.join(",")}`);
    if (shots.has(r)) await page.screenshot({ path: `${out}/${name}${r.replace(/\//g, "_") || "_home"}.png`, fullPage: name === "m" });
  }
  if (errors.length) console.log(`${name} JS errors:\n  ` + [...new Set(errors)].slice(0, 12).join("\n  "));
  await ctx.close();
}
await browser.close();
