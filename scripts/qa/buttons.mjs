// D72 button and form alignment audit for the MLO Command Center. Needs Playwright available to
// Node and a local server on http://localhost:3100 started with:
//   CC_DEV_LOGIN=1 CC_LINK_SECRET=qa-secret MLO_OWNER_EMAIL=owner@example.com NEXT_PUBLIC_STEALTH_MODE=false PORT=3100 npm start
// It signs in, builds a small book if there is none (an import, a loan), then opens every Command
// Center page (plus the sign-in and sign-up pages) at 390px and 1280px in Night and Paper and checks:
//   - nothing wider than the screen (any visible element past the right edge that no scroll box holds;
//     html{overflow-x:clip} hides this from documentElement.scrollWidth, so body.scrollWidth is read too);
//   - nothing cut off by a box that clips it (a button, field or file picker past its card's edge);
//   - no button with a top margin inside a flex row (it sits lower than the field beside it);
//   - no button crowded right under the box or text above it (a stacked button that lost its gap);
//   - a button beside a field (in a flex row or a grid with columns) is the same height and on the same
//     bottom edge, within 1px;
//   - buttons side by side in a row are the same height;
//   - no .mlo-btn wider than 600px outside the sign-in card (a stretched submit button).
// Exits 1 on any problem. Env: QA_CHROME = a Chromium binary (optional), QA_OUT = a folder for
// full-page screenshots of the pages in SHOTS, QA_JSON = a file for every button's measurements
// (to diff a before and after run), QA_ONLY = a comma list of routes to limit the run.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

const B = 'http://localhost:3100';
const STATIC = ['/mlo', '/mlo/campaigns?new=1', '/mlo/connections?sys=arive', '/mlo/academy', '/mlo/agents', '/mlo/agents/setup', '/mlo/automations', '/mlo/calls', '/mlo/campaigns', '/mlo/cards', '/mlo/concierge', '/mlo/connections', '/mlo/contacts', '/mlo/contacts?kind=agent', '/mlo/contacts?select=all', '/mlo/contacts/import', '/mlo/contacts/import/history', '/mlo/contacts/permission', '/mlo/email', '/mlo/expenses', '/mlo/expenses/report', '/mlo/export', '/mlo/inbox', '/mlo/launch', '/mlo/leads', '/mlo/loa', '/mlo/messages', '/mlo/network', '/mlo/pilot', '/mlo/pipeline', '/mlo/pricing', '/mlo/pricing/receive', '/mlo/refi', '/mlo/refi?ref=5.75', '/mlo/report', '/mlo/rules', '/mlo/scripts', '/mlo/security', '/mlo/setup', '/mlo/setup-help', '/mlo/signature', '/mlo/signups', '/mlo/team', '/mlo/templates', '/mlo/templates?k=rebuttal', '/mlo/text-setup', '/mlo/texting', '/mlo/training', '/mlo/videos', '/mlo/voice', '/mlo/voicemail', '/mlo/welcome', '/mlo/academy/p1', '/mlo/academy/p5', '/mlo/academy/l2'];
const AUTH = ['/sign-in', '/sign-up', '/sign-up/confirm'];
const SHOTS = new Set(['/mlo/academy', '/mlo/expenses', '/mlo/contacts/permission', '/mlo/refi', '/mlo/concierge', '/mlo/team', 'contact', 'loan', '/mlo/loa', '/mlo/contacts', '/mlo/pricing', '/mlo/templates', '/mlo/scripts', '/mlo', '/sign-in', 'client page']);
// D76: audited a second time with every <details> open.
const OPEN_ALL = new Set(['/mlo', '/mlo/automations', '/mlo/concierge', '/mlo/connections', '/mlo/connections?sys=arive', '/mlo/campaigns?new=1', '/mlo/inbox', '/mlo/calls', '/mlo/agents', '/mlo/email', '/mlo/pipeline', '/mlo/videos', '/mlo/voicemail', '/mlo/cards', '/mlo/rules', '/mlo/leads']);
const out = process.env.QA_OUT || '';
if (out) fs.mkdirSync(out, { recursive: true });
const only = (process.env.QA_ONLY || '').split(',').filter(Boolean);

const CSV = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cc-btn-')), 'book.csv');
fs.writeFileSync(CSV, 'First Name,Last Name,Mobile Phone,Email,State,Contact Type,Close Date,Loan Amount,Interest Rate,Notes\nAnn,Lee,(206) 555-1234,ann@example.com,WA,Past Client,11/20/2020,"$400,000",7.25,\nBo,Park,425-555-2222,bo@example.com,WA,Past Client,3/2/2022,"$520,000",4.5,\n');

// Runs in the page: every check above, plus each button's measurements.
function audit() {
  const vw = document.documentElement.clientWidth;
  const problems = [];
  const name = (el) => {
    const t = (el.innerText || el.value || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    const c = typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
    return `${el.tagName.toLowerCase()}${c}${t ? ` "${t}"` : ''}`;
  };
  const visible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  // The nearest ancestor that scrolls or clips sideways (html and body don't count).
  const clipper = (el) => { for (let p = el.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o !== 'visible') return { el: p, o }; } return null; };
  const sw = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
  const wide = [];
  for (const el of document.querySelectorAll('body *')) {
    if (!visible(el) || el.closest('dialog:not([open]), [hidden], .cc-sheet, .sr-only')) continue;
    const r = el.getBoundingClientRect();
    if (r.right < 0) continue; // parked off screen on purpose (a honeypot field)
    const c = clipper(el);
    if (r.right > vw + 1 && !c && wide.length < 300) wide.push({ n: name(el), right: Math.round(r.right), node: el });
    // Cut off: a control past the edge of a box that clips (not one that scrolls).
    if (c && (c.o === 'hidden' || c.o === 'clip') && el.matches('button, input:not([type=hidden]), select, textarea, a.mlo-btn')) {
      const cr = c.el.getBoundingClientRect();
      if (r.right > cr.right + 1 || r.left < cr.left - 1) problems.push(`cut off: ${name(el)} (${Math.round(r.left)}–${Math.round(r.right)}) inside ${name(c.el)} (${Math.round(cr.left)}–${Math.round(cr.right)})`);
    }
  }
  // Report only the outermost element of each overflow.
  const outer = wide.filter((w) => !wide.some((o) => o !== w && o.node.contains(w.node)));
  if (sw > vw + 1 || outer.length) problems.push(`wider than the screen: sw=${sw} vw=${vw} ${outer.slice(0, 5).map((w) => `${w.n}→${w.right}`).join(', ')}`);
  const isRow = (p) => { const s = getComputedStyle(p); return (s.display === 'flex' || s.display === 'inline-flex') && s.flexDirection.startsWith('row'); };
  const CTL = 'input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not(.sr-only), select';
  const control = (el) => el.matches(CTL) ? el : el.querySelector?.(CTL);
  const btns = [...document.querySelectorAll('.mlo-btn')].filter(visible);
  const rows = new Set();
  const dump = [];
  for (const b of btns) {
    const r = b.getBoundingClientRect();
    const s = getComputedStyle(b);
    const mt = parseFloat(s.marginTop);
    // The item that sits in the row: the button itself or the one-button form around it.
    const item = b.parentElement && b.parentElement.tagName === 'FORM' && b.parentElement.children.length <= 2 && isRow(b.parentElement.parentElement) ? b.parentElement : b;
    const row = item.parentElement;
    dump.push({ t: name(b), mt, x: Math.round(r.left), y: Math.round(r.top + scrollY), w: Math.round(r.width), h: Math.round(r.height), parent: row ? getComputedStyle(row).display : '' });
    if (r.width > 600 && !b.closest('.cc-auth__card')) problems.push(`stretched: ${name(b)} is ${Math.round(r.width)}px wide`);
    // Crowded: stacked right under the box or text above it (a button that lost its gap).
    if (!(row && isRow(row)) && !b.closest('p, li, td, th, summary')) {
      let above = null;
      for (let e = item; e && e.parentElement && !e.matches('.mlo-wrap, main, body'); e = e.parentElement) {
        if (isRow(e.parentElement)) break;
        let sib = e.previousElementSibling;
        while (sib && !visible(sib)) sib = sib.previousElementSibling;
        if (sib) { above = sib; break; }
      }
      if (above) {
        const ar = above.getBoundingClientRect();
        const gap = r.top - ar.bottom;
        if (ar.bottom <= r.top + 1 && ar.left < r.right && ar.right > r.left && gap < 6) problems.push(`crowded: ${name(b)} is ${Math.round(gap)}px under ${name(above)}`);
      }
    }
    const multiGrid = row && /grid/.test(getComputedStyle(row).display) && getComputedStyle(row).gridTemplateColumns.trim().split(/\s+/).length > 1;
    if (!row || !(isRow(row) || multiGrid)) continue;
    if (isRow(row)) {
      if (mt > 0.5) problems.push(`top margin in a row: ${name(b)} has margin-top ${mt}px`);
      rows.add(row);
    }
    // A field beside it on the same line: same height, same bottom.
    for (const sib of row.children) {
      if (sib === item) continue;
      const ctl = control(sib);
      if (!ctl || !visible(ctl)) continue;
      const cr = ctl.getBoundingClientRect();
      if (cr.bottom < r.top || cr.top > r.bottom) continue; // wrapped onto another line
      if (Math.abs(cr.height - r.height) > 1) problems.push(`height: ${name(b)} is ${Math.round(r.height)}px, ${name(ctl)} beside it is ${Math.round(cr.height)}px`);
      if (Math.abs(cr.bottom - r.bottom) > 1) problems.push(`not lined up: ${name(b)} bottom ${Math.round(r.bottom)}, ${name(ctl)} bottom ${Math.round(cr.bottom)}`);
    }
  }
  // Buttons side by side in a row: one height per line.
  for (const row of rows) {
    const lines = new Map();
    for (const k of row.children) {
      const b = k.matches('.mlo-btn') ? k : k.tagName === 'FORM' && k.querySelector(':scope > .mlo-btn');
      if (!b || !visible(b)) continue;
      const r = b.getBoundingClientRect();
      const key = Math.round(r.top / 8);
      const l = lines.get(key) || []; l.push({ b, h: Math.round(r.height), top: Math.round(r.top) }); lines.set(key, l);
    }
    for (const l of lines.values()) {
      if (l.length < 2) continue;
      const hs = l.map((x) => x.h), ts = l.map((x) => x.top);
      if (Math.max(...hs) - Math.min(...hs) > 1 || Math.max(...ts) - Math.min(...ts) > 1) problems.push(`uneven row: ${l.map((x) => `${name(x.b)} ${x.h}px@${x.top}`).join(' / ')}`);
    }
  }
  return { problems, dump, height: document.documentElement.scrollHeight };
}

(async () => {
  const b = await chromium.launch({ executablePath: process.env.QA_CHROME || undefined });
  const problems = [];
  const json = {};
  let total = 0;
  // Seed once (signed in), and find a contact and a loan.
  const seed = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const sp = await seed.newPage();
  await sp.goto(B + '/api/cc/dev-login?email=owner@example.com');
  await sp.goto(B + '/mlo/contacts');
  if (!(await sp.locator('a[href^="/mlo/contacts/c"], a[href*="/mlo/contacts/"]').filter({ hasText: 'Lee' }).count())) {
    await sp.goto(B + '/mlo/contacts/import'); await sp.locator('input[type=file]').waitFor();
    await sp.setInputFiles('input[type=file]', CSV);
    // D74: the four steps (this file has no questions).
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
    // D76: connection addresses are made on Connections (the key rides in the address).
    await sp.goto(B + '/mlo/connections?sys=arive');
    await sp.locator('#arive').getByRole('button', { name: 'Make my connection address' }).click();
    const key = new URL((await sp.locator('#arive code.mlo-code').first().innerText()).trim()).searchParams.get('key') ?? '';
    await sp.request.post(B + '/api/pipeline/inbound', { headers: { 'X-CC-Key': key }, data: { loanNumber: 'L-1', borrowerFirstName: 'Bo', borrowerLastName: 'Park', borrowerPhone: '425-555-2222', loanStatus: 'Application Taken', loanPurpose: 'Purchase', applicationDate: '2026-11-17', closingDate: '2026-12-04', buyerAgentName: 'Al Agent' } });
    await sp.goto(B + '/mlo/pipeline');
  }
  const loan = (await sp.getByRole('link', { name: 'Bo Park' }).first().getAttribute('href')).replace(/[?#].*$/, '');
  await sp.goto(B + '/mlo/contacts?q=Lee');
  const contact = (await sp.getByRole('link', { name: /Ann Lee/ }).first().getAttribute('href')).replace(/[?#].*$/, '');
  // The client's own page (needs CC_LINK_SECRET); opened signed out, like a client would.
  await sp.goto(B + contact);
  const their = (await sp.locator('#their-page code').first().innerText().catch(() => '')).trim().replace(/^https?:\/\/[^/]+/, '');
  const cookies = await seed.cookies();
  await seed.close();
  const routes = [...STATIC.map((r) => [r, r]), ['contact', contact], ['loan', loan], ['loan forms', loan + '/forms'], ...AUTH.map((r) => [r, r]), ...(their ? [['client page', their]] : [])].filter(([k]) => !only.length || only.includes(k));

  for (const theme of ['night', 'paper']) for (const w of [390, 1280]) {
    const signedIn = await b.newContext({ viewport: { width: w, height: 900 } });
    await signedIn.addCookies(cookies);
    const anon = await b.newContext({ viewport: { width: w, height: 900 } });
    for (const c of [signedIn, anon]) await c.addInitScript((t) => { try { localStorage.setItem('loanm8.theme', t); } catch {} }, theme);
    const pages = { in: await signedIn.newPage(), out: await anon.newPage() };
    for (const [label, url] of routes) {
      const page = AUTH.includes(label) || label === 'client page' ? pages.out : pages.in;
      const where = `${label} @${w} ${theme}`;
      try {
        const r = await page.goto(B + url, { waitUntil: 'networkidle' });
        if (!r || r.status() >= 400) { problems.push(`[${where}] status ${r && r.status()}`); continue; }
        await page.waitForTimeout(150);
        const res = await page.evaluate(audit);
        total++;
        for (const p of [...new Set(res.problems)]) problems.push(`[${where}] ${p}`);
        json[where] = { height: res.height, buttons: res.dump };
        // D76: pages whose work sits in folds are audited again with every fold open.
        if (OPEN_ALL.has(label)) {
          await page.evaluate(() => document.querySelectorAll('details').forEach((d) => { d.open = true; }));
          await page.waitForTimeout(100);
          const all = await page.evaluate(audit);
          total++;
          for (const p of [...new Set(all.problems)]) problems.push(`[${where} folds open] ${p}`);
        }
        if (out && SHOTS.has(label)) await page.screenshot({ path: path.join(out, `${label.replace(/\W+/g, '_').replace(/^_|_$/g, '') || 'home'}-${w}-${theme}.png`), fullPage: true });
      } catch (e) { problems.push(`[${where}] FAILED: ${e.message.split('\n')[0]}`); }
    }
    // D74: the import's steps aren't pages of their own, so they're walked here and audited at each step.
    if (!only.length || only.includes('import steps')) {
      const page = pages.in;
      const where = (n) => `import ${n} @${w} ${theme}`;
      const check = async (n) => { await page.waitForTimeout(150); const res = await page.evaluate(audit); total++; for (const p of [...new Set(res.problems)]) problems.push(`[${where(n)}] ${p}`); json[where(n)] = { height: res.height, buttons: res.dump }; };
      try {
        await page.goto(B + '/mlo/contacts/import', { waitUntil: 'networkidle' });
        await page.setInputFiles('input[type=file]', ['past-clients-messy.csv', 'bonzo-optout.csv'].map((f) => path.join(process.cwd(), 'tests/fixtures/import', f)));
        await page.locator('.im-filelist__row').nth(1).waitFor({ timeout: 20000 });
        await page.getByText('My own relationships').first().click();
        await check('1 add files');
        await page.getByRole('button', { name: 'Continue', exact: true }).click(); await page.locator('.im-cols').first().waitFor({ state: 'attached' });
        await check('2 columns');
        for (const q of await page.locator('.im-q').all()) {
          const vals = q.locator('.im-q__value');
          if (await vals.count()) { for (const v of await vals.all()) await v.getByRole('button', { name: 'Not opted in' }).click(); } else await q.locator('.im-choice').first().click();
        }
        for (const c of await page.locator('.im-col input[type=checkbox]').all()) await c.check();
        await check('2 answered');
        await page.getByRole('button', { name: 'Continue to fix and tag' }).click(); await page.locator('h2', { hasText: 'ready' }).first().waitFor();
        await check('3 needs a look');
        await page.getByRole('button', { name: 'Fix with M8' }).click(); await page.locator('.im-fix').waitFor();
        await check('3 fix with M8');
        await page.getByRole('tab', { name: /^Skipped/ }).click(); await check('3 skipped');
        await page.getByRole('tab', { name: /^Ready/ }).click(); await check('3 ready');
        // D75: people you already have (the book has these from earlier runs), with every review list open.
        await page.waitForFunction(() => /already in your contacts/.test(document.querySelector('#im-existing .mlo-note')?.textContent || ''), null, { timeout: 15000 }).catch(() => null);
        for (const d of await page.locator('#im-existing details').all()) if (!(await d.evaluate((x) => x.open))) await d.locator('summary').click();
        await check('3 already yours');
        await page.getByRole('button', { name: 'Continue', exact: true }).click(); await page.locator('h2', { hasText: 'Where did these lists come from?' }).waitFor();
        await check('4 where from');
        const cb = page.locator('.mlo-section input[type=checkbox]'); if (await cb.count()) await cb.check();
        await page.getByRole('button', { name: /^Import \d+/ }).click(); await page.locator('h2', { hasText: 'Imported' }).waitFor();
        await check('5 done');
        await page.locator('.im-undo summary').click(); await check('5 done, undo open');
        const imp = (/import=(imp_[\w-]+)/.exec(await page.getByRole('link', { name: /See these people/ }).getAttribute('href')) || [])[1];
        for (const [n, url] of [['import people', `/mlo/contacts?import=${imp}`], ['import checks', `/mlo/contacts/permission?import=${imp}`], ['import campaign', `/mlo/campaigns?import=${imp}`]]) {
          await page.goto(B + url, { waitUntil: 'networkidle' }); await check(n);
        }
        await page.goto(B + '/mlo/contacts/import/history', { waitUntil: 'networkidle' });
        await page.locator('.im-history__run summary').first().click(); await check('history, undo open');
      } catch (e) { problems.push(`[${where('steps')}] FAILED: ${e.message.split('\n')[0]}`); }
    }
    await signedIn.close(); await anon.close();
  }
  if (process.env.QA_JSON) fs.writeFileSync(process.env.QA_JSON, JSON.stringify(json, null, 1));
  console.log(`checked ${total} page views (${routes.length} pages × 390/1280 × Night/Paper)`);
  console.log('\nPROBLEMS:', problems.length ? `${problems.length}\n` + problems.join('\n') : 'none');
  await b.close();
  process.exit(problems.length ? 1 : 0);
})();
