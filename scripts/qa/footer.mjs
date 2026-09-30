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
// scroll slowly to the bottom like a user
await page.evaluate(async () => {
  const step = 400;
  for (let y = 0; y < document.body.scrollHeight; y += step) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 40)); }
  window.scrollTo(0, document.body.scrollHeight);
});
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/footer-bottom.png` });
const info = await page.evaluate(() => {
  const pick = (x, y) => { const el = document.elementFromPoint(x, y); if (!el) return null; const cs = getComputedStyle(el); return { tag: el.tagName, cls: el.className?.toString().slice(0, 80), pos: cs.position, z: cs.zIndex, bg: cs.backgroundImage.slice(0, 60) || cs.backgroundColor }; };
  const chip = document.querySelector("footer .state-chip");
  const r = chip.getBoundingClientRect();
  const cs = getComputedStyle(chip);
  const stage = document.querySelector(".stage-root");
  const back = document.querySelector(".stage-backdrop");
  const foot = document.querySelector("footer");
  return {
    scrollY: window.scrollY, scrollH: document.documentElement.scrollHeight, innerH: innerHeight,
    chipRect: { x: r.x, y: r.y, w: r.width, h: r.height }, chipColor: cs.color, chipOpacity: cs.opacity, chipText: chip.textContent,
    atChip: pick(r.x + r.width / 2, r.y + r.height / 2),
    at300: pick(960, 300), at450: pick(500, 450),
    stageRect: stage.getBoundingClientRect().toJSON(), backRect: back.getBoundingClientRect().toJSON(), footRect: foot.getBoundingClientRect().toJSON(),
    lastSheet: [...document.querySelectorAll(".sheet-item")].map(s => ({ cls: s.className.slice(0, 40), top: s.getBoundingClientRect().top, h: s.getBoundingClientRect().height, sheetTop: s.style.getPropertyValue("--sheet-top") })),
  };
});
console.log(JSON.stringify(info, null, 1));
await browser.close();
