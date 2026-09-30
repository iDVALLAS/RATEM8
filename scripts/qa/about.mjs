// LoanM8 QA script. Needs Playwright available to Node and a server on
// http://localhost:3100 started with NEXT_PUBLIC_STEALTH_MODE=false.
// Env: QA_CHROME = path to a Chromium binary (optional; Playwright's own
// browser is used when unset), QA_OUT = folder for screenshots.
import fs from "node:fs";
import { chromium } from "playwright";
const out = process.env.QA_OUT || "/tmp/loanm8-qa";
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.QA_CHROME || undefined });
const page = await browser.newPage({ viewport: { width: 1920, height: 900 } });
await page.goto("http://localhost:3100/", { waitUntil: "networkidle" });
// mid-stage look (backdrop still pinned?)
const stageTop = await page.evaluate(() => document.querySelector(".stage-root").getBoundingClientRect().top + scrollY);
await page.evaluate((y) => window.scrollTo(0, y), stageTop + 1400);
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/stage-mid.png` });
const mid = await page.evaluate(() => { const b = document.querySelector(".stage-backdrop").getBoundingClientRect(); return { backTop: b.top, backBottom: b.bottom }; });
// click About in the nav
await page.click('nav[aria-label="Primary"] a[href="/#about"]');
await page.waitForTimeout(900);
await page.screenshot({ path: `${out}/about-click.png` });
const about = await page.evaluate(() => { const h = document.querySelector("#about-heading").getBoundingClientRect(); const b = document.querySelector(".stage-backdrop").getBoundingClientRect(); return { scrollY, scrollH: document.documentElement.scrollHeight, headingTop: h.top, backBottom: b.bottom, atHeading: document.elementFromPoint(h.x + 10, h.y + 10)?.tagName }; });
console.log(JSON.stringify({ mid, about }));
await browser.close();
