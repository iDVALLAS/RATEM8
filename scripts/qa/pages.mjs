// Whole-site page scan (D89.1). Needs Playwright available to Node and a local server on
// http://localhost:3100 started like command-center.mjs (CC_DEV_LOGIN=1 … NEXT_PUBLIC_STEALTH_MODE=false).
// Signed in as the owner, it follows every same-site link it finds from /, /mlo and the sign-in pages
// (never /api, sign-out, downloads, mailto/tel/sms or other sites), at 390px and 1280px, and checks each page:
//   - it loads (status under 400, no server error page, no "Application error"),
//   - no page errors and no console errors,
//   - exactly one h1, nothing wider than the screen,
//   - a link without #anchor opens at the top (nothing scrolls it on load),
//   - a link with #anchor finds its target; a link whose words start "Open" opens its page at the top
//     (the D89.1 "Open Concierge" bug: it jumped to #drafts under a tall form, so it seemed to load at the bottom).
//     Other #anchor links that end at the bottom of a page (Text → the text box) are listed as notes.
// Ids in paths count as one route, and each route is read with at most 3 different queries.
// Vercel Analytics' script only exists on Vercel, so its 404 here is ignored.
// Exits 1 on any problem. Env: QA_CHROME = a Chromium binary (optional), QA_MAX = most pages (default 400).
import { chromium } from 'playwright';

const B = 'http://localhost:3100';
const MAX = Number(process.env.QA_MAX || 400);
const SKIP = [/^\/api\//, /signout/i, /download/i, /\.(csv|zip|pdf|png|jpe?g|webp|svg|ico|txt|md|xml|json|mp4|webm|wav)$/i, /^\/_next\//, /^\/v\//, /^\/my\//];
const START = ['/', '/mlo', '/sign-in', '/sign-up', '/licensing', '/privacy', '/terms', '/disclosures', '/chat'];
// "Failed to load resource" names no file; the response listener reports those with their address instead.
const IGNORE_CONSOLE = [/_vercel\/insights/, /_vercel\/speed-insights/, /^Failed to load resource/];
const IGNORE_RESPONSE = [/\/_vercel\//];
const VARIANTS = 3;
const route = (path) => path.replace(/\/(c|l|u|imp|v|tpl|cmp|p|e|r|s)_[A-Za-z0-9_-]{6,}/g, '/:id');
const perRoute = new Map();
const notes = [];

const b = await chromium.launch({ executablePath: process.env.QA_CHROME || undefined });
const problems = [];
const seen = new Set();
const queue = [...START];

const hashes = new Map(); // "path?query#hash" -> { from, text }
let loads = 0;

const norm = (href, from) => {
  try {
    const u = new URL(href, B + from);
    if (u.origin !== B) return null;
    if (SKIP.some((r) => r.test(u.pathname))) return null;
    return { page: u.pathname + u.search, hash: u.hash.slice(1) };
  } catch { return null; }
};

async function context(w) {
  const ctx = await b.newContext({ viewport: { width: w, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(B + '/api/cc/dev-login?email=owner@example.com');
  return { ctx, p };
}

async function check(p, url, w, where) {
  const errs = [];
  const onErr = (e) => errs.push(`pageerror: ${e.message.slice(0, 160)}`);
  const onCon = (m) => { if (m.type() === 'error' && !IGNORE_CONSOLE.some((r) => r.test(m.text()))) errs.push(`console: ${m.text().slice(0, 160)}`); };
  const onResp = (r) => {
    const u = r.url();
    if (r.status() >= 500 || (r.status() >= 400 && u !== B + url.split('#')[0] && u.startsWith(B) && !IGNORE_RESPONSE.some((x) => x.test(u)))) errs.push(`HTTP ${r.status()} ${u.replace(B, '')}`);
  };
  p.on('pageerror', onErr); p.on('console', onCon); p.on('response', onResp);
  let res = null;
  try {
    res = await p.goto(B + url, { waitUntil: 'networkidle', timeout: 30000 });
  } catch (e) { errs.push(`load: ${e.message.split('\n')[0]}`); }
  await p.waitForTimeout(400);
  const r = await p.evaluate(() => ({
    path: location.pathname + location.search,
    h1: document.querySelectorAll('h1').length,
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth,
    y: Math.round(scrollY),
    max: Math.max(0, document.documentElement.scrollHeight - innerHeight),
    appErr: /Application error|Internal Server Error|This page could not be found/.test(document.body?.innerText ?? ''),
    links: [...document.querySelectorAll('a[href]')].map((a) => [a.getAttribute('href'), (a.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60)]),
  })).catch(() => null);
  p.off('pageerror', onErr); p.off('console', onCon); p.off('response', onResp);
  loads++;
  const tag = `[${where} @${w}]`;
  if (res && res.status() >= 400) problems.push(`${tag} HTTP ${res.status()}`);
  for (const e of [...new Set(errs)]) problems.push(`${tag} ${e}`);
  if (!r) { problems.push(`${tag} page didn't finish loading`); return null; }
  if (r.appErr) problems.push(`${tag} shows an error page`);
  if (r.h1 !== 1) problems.push(`${tag} ${r.h1} h1 elements`);
  if (r.sw > r.cw + 1) problems.push(`${tag} wider than the screen (${r.sw} > ${r.cw})`);
  return r;
}

// 1) Crawl at 1280, collecting links; 2) every page again at 390; 3) every #anchor link at both widths.
const desk = await context(1280);
while (queue.length && seen.size < MAX) {
  const url = queue.shift();
  if (seen.has(url)) continue;
  seen.add(url);
  const r = await check(desk.p, url, 1280, url);
  if (!r) continue;
  if (r.y !== 0) problems.push(`[${url} @1280] opens scrolled ${r.y}px down (no #anchor)`);
  for (const [href, text] of r.links) {
    if (!href || /^(mailto|tel|sms|javascript):/i.test(href)) continue;
    const n = norm(href, r.path);
    if (!n) continue;
    if (n.hash && n.hash !== 'main' && n.hash !== 'content') {
      const k = `${n.page}#${n.hash}`;
      const rk = `${route(n.page.split('?')[0])}#${n.hash}`;
      if (!hashes.has(k) && ![...hashes.values()].some((h) => h.rk === rk && h.text === text)) hashes.set(k, { from: r.path, text, rk });
    }
    if (seen.has(n.page) || queue.includes(n.page)) continue;
    const rt = route(n.page.split('?')[0]);
    const have = perRoute.get(rt) ?? 0;
    if (have >= VARIANTS) continue;
    perRoute.set(rt, have + 1);
    queue.push(n.page);
  }
}
await desk.ctx.close();

const phone = await context(390);
for (const url of seen) {
  const r = await check(phone.p, url, 390, url);
  if (r && r.y !== 0) problems.push(`[${url} @390] opens scrolled ${r.y}px down (no #anchor)`);
}
await phone.ctx.close();

for (const w of [390, 1280]) {
  const { ctx, p } = await context(w);
  for (const [k, { from, text }] of hashes) {
    const [page, hash] = [k.slice(0, k.indexOf('#')), k.slice(k.indexOf('#') + 1)];
    if (!seen.has(page)) continue;
    await check(p, k, w, `${k} (linked from ${from})`);
    const t = await p.evaluate((h) => {
      const el = document.getElementById(decodeURIComponent(h)) || document.getElementsByName(decodeURIComponent(h))[0];
      return { found: !!el, y: Math.round(scrollY), max: Math.max(0, document.documentElement.scrollHeight - innerHeight) };
    }, hash).catch(() => null);
    if (!t) continue;
    if (!t.found) problems.push(`[${k} @${w}] no #${hash} on the page ("${text}" on ${from})`);
    else if (/^Open\b/i.test(text) && page.split('?')[0] !== from.split('?')[0] && t.y > 0) problems.push(`[${k} @${w}] "${text}" on ${from} opens the page ${t.y}px down, not at the top`);
    else if (t.max > 200 && t.y >= t.max - 40) notes.push(`[${k} @${w}] "${text}" on ${from} ends at the bottom of the page`);
  }
  await ctx.close();
}

await b.close();
console.log(`scanned ${seen.size} pages (${loads} page loads at 390/1280, ${hashes.size} #anchor links)${seen.size >= MAX ? ` — stopped at QA_MAX=${MAX}` : ''}`);
if (notes.length) console.log(`NOTES (intended jumps to a section near the bottom; check the words fit): ${notes.length}\n${notes.join('\n')}`);
console.log(problems.length ? `PROBLEMS: ${problems.length}\n${problems.join('\n')}` : 'PROBLEMS: none');
process.exit(problems.length ? 1 : 0);
