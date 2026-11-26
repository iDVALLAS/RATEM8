// D91 site-wide text-fit audit. Needs Playwright available to Node and a local server on
// http://localhost:3100 started like command-center.mjs:
//   CC_DEV_LOGIN=1 CC_LINK_SECRET=qa-secret MLO_OWNER_EMAIL=owner@example.com NEXT_PUBLIC_STEALTH_MODE=false PORT=3100 npm start
// plus, for the coming-soon page, a second server from the same build with the site locked:
//   SITE_LOCK=true PORT=3101 npm start            (QA_SOON = its address; skipped with a note when it isn't up)
// Run it on a fresh server first: Lead sources is audited in example mode before it seeds a small book
// (an import, a loan, leads, a reply, a campaign) and then audits every page with real data.
//
// Pages: the public site, /sign-in and /sign-up (and their sub-pages), /chat, and every Command Center page
// signed in as the owner (a crawl of every same-site link from the seed list, ids counted as one route, at most
// 3 queries per route), plus the contact tabs, the import's steps, Lead sources in example and real mode, the
// planner, and a few opened states (every <details> open, the phone "More" sheet, the desktop menus, the public
// mobile menu, the coming-soon Pilot menu, the Lead sources permission "i"). Each at 360, 390, 768, 1024 and
// 1280px, in Night and Paper, with reduced motion (so nothing is caught mid-animation); and /sign-in and /sign-up
// swept every 8px from 320 to 1440 in Night, Dim and Paper (the Concierge team tiles). It flags:
//   - spills: a text line past the edge of its box (the nearest ancestor with a border, a background or a clip),
//     or past the screen edge, when no scroll box holds it;
//   - cut off: text past the edge of a box that clips it (overflow hidden/clip, an ellipsis or a line clamp)
//     when neither the element nor its box carries the whole text in title or aria-label, and the element isn't
//     marked data-textfit-full="<where the whole text is>" (a template preview whose full message is under "Use it");
//   - run together: two neighbouring pieces of text on one line with under 2px between them and no space or
//     punctuation at the joint ("ContractDisclosures");
//   - overlap: two pieces of text drawn over each other.
// Ignored: scroll boxes (overflow auto/scroll: wide tables and swipe rows scroll on purpose), screen-reader-only
// text, the term field and other decorative art (svg), closed dialogs, inert sheets, and text inside fixed or
// sticky bars when checking overlap (they cover content by design). Exits 1 on any finding and prints each with
// page, widths, themes, selector and text. Env: QA_CHROME = a Chromium binary (optional), QA_WIDTHS (default
// 360,390,768,1024,1280), QA_THEMES (default night,paper), QA_ONLY = a comma list of paths (or "import steps",
// "coming soon", "showcase"), QA_SWEEP_STEP (default 8), QA_PAR = browser
// pages at once (default 4), QA_MAX = most crawled pages (default 400), QA_SOON (default http://localhost:3101).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

const B = 'http://localhost:3100';
const SOON = process.env.QA_SOON || 'http://localhost:3101';
const WIDTHS = (process.env.QA_WIDTHS || '360,390,768,1024,1280').split(',').map(Number);
const THEMES = (process.env.QA_THEMES || 'night,paper').split(',');
const PAR = Number(process.env.QA_PAR || 4);
const MAX = Number(process.env.QA_MAX || 400);
const ONLY = (process.env.QA_ONLY || '').split(',').filter(Boolean);
const SKIP = [/^\/api\//, /signout/i, /download/i, /\.(csv|zip|pdf|png|jpe?g|webp|svg|ico|txt|md|xml|json|mp4|webm|wav)$/i, /^\/_next\//, /^\/v\//, /^\/demo/];
const PUBLIC = ['/', '/second-look', '/join', '/agents', '/investors', '/calculators', '/calculators/points-breakeven', '/calculators/refinance-breakeven', '/calculators/rent-vs-buy', '/calculators/affordability', '/states/washington', '/states/oregon', '/states/texas', '/principles', '/rates', '/loan-estimate', '/sample-brief', '/chat', '/chat?prep=1', '/ai', '/privacy', '/terms', '/disclosures', '/licensing', '/licensing/texas', '/tools', '/tools/points', '/design'];
const AUTH = ['/sign-in', '/sign-in/code', '/sign-in/link', '/sign-up', '/sign-up/confirm'];
const CC = ['/mlo', '/mlo/campaigns?new=1', '/mlo/connections?sys=arive', '/mlo/academy', '/mlo/agents', '/mlo/agents/setup', '/mlo/automations', '/mlo/calls', '/mlo/campaigns', '/mlo/cards', '/mlo/concierge', '/mlo/connections', '/mlo/contacts', '/mlo/contacts?kind=agent', '/mlo/contacts?select=all', '/mlo/contacts?rmin=7.2&rmax=9&closed=1&asked=words', '/mlo/contacts/import', '/mlo/contacts/import/history', '/mlo/contacts/permission', '/mlo/contacts/cleanup', '/mlo/email', '/mlo/expenses', '/mlo/expenses/report', '/mlo/export', '/mlo/inbox', '/mlo/inbox?tab=all', '/mlo/settings', '/mlo/launch', '/mlo/leads', '/mlo/leads/plan', '/mlo/leads/plan?budget=3000', '/mlo/loa', '/mlo/messages', '/mlo/network', '/mlo/pilot', '/mlo/pipeline', '/mlo/pricing', '/mlo/pricing/receive', '/mlo/refi', '/mlo/report', '/mlo/rules', '/mlo/scripts', '/mlo/security', '/mlo/setup', '/mlo/setup-help', '/mlo/signature', '/mlo/signups', '/mlo/team', '/mlo/templates', '/mlo/text-setup', '/mlo/texting', '/mlo/training', '/mlo/videos', '/mlo/voice', '/mlo/voicemail', '/mlo/welcome'];
const route = (p) => p.replace(/\/(c|l|u|imp|v|tpl|cmp|p|e|r|s)_[A-Za-z0-9_-]{6,}/g, '/:id');
const anonPath = (p) => /^\/(sign-in|sign-up|my\/)/.test(p);

const CSV = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cc-fit-')), 'book.csv');
fs.writeFileSync(CSV, 'First Name,Last Name,Mobile Phone,Email,State,Contact Type,Close Date,Loan Amount,Interest Rate,Notes\nAnn,Lee,(206) 555-1234,ann@example.com,WA,Past Client,11/20/2020,"$400,000",7.25,\nBo,Park,425-555-2222,bo@example.com,WA,Past Client,3/2/2022,"$520,000",4.5,Planning a kitchen remodel next year.\n');

// ---------------------------------------------------------------------------------------------------------
// Runs in the page. Returns [{ kind, sel, text, detail }].
function textFit() {
  const vw = document.documentElement.clientWidth;
  const out = [];
  const IGNORE = '.term-field, .sr-only, .visually-hidden, .skip-link, svg, script, style, noscript, template, option, select, textarea, dialog:not([open]), [inert], [data-textfit-ignore]';
  const styles = new Map();
  const cs = (el) => { let s = styles.get(el); if (!s) { s = getComputedStyle(el); styles.set(el, s); } return s; };
  const alpha = (c) => {
    if (!c || c === 'transparent') return 0;
    const slash = /\/\s*([\d.]+%?)\s*\)$/.exec(c);
    if (slash) return slash[1].endsWith('%') ? parseFloat(slash[1]) / 100 : parseFloat(slash[1]);
    const m = /^rgba\(([^)]+)\)$/.exec(c);
    if (m) return parseFloat(m[1].split(',')[3]);
    return 1;
  };
  const boxed = (el) => {
    const s = cs(el);
    if (alpha(s.backgroundColor) > 0.02 || s.backgroundImage !== 'none') return true;
    for (const side of ['Top', 'Right', 'Bottom', 'Left']) if (parseFloat(s[`border${side}Width`]) > 0 && s[`border${side}Style`] !== 'none' && alpha(s[`border${side}Color`]) > 0.02) return true;
    return false;
  };
  const sel = (el) => {
    const one = (e) => {
      const c = typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
      return e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + c;
    };
    const parts = [];
    for (let e = el; e && e !== document.body && parts.length < 3; e = e.parentElement) parts.unshift(one(e));
    return parts.join(' > ');
  };
  const vis = new Map();
  const visible = (el) => {
    if (vis.has(el)) return vis.get(el);
    let v = el.checkVisibility({ opacityProperty: true, visibilityProperty: true });
    if (v) for (let e = el; e && e !== document.body; e = e.parentElement) {
      const r = e.getBoundingClientRect();
      const s = cs(e);
      if ((r.width <= 1 || r.height <= 1) && s.overflow !== 'visible') { v = false; break; } // screen-reader-only box
      if (s.clipPath && s.clipPath !== 'none' && /inset\(50%|circle\(0/.test(s.clipPath)) { v = false; break; }
      if (s.clip && s.clip !== 'auto' && /rect\(0/.test(s.clip)) { v = false; break; }
    }
    vis.set(el, v);
    return v;
  };
  const pinned = new Map();
  const isPinned = (el) => {
    if (pinned.has(el)) return pinned.get(el);
    let p = false;
    // Fixed and sticky bars, and anything that opens over the page (a dialog, a popover, a menu), cover content by design.
    for (let e = el; e && e !== document.documentElement; e = e.parentElement) { const pos = cs(e).position; if (pos === 'fixed' || pos === 'sticky' || e.matches('dialog[open], [role=dialog], [role=menu], [role=listbox], [popover], [aria-modal=true]')) { p = true; break; } }
    pinned.set(el, p);
    return p;
  };
  // The part of each line that is actually drawn: clipped by every box above it that clips or scrolls.
  const drawn = (el, rects) => {
    let out = rects.map((r) => ({ left: r.left, right: r.right, top: r.top, bottom: r.bottom }));
    for (let e = el; e && e !== document.body && e !== document.documentElement && out.length; e = e.parentElement) {
      const s = cs(e);
      if (s.overflowX === 'visible' && s.overflowY === 'visible') continue;
      const r = e.getBoundingClientRect();
      const L = r.left + parseFloat(s.borderLeftWidth), R = r.right - parseFloat(s.borderRightWidth), T = r.top + parseFloat(s.borderTopWidth), Bt = r.bottom - parseFloat(s.borderBottomWidth);
      out = out.map((q) => ({ left: Math.max(q.left, s.overflowX === 'visible' ? -Infinity : L), right: Math.min(q.right, s.overflowX === 'visible' ? Infinity : R), top: Math.max(q.top, s.overflowY === 'visible' ? -Infinity : T), bottom: Math.min(q.bottom, s.overflowY === 'visible' ? Infinity : Bt) })).filter((q) => q.right - q.left > 0.5 && q.bottom - q.top > 0.5);
    }
    return out.map((q) => ({ ...q, width: q.right - q.left, height: q.bottom - q.top }));
  };
  // The text pieces, trimmed to their first and last visible letters.
  const runs = [];
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = tw.nextNode(); n; n = tw.nextNode()) {
    const t = n.nodeValue;
    if (!/\S/.test(t)) continue;
    const el = n.parentElement;
    if (!el || el.closest(IGNORE) || !visible(el)) continue;
    const a = t.search(/\S/), z = t.length - /\S/.exec([...t].reverse().join('')).index;
    const range = document.createRange();
    range.setStart(n, a); range.setEnd(n, z);
    const rects = [...range.getClientRects()].filter((r) => r.width > 0.5 && r.height > 0.5);
    if (!rects.length) continue;
    if (rects.every((r) => r.right < 0)) continue; // parked off screen on purpose (a honeypot field)
    runs.push({ el, rects, vrects: drawn(el, rects), text: t.slice(a, z).replace(/\s+/g, ' ') });
  }
  const short = (s) => (s.length > 70 ? s.slice(0, 67) + '…' : s);
  const carries = (el, stop, text) => {
    for (let e = el; e; e = e.parentElement) {
      const t = (e.getAttribute('title') || '') + ' ' + (e.getAttribute('aria-label') || '');
      if (t.trim() && t.includes(text.slice(0, 40))) return true;
      if (e === stop) break;
    }
    return false;
  };
  // 1) Spills and cut-offs.
  for (const run of runs) {
    let box = null, clip = '', scroller = false, ellipsis = false;
    for (let e = run.el; e && e !== document.body && e !== document.documentElement; e = e.parentElement) {
      const s = cs(e);
      if (s.textOverflow === 'ellipsis' || s.webkitLineClamp !== 'none' && s.webkitLineClamp) ellipsis = ellipsis || s.textOverflow === 'ellipsis' || (s.webkitLineClamp && s.webkitLineClamp !== 'none');
      const ox = s.overflowX, oy = s.overflowY;
      if (ox === 'auto' || ox === 'scroll' || oy === 'auto' || oy === 'scroll') { scroller = true; break; }
      if (s.display === 'inline' || s.display === 'contents') continue;
      if (ox === 'hidden' || ox === 'clip' || oy === 'hidden' || oy === 'clip') { box = e; clip = 'clip'; break; }
      if (boxed(e)) { box = e; break; }
    }
    if (scroller) continue;
    if (!scroller) {
      // Past the screen edge, with no scroll box anywhere above it.
      let anyScroll = false;
      for (let e = run.el.parentElement; e && e !== document.body; e = e.parentElement) { const s = cs(e); if (s.overflowX === 'auto' || s.overflowX === 'scroll') { anyScroll = true; break; } }
      if (!anyScroll) {
        const past = run.rects.find((r) => r.right > vw + 1 || r.left < -1);
        if (past) out.push({ kind: 'past the screen edge', sel: sel(run.el), text: short(run.text), detail: `${Math.round(past.left)}–${Math.round(past.right)} of ${vw}` });
      }
    }
    if (!box) continue;
    const br = box.getBoundingClientRect();
    const s = cs(box);
    const L = br.left + parseFloat(s.borderLeftWidth), R = br.right - parseFloat(s.borderRightWidth);
    const T = br.top + parseFloat(s.borderTopWidth), Bt = br.bottom - parseFloat(s.borderBottomWidth);
    // Spaces kept by pre-wrap hang past the line's end on purpose; a glyph box taller than a tight line-height isn't a cut.
    const fs = parseFloat(cs(run.el).fontSize) || 16;
    const hang = /pre/.test(cs(run.el).whiteSpace) ? 0.4 * fs : 0;
    const bad = run.rects.find((r) => r.right > R + 1 + hang || r.left < L - 1 || (clip && (r.bottom - Bt > 0.4 * r.height || T - r.top > 0.4 * r.height)));
    if (!bad) continue;
    if (clip || ellipsis) {
      if (carries(run.el, box, run.text) || run.el.closest('[data-textfit-full]')) continue; // the whole text is shown another way
      out.push({ kind: ellipsis ? 'cut off (ellipsis / clamp, no title)' : 'cut off by its box', sel: sel(run.el), text: short(run.text), detail: `text ${Math.round(bad.left)}–${Math.round(bad.right)}×${Math.round(bad.top)}–${Math.round(bad.bottom)}, box ${sel(box).split(' > ').pop()} ${Math.round(L)}–${Math.round(R)}×${Math.round(T)}–${Math.round(Bt)}` });
    } else out.push({ kind: 'spills past its box', sel: sel(run.el), text: short(run.text), detail: `text ${Math.round(bad.left)}–${Math.round(bad.right)}, box ${sel(box).split(' > ').pop()} ${Math.round(L)}–${Math.round(R)}` });
  }
  // An element whose own text is wider than it (ellipsis boxes with overflow hidden and no clipping box above).
  for (const el of document.querySelectorAll('body *')) {
    const s = cs(el);
    if (s.textOverflow !== 'ellipsis' || el.closest(IGNORE) || !visible(el)) continue;
    if (el.scrollWidth > el.clientWidth + 1 && !carries(el, el, (el.textContent || '').trim())) {
      const text = (el.textContent || '').trim().replace(/\s+/g, ' ');
      if (text && !out.some((o) => o.text === short(text))) out.push({ kind: 'cut off (ellipsis / clamp, no title)', sel: sel(el), text: short(text), detail: `${el.scrollWidth}px of text in ${el.clientWidth}px` });
    }
  }
  // 2) Run together (neighbours in reading order) and overlaps.
  const sameLine = (a, b) => Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) >= 0.5 * Math.min(a.height, b.height);
  // A joint is fine when either side is a space or punctuation: "(" + "10%", "Loan" + ":", "$" + "1,500".
  const PUNCT = /[\s.,:;!?()[\]{}·|/\\–—\-•…'"‘’“”%$#@+&*=<>~]/;
  const BRAND = new Set(['Loan|M8', 'Rate|M8', 'MLO|Command', 'M8|Green']);
  for (let i = 0; i + 1 < runs.length; i++) {
    const A = runs[i], Bn = runs[i + 1];
    if (isPinned(A.el) !== isPinned(Bn.el)) continue; // an overlay next to the page under it
    if (!A.vrects.length || !Bn.vrects.length) continue;
    if (A.el === Bn.el) continue; // two text nodes of one element ("76" + "¢ a mile") are one piece of text
    const a = A.vrects[A.vrects.length - 1], b = Bn.vrects[0];
    if (!sameLine(a, b) || b.left < a.left) continue;
    const gap = b.left - a.right;
    if (gap >= 2) continue;
    const ca = A.text.slice(-1), cb = Bn.text[0];
    if (gap > -2 && (PUNCT.test(ca) || PUNCT.test(cb))) continue;
    const joint = `${A.text.split(' ').pop()}|${Bn.text.split(' ')[0]}`;
    if (BRAND.has(joint)) continue;
    // A word styled in pieces ("L" + "oan" for the shimmer): the second piece goes on in lower case.
    if (gap > -2 && /\p{L}/u.test(ca) && /\p{Ll}/u.test(cb)) continue;
    out.push({ kind: gap > -2 ? 'run together' : 'overlap', sel: `${sel(A.el)} + ${sel(Bn.el).split(' > ').pop()}`, text: short(`${A.text} | ${Bn.text}`), detail: `gap ${gap.toFixed(1)}px` });
  }
  const bands = new Map();
  runs.forEach((run, i) => {
    if (isPinned(run.el)) return; // (also skipped as a neighbour below when one side is pinned and the other isn't)
    // Glyphs sit inside the font's box; trim a fifth off its top and bottom so tight line-heights don't count.
    for (const q of run.vrects) { const r = { left: q.left, right: q.right, top: q.top + 0.2 * q.height, bottom: q.bottom - 0.2 * q.height, height: 0.6 * q.height }; for (let k = Math.floor(r.top / 24); k <= Math.floor(r.bottom / 24); k++) { const l = bands.get(k) || []; l.push([i, r]); bands.set(k, l); } }
  });
  const seenPair = new Set();
  for (const l of bands.values()) for (let x = 0; x < l.length; x++) for (let y = x + 1; y < l.length; y++) {
    const [i, r] = l[x], [j, q] = l[y];
    if (i === j || Math.abs(i - j) === 1) continue; // neighbours are judged above
    const w = Math.min(r.right, q.right) - Math.max(r.left, q.left);
    const h = Math.min(r.bottom, q.bottom) - Math.max(r.top, q.top);
    if (w <= 2 || h <= 0.3 * Math.min(r.height, q.height)) continue;
    const key = i < j ? `${i}:${j}` : `${j}:${i}`;
    if (seenPair.has(key)) continue;
    seenPair.add(key);
    out.push({ kind: 'overlap', sel: `${sel(runs[i].el)} × ${sel(runs[j].el).split(' > ').pop()}`, text: short(`${runs[i].text} | ${runs[j].text}`), detail: `${Math.round(w)}×${Math.round(h)}px` });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------
const b = await chromium.launch({ executablePath: process.env.QA_CHROME || undefined });
const findings = new Map(); // key -> { page, kind, sel, text, detail, widths:Set, themes:Set }
const notes = [];
let views = 0;
const record = (page, w, theme, list) => {
  for (const f of list) {
    const k = `${page}\u0000${f.kind}\u0000${f.sel}\u0000${f.text}`;
    const e = findings.get(k) || { page, ...f, widths: new Set(), themes: new Set() };
    e.widths.add(w); e.themes.add(theme);
    findings.set(k, e);
  }
};
const setTheme = (p, t) => p.evaluate((t) => { try { localStorage.setItem('loanm8.theme', t); } catch {} document.documentElement.setAttribute('data-theme', t); }, t);
// Audit the page as it stands, in every theme.
const auditHere = async (p, label, w) => {
  for (const t of THEMES) {
    await setTheme(p, t);
    await p.waitForTimeout(40);
    record(label, w, t, await p.evaluate(textFit));
    views++;
  }
};
const newCtx = async (w, signedIn, cookies) => {
  const c = await b.newContext({ viewport: { width: w, height: 900 }, reducedMotion: 'reduce' });
  if (signedIn) await c.addCookies(cookies);
  await c.addInitScript(() => { try { localStorage.setItem('loanm8.theme', 'night'); } catch {} });
  return c;
};
const open = async (p, url) => { const r = await p.goto(url, { waitUntil: 'networkidle', timeout: 45000 }); await p.waitForTimeout(250); return r; };

// Sign in as the owner.
const seedCtx = await b.newContext({ viewport: { width: 1280, height: 900 } });
const sp = await seedCtx.newPage();
const login = await sp.goto(B + '/api/cc/dev-login?email=owner@example.com');
if (!login || !new URL(sp.url()).pathname.startsWith('/mlo')) { console.log('Start the server with CC_DEV_LOGIN=1 (see the top of this file).'); process.exit(1); }
let cookies = await seedCtx.cookies();

// Phase 1: Lead sources in example mode, before the book has a lead.
const each = async (fn) => {
  for (const w of WIDTHS) {
    const c = await newCtx(w, true, cookies);
    const p = await c.newPage();
    try { await fn(p, w); } catch (e) { notes.push(`[@${w}] ${e.message.split('\n')[0]}`); }
    await c.close();
  }
};
await sp.goto(B + '/mlo/leads', { waitUntil: 'networkidle' });
const exampleMode = (await sp.locator('#scorecard .cc-ex').count()) > 0;
if (!ONLY.length || ONLY.includes('/mlo/leads')) {
  if (exampleMode) {
    await each(async (p, w) => {
      await open(p, B + '/mlo/leads');
      await auditHere(p, '/mlo/leads (example mode)', w);
      await p.evaluate(() => document.querySelectorAll('details').forEach((d) => { d.open = true; }));
      await auditHere(p, '/mlo/leads (example mode, folds open)', w);
      await open(p, B + '/mlo/leads/plan');
      await auditHere(p, '/mlo/leads/plan (no history)', w);
    });
  } else notes.push('Lead sources example mode not audited: the book already has a lead (run this on a fresh server).');
}

// Phase 2: a small book (same as buttons.mjs), so pages show real rows.
try {
  await sp.goto(B + '/mlo/contacts');
  if (!(await sp.locator('a[href*="/mlo/contacts/"]').filter({ hasText: 'Lee' }).count())) {
    await sp.goto(B + '/mlo/contacts/import'); await sp.locator('input[type=file]').waitFor();
    await sp.setInputFiles('input[type=file]', CSV);
    await sp.locator('.im-filelist__row').first().waitFor({ timeout: 20000 });
    await sp.getByText('My own relationships').first().click();
    await sp.getByRole('button', { name: 'Continue', exact: true }).click();
    await sp.getByRole('button', { name: 'Continue to fix and tag' }).click();
    await sp.getByRole('button', { name: 'Continue', exact: true }).click();
    await sp.getByRole('button', { name: /^Import \d+ (people|person)/ }).click();
    await sp.locator('h2', { hasText: 'Imported' }).waitFor();
  }
  await sp.goto(B + '/mlo/pipeline');
  if (!(await sp.getByRole('link', { name: 'Bo Park' }).count())) {
    await sp.goto(B + '/mlo/connections?sys=arive');
    await sp.locator('#arive').getByRole('button', { name: 'Make my connection address' }).click();
    const key = new URL((await sp.locator('#arive code.mlo-code').first().innerText()).trim()).searchParams.get('key') ?? '';
    await sp.request.post(B + '/api/pipeline/inbound', { headers: { 'X-CC-Key': key }, data: { loanNumber: 'L-1', borrowerFirstName: 'Bo', borrowerLastName: 'Park', borrowerPhone: '425-555-2222', loanStatus: 'Application Taken', loanPurpose: 'Purchase', applicationDate: '2026-11-17', closingDate: '2026-12-04', buyerAgentName: 'Al Agent' } });
  }
  await sp.goto(B + '/mlo/campaigns');
  if (!(await sp.locator('a.cp-row').count())) { await sp.goto(B + '/mlo/campaigns?new=1'); await sp.getByRole('button', { name: 'Use this one' }).first().click(); await sp.waitForURL(/\/mlo\/campaigns\/cmp_/); }
  await sp.goto(B + '/mlo/leads', { waitUntil: 'networkidle' });
  if (!(await sp.locator('#recent a[href^="/mlo/contacts/"]').count())) {
    await sp.locator('#add input.mlo-input').fill('Zillow');
    await sp.locator('#add').getByRole('button', { name: 'Make my connection address' }).click();
    const key = new URL((await sp.locator('#add code.mlo-code').first().innerText()).trim()).searchParams.get('key') ?? '';
    await sp.request.post(B + '/api/leads/inbound?source=Zillow', { headers: { 'X-CC-Key': key }, data: { first_name: 'Eve', last_name: 'Ng', phone: '(503) 555-2468' } });
  }
  await sp.goto(B + '/mlo/contacts?q=Lee');
  const contact = (await sp.getByRole('link', { name: /Ann Lee/ }).first().getAttribute('href')).replace(/[?#].*$/, '');
  const annId = contact.split('/').pop();
  if (!(await sp.goto(B + '/mlo/inbox?tab=all').then(() => sp.locator('.cc-thread', { hasText: 'Ann Lee' }).count()))) await sp.request.post(B + '/api/cc/dev-inbound', { data: { contactId: annId, body: 'Is the appraisal back yet?' } });
  await sp.goto(B + contact);
  const their = (await sp.locator('#their-page code').first().innerText().catch(() => '')).trim().replace(/^https?:\/\/[^/]+/, '');
  CC.push(contact, contact + '?tab=details', contact + '?tab=loan', contact + '?tab=permission', `/mlo/inbox?tab=all&c=${annId}`);
  if (their) AUTH.push(their);
} catch (e) { notes.push(`seeding the book: ${e.message.split('\n')[0]}`); }
cookies = await seedCtx.cookies();

// Phase 3: find every page (crawl at 1280, signed in; the sign-in pages signed out).
const seen = new Set();
const perRoute = new Map();
const queue = [...PUBLIC, ...AUTH, ...CC];
for (const u of queue) perRoute.set(route(u.split('?')[0]), (perRoute.get(route(u.split('?')[0])) ?? 0) + 1);
const anonCrawl = await b.newContext({ viewport: { width: 1280, height: 900 } });
const ap = await anonCrawl.newPage();
while (queue.length && seen.size < MAX) {
  const url = queue.shift();
  if (seen.has(url)) continue;
  seen.add(url);
  const page = anonPath(url) ? ap : sp;
  try { await page.goto(B + url, { waitUntil: 'domcontentloaded', timeout: 30000 }); } catch { continue; }
  const links = await page.evaluate(() => [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href'))).catch(() => []);
  for (const href of links) {
    if (!href || /^(mailto|tel|sms|javascript):/i.test(href)) continue;
    let u; try { u = new URL(href, page.url()); } catch { continue; }
    if (u.origin !== B || SKIP.some((r) => r.test(u.pathname))) continue;
    const pth = u.pathname + u.search;
    if (seen.has(pth) || queue.includes(pth)) continue;
    const rt = route(u.pathname);
    const have = perRoute.get(rt) ?? 0;
    if (have >= 3) continue;
    perRoute.set(rt, have + 1);
    queue.push(pth);
  }
}
await anonCrawl.close();
await seedCtx.close();
const pages = [...seen].filter((u) => !ONLY.length || ONLY.includes(u) || ONLY.includes(u.split('?')[0]));

// Phase 4: every page at every width (pages at once: QA_PAR), audited in every theme, then with folds open.
const extra = {
  // The phone "More" sheet and the desktop menus on Home.
  '/mlo': async (p, w, label) => {
    if (w < 900) {
      const more = p.getByRole('button', { name: /^More/ }).last();
      if (await more.count() && await more.isVisible()) { await more.click(); await p.waitForTimeout(450); await auditHere(p, label + ' (More sheet open)', w); await p.keyboard.press('Escape'); }
    } else {
      for (const m of await p.locator('.cc-bar button[aria-haspopup], .cc-bar button[aria-expanded]').all()) {
        if (!(await m.isVisible())) continue;
        const name = ((await m.innerText()) || (await m.getAttribute('aria-label')) || '').trim().split('\n')[0];
        await m.click(); await p.waitForTimeout(200);
        await auditHere(p, `${label} (menu "${name}" open)`, w);
        await p.keyboard.press('Escape'); await p.waitForTimeout(100);
      }
    }
  },
  '/': async (p, w, label) => {
    const t = p.locator('button[aria-controls][aria-expanded]').filter({ hasText: /menu/i }).first();
    const tog = (await t.count()) ? t : p.locator('header button[aria-expanded]').last();
    if (await tog.count() && await tog.isVisible()) { await tog.click(); await p.waitForTimeout(350); await auditHere(p, label + ' (menu open)', w); await p.keyboard.press('Escape'); }
  },
  '/mlo/leads': async (p, w, label) => {
    const i = p.getByRole('button', { name: 'When a lead counts as permission', exact: true });
    if (await i.count()) { await i.first().click(); await p.waitForTimeout(450); await auditHere(p, label + ' (permission i open)', w); await p.keyboard.press('Escape'); }
  },
};
const tasks = [];
for (const u of pages) for (const w of WIDTHS) tasks.push([u, w]);
const ctxs = new Map();
const getPage = async (w, anon) => {
  const k = `${w}:${anon}`;
  if (!ctxs.has(k)) { const c = await newCtx(w, !anon, cookies); ctxs.set(k, { c, free: [] }); }
  const e = ctxs.get(k);
  return e.free.pop() || e.c.newPage();
};
const putPage = (w, anon, p) => ctxs.get(`${w}:${anon}`).free.push(p);
let done = 0;
const worker = async () => {
  for (let t = tasks.shift(); t; t = tasks.shift()) {
    const [u, w] = t;
    const anon = anonPath(u);
    const p = await getPage(w, anon);
    const label = route(u);
    try {
      const r = await open(p, B + u);
      if (!r || r.status() >= 400) { if (!(r && r.status() === 404 && PUBLIC.includes(u))) notes.push(`[${u} @${w}] HTTP ${r && r.status()}`); }
      else {
        await auditHere(p, label, w);
        const n = await p.evaluate(() => { let n = 0; document.querySelectorAll('details:not([open])').forEach((d) => { d.open = true; n++; }); return n; });
        if (n) await auditHere(p, label + ' (folds open)', w);
        if (extra[u]) { await open(p, B + u); await extra[u](p, w, label); }
      }
    } catch (e) { notes.push(`[${u} @${w}] ${e.message.split('\n')[0]}`); }
    putPage(w, anon, p);
    if (++done % 100 === 0) console.log(`… ${done} page loads`);
  }
};
await Promise.all(Array.from({ length: PAR }, worker));
for (const { c } of ctxs.values()) await c.close();

// Phase 5: the import's steps (not pages of their own), walked at every width.
if (!ONLY.length || ONLY.includes('import steps')) {
  await each(async (p, w) => {
    const L = (n) => `/mlo/contacts/import (${n})`;
    await open(p, B + '/mlo/contacts/import');
    await p.setInputFiles('input[type=file]', ['past-clients-messy.csv', 'bonzo-optout.csv'].map((f) => path.join(process.cwd(), 'tests/fixtures/import', f)));
    await p.locator('.im-filelist__row').nth(1).waitFor({ timeout: 20000 });
    await p.getByText('My own relationships').first().click();
    // D93: both kinds ticked, so step 3 shows the clients and agents split.
    await p.getByRole('checkbox', { name: 'Real estate agents' }).check();
    await auditHere(p, L('1 add files'), w);
    await p.getByRole('button', { name: 'Continue', exact: true }).click(); await p.locator('.im-cols').first().waitFor({ state: 'attached' });
    await auditHere(p, L('2 columns'), w);
    for (const q of await p.locator('.im-q').all()) {
      const vals = q.locator('.im-q__value');
      if (await vals.count()) { for (const v of await vals.all()) await v.getByRole('button', { name: 'Not opted in' }).click(); } else await q.locator('.im-choice').first().click();
    }
    for (const c of await p.locator('.im-col input[type=checkbox]').all()) await c.check();
    await p.getByRole('button', { name: 'Continue to fix and tag' }).click(); await p.locator('h2', { hasText: 'ready' }).first().waitFor();
    await auditHere(p, L('3 needs a look'), w);
    // D93: Fix all with M8 (worked out on this device without a key), then closed.
    await p.getByRole('button', { name: /^(Fix all with M8|Suggest fixes for all)$/ }).click();
    await p.waitForFunction(() => !/looking at/.test(document.querySelector('#im-fixall-title')?.textContent ?? 'looking at'), null, { timeout: 30000 });
    await auditHere(p, L('3 fix all'), w);
    await p.getByRole('button', { name: 'Close the list' }).click();
    await p.getByRole('tab', { name: /^Skipped/ }).click(); await auditHere(p, L('3 skipped'), w);
    await p.getByRole('tab', { name: /^Ready/ }).click(); await auditHere(p, L('3 ready'), w);
    for (const d of await p.locator('#im-existing details').all()) if (!(await d.evaluate((x) => x.open))) await d.locator('summary').click();
    await auditHere(p, L('3 already yours'), w);
    await p.getByRole('button', { name: 'Continue', exact: true }).click(); await p.locator('h2', { hasText: 'Where did these lists come from?' }).waitFor();
    await auditHere(p, L('4 where from'), w);
    // D93: Import, then the permission dialog and the done screen.
    const cb = p.locator('.mlo-section input[type=checkbox]'); if (await cb.count()) await cb.check();
    await p.getByRole('button', { name: /^Import \d+ (people|person)/ }).click(); await p.getByRole('dialog').waitFor();
    await auditHere(p, L('5 permission dialog'), w);
    await p.keyboard.press('Escape');
    await auditHere(p, L('5 done'), w);
  });
}

// Phase 6: the coming-soon page (a second server with the site locked), with the Pilot menu open.
if (!ONLY.length || ONLY.includes('coming soon')) {
  let up = false;
  try { up = (await fetch(SOON + '/')).ok; } catch {}
  if (!up) notes.push(`coming-soon page not audited: no locked server at ${SOON} (start one with SITE_LOCK=true PORT=3101 npm start)`);
  else for (const w of WIDTHS) {
    const c = await newCtx(w, false, []);
    const p = await c.newPage();
    try {
      await open(p, SOON + '/');
      await auditHere(p, '/ (coming soon)', w);
      const pilot = p.getByRole('button', { name: /pilot/i }).first();
      if (await pilot.count()) { await pilot.click(); await p.waitForTimeout(450); await auditHere(p, '/ (coming soon, Pilot open)', w); }
      await open(p, SOON + '/demo');
      await auditHere(p, '/demo (tester password)', w);
    } catch (e) { notes.push(`[coming soon @${w}] ${e.message.split('\n')[0]}`); }
    await c.close();
  }
}

// Phase 7: the sign-in and sign-up showcase (the Concierge team tiles, D64), every QA_SWEEP_STEP px from 320 to 1440
// (default 8) in Night, Dim and Paper, so the in-between widths where the tiles change shape are covered too.
if (!ONLY.length || ONLY.includes('showcase')) {
  const step = Number(process.env.QA_SWEEP_STEP || 8);
  const c = await b.newContext({ viewport: { width: 320, height: 900 }, reducedMotion: 'reduce' });
  const p = await c.newPage();
  for (const u of ['/sign-in', '/sign-up']) {
    await open(p, B + u);
    for (let w = 320; w <= 1440; w += step) {
      await p.setViewportSize({ width: w, height: 900 });
      for (const t of ['night', 'dim', 'paper']) {
        await setTheme(p, t);
        await p.waitForTimeout(20);
        record(`${u} (showcase sweep)`, w, t, await p.evaluate(textFit));
        views++;
      }
    }
  }
  await c.close();
}

await b.close();
const list = [...findings.values()];
console.log(`audited ${pages.length} pages + opened states: ${views} views at ${WIDTHS.join('/')}px in ${THEMES.join('/')}`);
if (notes.length) console.log(`NOTES: ${notes.length}\n${notes.join('\n')}`);
if (!list.length) console.log('FINDINGS: none');
else {
  console.log(`FINDINGS: ${list.length}`);
  for (const f of list.sort((x, y) => x.page.localeCompare(y.page) || x.kind.localeCompare(y.kind))) console.log(`[${f.page} @${[...f.widths].sort((a, z) => a - z).join(',')} ${[...f.themes].join(',')}] ${f.kind}: ${f.sel} "${f.text}" (${f.detail})`);
}
process.exit(list.length ? 1 : 0);
