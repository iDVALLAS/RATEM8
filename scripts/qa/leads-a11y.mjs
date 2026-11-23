// D87 accessibility audit for Lead sources (D81–D86). Needs Playwright available to Node and a local server on
// http://localhost:3100 started with:
//   CC_DEV_LOGIN=1 CC_LINK_SECRET=qa-secret MLO_OWNER_EMAIL=owner@example.com NEXT_PUBLIC_STEALTH_MODE=false PORT=3100 npm start
// It signs in as the owner, adds a fresh loan officer (a new email each run, so example mode is always there to
// audit whatever the server already holds) and audits, as that loan officer:
//   - /mlo/leads in example mode (no leads yet), the i pop-up open;
//   - /mlo/leads in real mode (after 12 leads and a confirmed Zillow expense), a row's i open, and an answer card
//     from Ask your Concierge with Show the math open;
//   - /mlo/leads/plan (the budget planner, every fold open);
//   - /mlo/expenses with a draft whose Lead source picker shows;
// at 390px and 1280px in Night, Dim and Paper. On each it checks:
//   - every interactive element has a name a screen reader can read (aria-label, aria-labelledby, its label or text);
//   - every tap target (buttons, fields, selects, folds, button-like links, links standing on their own) is at least
//     44px tall and 44px wide; a link inside a sentence is exempt (WCAG 2.5.5's inline exception) and counted;
//   - every visible piece of text has contrast of at least 4.5:1 against what's behind it (ancestors' backgrounds
//     composited, the worst stop of any gradient, ancestors' opacity applied); disabled controls are exempt (WCAG
//     1.4.3) and reported on their own;
//   - nothing is wider than the screen;
// and, by keyboard only (Tab, Shift+Tab, Enter, Escape): the i opens with Enter, focus moves inside, Tab stays inside,
// Escape closes it and gives focus back; the period switch ("Period": 30 days, 90 days, This year) works from the
// keyboard and says which is pressed; the planner's presets ("Monthly lead budget presets") work the same way; the
// focused control always shows a focus ring. Exits 1 on any problem. Env: QA_CHROME = a Chromium binary (optional),
// QA_OUT = a folder for screenshots, QA_JSON = a file for the numbers.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const B = 'http://localhost:3100';
const OUT = process.env.QA_OUT || '';
if (OUT) fs.mkdirSync(OUT, { recursive: true });
const THEMES = ['night', 'dim', 'paper'];
const WIDTHS = [390, 1280];

// Runs in the page: names, targets, contrast and overflow for `main` and any open dialog.
function audit() {
  const problems = [];
  const stats = { controls: 0, targets: 0, inlineLinks: 0, texts: 0, minContrast: Infinity, minAt: '', disabledMin: Infinity, disabledTexts: 0, gradientTexts: 0 };
  const cv = document.createElement('canvas');
  cv.width = cv.height = 1;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  const rgba = (css) => {
    cx.clearRect(0, 0, 1, 1);
    cx.fillStyle = '#000';
    cx.fillStyle = css;
    cx.fillRect(0, 0, 1, 1);
    const d = cx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2], d[3] / 255];
  };
  const over = (top, bottom) => { const a = top[3]; return [top[0] * a + bottom[0] * (1 - a), top[1] * a + bottom[1] * (1 - a), top[2] * a + bottom[2] * (1 - a), 1]; };
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const visible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && !el.closest('[hidden], details:not([open]) > :not(summary)'); };
  const label = (el) => { const t = (el.innerText || el.value || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 40); return `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${t ? ` "${t}"` : ''}`; };
  // The backgrounds behind an element, as the candidate colors it may sit on (the worst gradient stop counts).
  const backs = (el) => {
    const layers = [];
    for (let p = el; p; p = p.parentElement) {
      const s = getComputedStyle(p);
      const img = s.backgroundImage && s.backgroundImage !== 'none' ? (s.backgroundImage.match(/(rgba?|color|oklch|oklab|hsla?|lab|lch)\([^()]*(\([^()]*\)[^()]*)*\)/g) || []) : [];
      const bg = rgba(s.backgroundColor);
      layers.push({ bg, stops: img.map(rgba) });
      if (bg[3] >= 1 && !img.length) break;
    }
    let bases = [[255, 255, 255, 1]];
    let gradient = false;
    for (const l of layers.reverse()) {
      if (l.bg[3] > 0) bases = bases.map((b) => over(l.bg, b));
      if (l.stops.length) { gradient = true; bases = bases.flatMap((b) => l.stops.map((s) => over(s, b))); }
    }
    return { bases, gradient };
  };
  const opacity = (el) => { let o = 1; for (let p = el; p; p = p.parentElement) o *= parseFloat(getComputedStyle(p).opacity || '1'); return o; };
  const scopes = [...document.querySelectorAll('main, [role=dialog]')].filter(visible);
  const inScope = (el) => scopes.some((s) => s.contains(el));
  const all = scopes.flatMap((s) => [...s.querySelectorAll('*')]);

  // Names and tap targets.
  const nameOf = (el) => {
    const by = el.getAttribute('aria-labelledby');
    if (by) return by.split(/\s+/).map((id) => document.getElementById(id)?.textContent || '').join(' ').trim();
    if (el.getAttribute('aria-label')) return el.getAttribute('aria-label').trim();
    if (el.labels && el.labels.length) return [...el.labels].map((l) => l.textContent).join(' ').trim();
    if (el.tagName === 'INPUT' && ['submit', 'button'].includes(el.type)) return el.value.trim();
    if (el.getAttribute('title')) return el.getAttribute('title').trim();
    return (el.innerText || el.textContent || '').trim();
  };
  const CONTROLS = 'a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [tabindex]:not([tabindex="-1"])';
  for (const el of new Set(all.filter((x) => x.matches(CONTROLS)))) {
    if (!visible(el) || el.closest('.sr-only, [aria-hidden=true]')) continue;
    if (el.matches('input[type=checkbox], input[type=radio]') && el.closest('label')) continue; // the label is the target
    stats.controls++;
    if (!nameOf(el)) problems.push(`no name: ${label(el)} (${el.outerHTML.slice(0, 80)})`);
    const r = el.getBoundingClientRect();
    // A link inside a sentence (a paragraph or list item with at least a short sentence of its own words around it)
    // is exempt from the size rule (WCAG 2.5.5's inline exception). A name in a table row or a link on its own isn't.
    if (el.tagName === 'A' && !el.matches('.mlo-btn, .cc-row__go, [role=button]') && getComputedStyle(el).display === 'inline') {
      const block = el.closest('p, li, dd');
      const words = block ? [...block.childNodes].filter((n) => n.nodeType === 3 || (n.nodeType === 1 && !n.matches('a, button'))).map((n) => n.textContent).join(' ').replace(/[\s·|]+/g, ' ').trim() : '';
      if (words.length >= 25) { stats.inlineLinks++; continue; }
    }
    stats.targets++;
    if (r.height < 43.5 || r.width < 43.5) problems.push(`small target ${Math.round(r.width)}×${Math.round(r.height)}: ${label(el)}`);
  }

  // Contrast of every visible piece of text.
  for (const el of all) {
    if (!visible(el) || el.closest('.sr-only, [aria-hidden=true], svg')) continue;
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!own) continue;
    const s = getComputedStyle(el);
    if (parseFloat(s.fontSize) === 0 || s.color === 'transparent' || s.webkitTextFillColor === 'rgba(0, 0, 0, 0)') continue;
    const fg = rgba(s.color);
    const alpha = fg[3] * opacity(el);
    const { bases, gradient } = backs(el);
    const worst = Math.min(...bases.map((b) => ratio(over([fg[0], fg[1], fg[2], alpha], b), b)));
    const disabled = !!el.closest('button:disabled, input:disabled, select:disabled, textarea:disabled, [aria-disabled=true]');
    const text = el.textContent.trim().replace(/\s+/g, ' ').slice(0, 50);
    if (disabled) { stats.disabledTexts++; stats.disabledMin = Math.min(stats.disabledMin, worst); continue; }
    stats.texts++;
    if (gradient) stats.gradientTexts++;
    if (worst < stats.minContrast) { stats.minContrast = worst; stats.minAt = text; }
    if (worst < 4.5) problems.push(`contrast ${worst.toFixed(2)}:1 "${text}" (${s.color} at ${s.fontSize})`);
  }

  // Nothing wider than the screen.
  const vw = document.documentElement.clientWidth;
  const sw = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
  if (sw > vw + 1) problems.push(`wider than the screen: ${sw} > ${vw}`);
  stats.minContrast = Number.isFinite(stats.minContrast) ? Math.round(stats.minContrast * 100) / 100 : null;
  stats.disabledMin = Number.isFinite(stats.disabledMin) ? Math.round(stats.disabledMin * 100) / 100 : null;
  return { problems: problems.filter((p, i, a) => a.indexOf(p) === i), stats, inScope: inScope(document.body) };
}

(async () => {
  const b = await chromium.launch({ executablePath: process.env.QA_CHROME || undefined });
  const problems = [];
  const numbers = [];
  let where = 'start';
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push(`[${where}] pageerror: ${e.message}`));
  page.on('response', (r) => { if (r.status() >= 500) problems.push(`[${where}] HTTP ${r.status()} ${r.url()}`); });
  const step = async (name, fn) => { where = name; try { await fn(); } catch (e) { problems.push(`[${name}] FAILED: ${e.message.split('\n')[0]}`); } };

  // A fresh loan officer for this run.
  const email = `a11y-${Date.now()}@example.com`;
  await step('setup: a fresh loan officer', async () => {
    await page.goto(B + '/api/cc/dev-login?email=owner@example.com');
    await page.goto(B + '/mlo/team');
    await page.locator('input[name=name]').fill('Robin A11y');
    await page.locator('input[name=email]').fill(email);
    await page.locator('form select[name=role]').first().selectOption('lo');
    await page.getByRole('button', { name: 'Add and email a sign-in link' }).click();
    await page.waitForURL(/f=/);
    await ctx.clearCookies();
    const r = await page.goto(B + `/api/cc/dev-login?email=${encodeURIComponent(email)}`);
    if (!r || r.status() >= 400) throw new Error('could not sign in as the new loan officer');
  });

  // Runs the audit on the page as it is now, and keeps the numbers.
  // A bottom sheet slides up (420ms): measure it once it has arrived, not mid-slide.
  const settle = () => page.waitForFunction(() => [...document.querySelectorAll('[role=dialog]')].every((d) => d.getAnimations({ subtree: true }).every((x) => x.playState !== 'running')), null, { timeout: 5000 }).catch(() => {});
  const check = async (name, theme, w, shot = true) => {
    await settle();
    const r = await page.evaluate(audit);
    for (const p of r.problems) problems.push(`[${name} @${w} ${theme}] ${p}`);
    numbers.push({ page: name, theme, width: w, ...r.stats, problems: r.problems.length });
    if (OUT && shot) await page.screenshot({ path: path.join(OUT, `${name.replace(/\W+/g, '-')}-${w}-${theme}.png`), fullPage: true });
  };
  // Each theme and width, through the same page and its open states.
  const sweep = async (name, url, states = []) => {
    for (const theme of THEMES) for (const w of WIDTHS) {
      where = `${name} @${w} ${theme}`;
      try {
        await page.evaluate((t) => { try { localStorage.setItem('loanm8.theme', t); } catch {} }, theme).catch(() => {});
        await page.setViewportSize({ width: w, height: w < 640 ? 844 : 900 });
        await page.goto(B + url);
        if ((await page.evaluate(() => document.documentElement.dataset.theme)) !== theme) problems.push(`[${where}] theme did not apply`);
        await page.evaluate(() => document.querySelectorAll('main details').forEach((d) => { d.open = true; }));
        await check(name, theme, w);
        for (const [sname, open, close] of states) {
          await open();
          await check(`${name} ${sname}`, theme, w);
          if (close) await close();
        }
      } catch (e) {
        problems.push(`[${where}] FAILED: ${e.message.split('\n')[0]}`);
      }
    }
  };

  const active = () => page.evaluate(() => { const a = document.activeElement; return a ? { tag: a.tagName, text: (a.getAttribute('aria-label') || a.innerText || '').trim().slice(0, 60), inDialog: !!a.closest('[role=dialog]'), pressed: a.getAttribute('aria-pressed'), ring: [a, ...a.querySelectorAll('*')].some((el) => { const s = getComputedStyle(el); return (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) || (s.boxShadow && s.boxShadow !== 'none'); }) } : null; });
  // Tab (by keyboard only) until the focused element matches, at most `max` presses.
  const tabTo = async (test, max = 250) => {
    for (let i = 0; i < max; i++) {
      await page.keyboard.press('Tab');
      const a = await active();
      if (a && !a.ring && a.tag !== 'BODY') problems.push(`[${where}] no focus ring on ${a.tag} "${a.text}"`);
      if (a && test(a)) return { a, presses: i + 1 };
    }
    throw new Error('could not reach it with Tab');
  };
  const fromTop = async () => { await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); }); await page.locator('body').click({ position: { x: 1, y: 1 } }).catch(() => {}); };

  // The i, by keyboard: Enter opens it with focus inside, Tab stays inside, Escape closes it and gives focus back.
  const keyboardTip = async (name, test) => {
    await fromTop();
    const { a, presses } = await tabTo(test);
    await page.keyboard.press('Enter');
    const dlg = page.locator('[role=dialog]');
    await dlg.waitFor();
    const opened = await active();
    if (!opened?.inDialog) problems.push(`[${name}] focus did not move into the pop-up`);
    if (!(await dlg.getAttribute('aria-labelledby')) && !(await dlg.getAttribute('aria-label'))) problems.push(`[${name}] the pop-up has no name`);
    for (let i = 0; i < 6; i++) { await page.keyboard.press('Tab'); if (!(await active())?.inDialog) { problems.push(`[${name}] Tab left the pop-up`); break; } }
    for (let i = 0; i < 3; i++) { await page.keyboard.press('Shift+Tab'); if (!(await active())?.inDialog) { problems.push(`[${name}] Shift+Tab left the pop-up`); break; } }
    await page.keyboard.press('Escape');
    await dlg.waitFor({ state: 'detached' }).catch(() => problems.push(`[${name}] Escape did not close the pop-up`));
    const back = await active();
    if (back?.text !== a.text) problems.push(`[${name}] focus did not come back to the i (on "${back?.text}")`);
    console.log(`${name}: reached "${a.text}" in ${presses} Tabs; Enter opened it, focus inside, Escape back on the i`);
  };

  // ---- 1. example mode ----
  const tipOpen = async () => { await page.locator('#add button[aria-haspopup=dialog]').first().click(); await page.locator('[role=dialog]').waitFor(); };
  const tipClose = async () => { await page.keyboard.press('Escape'); };
  await step('example: what it is', async () => {
    await page.goto(B + '/mlo/leads');
    const ex = await page.locator('main .cc-ex').count();
    if (ex < 3) throw new Error(`expected the example sections, saw ${ex} EXAMPLE labels`);
  });
  await sweep('leads example', '/mlo/leads', [['tip open', tipOpen, tipClose]]);
  await step('example: keyboard', async () => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(B + '/mlo/leads');
    where = 'example keyboard i';
    await keyboardTip(where, (a) => /When a lead counts as permission/.test(a.text) && a.tag === 'BUTTON');
    // The example period switch is named and says which is pressed, and its buttons are disabled (no pretend actions).
    const group = page.getByRole('group', { name: 'Period' });
    const pressed = await group.locator('button[aria-pressed=true]').allInnerTexts();
    if (pressed.length !== 1) problems.push(`[example] period switch pressed: ${pressed.join(',')}`);
    if ((await group.locator('button:not([disabled])').count()) !== 0) problems.push('[example] example period buttons can be pressed');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(B + '/mlo/leads');
    where = 'example keyboard i @390';
    await keyboardTip(where, (a) => /When a lead counts as permission/.test(a.text) && a.tag === 'BUTTON');
  });

  // ---- 2. real mode: leads, spend, an answer ----
  await step('real: leads and spend', async () => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(B + '/mlo/pipeline');
    await page.getByRole('link', { name: 'Connect your loan system' }).click();
    await page.waitForURL(/sys=arive/);
    await page.locator('#arive').getByRole('button', { name: 'Make my connection address' }).click();
    const key = new URL((await page.locator('#arive code.mlo-code').first().innerText()).trim()).searchParams.get('key') ?? '';
    if (!key) throw new Error('no connection key');
    for (let i = 0; i < 12; i++) await page.request.post(B + '/api/leads/inbound?source=Zillow', { headers: { 'X-CC-Key': key }, data: { first_name: `Ari${i}`, last_name: 'Lane', phone: `(503) 555-41${String(10 + i)}`, lead_id: `A11Y-Z-${i}` } });
    for (let i = 0; i < 3; i++) await page.request.post(B + '/api/leads/inbound?source=LendingTree', { headers: { 'X-CC-Key': key }, data: { first_name: `Bea${i}`, last_name: 'Moss', phone: `(503) 555-42${String(10 + i)}`, lead_id: `A11Y-L-${i}` } });
    await page.goto(B + '/mlo/expenses');
    await page.locator('#tell textarea').fill('Zillow leads $1,200 yesterday');
    await page.locator('#tell').getByRole('button', { name: 'Add', exact: true }).click();
    await page.locator('#drafts .cc-card').first().waitFor();
    await page.locator('#drafts .cc-card').first().getByRole('button', { name: 'Confirm' }).click();
    await page.waitForURL(/expenses/);
    // A second draft stays, so Expenses shows the Lead source picker for the audit.
    await page.locator('#tell textarea').fill('Bankrate leads $300 today');
    await page.locator('#tell').getByRole('button', { name: 'Add', exact: true }).click();
    await page.locator('#drafts .cc-card').first().waitFor();
    await page.goto(B + '/mlo/leads');
    if (await page.locator('#scorecard .cc-ex').count()) throw new Error('the scorecard is still an example');
  });
  const rowTipOpen = async () => { await page.locator('#recent button[aria-haspopup=dialog]').first().click(); await page.locator('[role=dialog]').waitFor(); };
  const answerOpen = async () => {
    await page.locator('#ask').getByRole('button', { name: 'Which vendors don’t give me permission?' }).click();
    await page.locator('#ask .cc-leadans').waitFor();
    await page.locator('#ask .cc-leadans').getByRole('button', { name: 'Show the math' }).click();
  };
  await sweep('leads real', '/mlo/leads', [['row tip open', rowTipOpen, tipClose], ['answer open', answerOpen, null]]);
  await step('real: keyboard', async () => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(B + '/mlo/leads');
    where = 'real keyboard row i';
    await keyboardTip(where, (a) => /^Why no permission yet for /.test(a.text) && a.tag === 'BUTTON');
    // The period switch: a group named "Period", three named buttons, the pressed one said; Enter on another switches it.
    where = 'real keyboard period';
    const names = await page.getByRole('group', { name: 'Period' }).getByRole('button').allInnerTexts();
    if (names.join('|') !== '30 days|90 days|This year') problems.push(`[period] buttons: ${names.join('|')}`);
    await fromTop();
    const { a } = await tabTo((x) => x.text === '30 days' && x.tag === 'BUTTON');
    if (a.pressed !== 'false') problems.push(`[period] 30 days pressed before Enter: ${a.pressed}`);
    await page.keyboard.press('Enter');
    await page.waitForURL(/period=30d/);
    const now30 = await page.getByRole('group', { name: 'Period' }).getByRole('button', { name: '30 days' }).getAttribute('aria-pressed');
    if (now30 !== 'true') problems.push('[period] 30 days not pressed after Enter');
    await fromTop();
    await tabTo((x) => x.text === 'This year' && x.tag === 'BUTTON');
    await page.keyboard.press(' ');
    await page.waitForURL(/period=year/);
    if ((await page.getByRole('group', { name: 'Period' }).getByRole('button', { name: 'This year' }).getAttribute('aria-pressed')) !== 'true') problems.push('[period] This year not pressed after Space');
    console.log('real keyboard: period switch by Enter and Space');
    // Show the math by keyboard: aria-expanded flips.
    where = 'real keyboard math';
    await page.goto(B + '/mlo/leads');
    await page.locator('#ask').getByRole('button', { name: 'Which source should I add next?' }).focus();
    await page.keyboard.press('Enter');
    await page.locator('#ask .cc-leadans').waitFor();
    const math = page.locator('#ask .cc-leadans').getByRole('button', { name: 'Show the math' });
    await math.focus();
    await page.keyboard.press('Enter');
    if ((await page.locator('#ask .cc-leadans button[aria-controls=leads-math]').getAttribute('aria-expanded')) !== 'true') problems.push('[math] aria-expanded did not turn true');
  });

  // ---- 3. the planner ----
  await sweep('planner', '/mlo/leads/plan');
  await step('planner: keyboard', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(B + '/mlo/leads/plan');
    where = 'planner keyboard presets';
    const group = page.getByRole('group', { name: 'Monthly lead budget presets' });
    const names = await group.getByRole('button').allInnerTexts();
    if (names.join('|') !== '$750 a month|$1,500 a month|$3,000 a month') problems.push(`[presets] buttons: ${names.join('|')}`);
    const pressed = await group.locator('button[aria-pressed=true]').allInnerTexts();
    if (pressed.join() !== '$1,500 a month') problems.push(`[presets] pressed: ${pressed.join(',')}`);
    await fromTop();
    await tabTo((x) => x.text === '$3,000 a month' && x.tag === 'BUTTON');
    await page.keyboard.press('Enter');
    await page.waitForURL(/budget=3000/);
    if ((await group.getByRole('button', { name: '$3,000 a month' }).getAttribute('aria-pressed')) !== 'true') problems.push('[presets] $3,000 not pressed after Enter');
    if (!/\$3,000/.test(await page.locator('#split h2').innerText())) problems.push('[presets] the split did not follow the preset');
    console.log('planner keyboard: presets by Enter, $3,000 pressed');
  });

  // ---- 4. Expenses with the Lead source picker ----
  await step('expenses: the picker', async () => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(B + '/mlo/expenses');
    const pick = page.locator('#drafts select[name=leadSource]').first();
    if (!(await pick.count())) throw new Error('no Lead source picker on the draft');
    const name = await pick.evaluate((el) => (el.labels && el.labels.length ? el.labels[0].textContent : el.getAttribute('aria-label') || '').trim());
    if (!/Lead source/.test(name)) problems.push(`[expenses] the picker's name: "${name}"`);
    console.log('expenses: picker named', JSON.stringify(name), 'selected', await pick.inputValue());
  });
  await sweep('expenses', '/mlo/expenses');

  if (process.env.QA_JSON) fs.writeFileSync(process.env.QA_JSON, JSON.stringify(numbers, null, 2));
  const by = (k) => numbers.reduce((m, n) => (n[k] !== null && n[k] < m ? n[k] : m), Infinity);
  console.log(`\naudited ${numbers.length} page views: ${numbers.reduce((n, x) => n + x.controls, 0)} controls named, ${numbers.reduce((n, x) => n + x.targets, 0)} tap targets measured (${numbers.reduce((n, x) => n + x.inlineLinks, 0)} links inside sentences exempt), ${numbers.reduce((n, x) => n + x.texts, 0)} texts for contrast (lowest ${by('minContrast').toFixed(2)}:1; disabled controls' lowest ${Number.isFinite(by('disabledMin')) ? by('disabledMin').toFixed(2) : '—'}:1, exempt)`);
  for (const t of THEMES) console.log(`  ${t}: lowest text contrast ${numbers.filter((n) => n.theme === t).reduce((m, n) => (n.minContrast !== null && n.minContrast < m ? n.minContrast : m), Infinity).toFixed(2)}:1`);
  console.log('\nPROBLEMS:', problems.length ? '\n' + problems.join('\n') : 'none');
  await b.close();
  process.exit(problems.length ? 1 : 0);
})();
