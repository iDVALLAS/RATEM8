// MLO Command Center QA sweep (D28). Needs Playwright available to Node and a local
// server on http://localhost:3100 started with:
//   CC_DEV_LOGIN=1 CC_LINK_SECRET=qa-secret MLO_OWNER_EMAIL=owner@example.com NEXT_PUBLIC_STEALTH_MODE=false PORT=3100 npm start
// It builds a small book (imports, a loan through the loan-system webhook, a lead), opens every
// Command Center page at 390px and 1280px (status, console errors, overflow, one h1), then runs the
// main flow on each screen. Exits 1 on any problem. Env: QA_CHROME = a Chromium binary (optional).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
const B = 'http://localhost:3100';
const CSV = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cc-qa-')), 'book.csv');
fs.writeFileSync(CSV, 'First Name,Last Name,Mobile Phone,Email,State,Contact Type,Close Date,Loan Amount,Interest Rate,Notes\nAnn,Lee,(206) 555-1234,ann@example.com,WA,Past Client,11/20/2020,"$400,000",7.25,\nBo,Park,425-555-2222,bo@example.com,WA,Past Client,3/2/2022,"$520,000",4.5,Planning a kitchen remodel next year.\nCy,Ng,253-555-7777,,WA,Lead,,,,\n');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.QA_CHROME || undefined });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const problems = [];
  let where = 'start';
  page.on('pageerror', (e) => problems.push(`[${where}] pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/_vercel\/insights/.test(m.text()) && !/404 \(Not Found\)/.test(m.text())) problems.push(`[${where}] console: ${m.text().slice(0, 200)}`); });
  page.on('response', (r) => { if (r.status() >= 500) problems.push(`[${where}] HTTP ${r.status()} ${r.url()}`); });
  const flash = async () => (await page.locator('.mlo-flash').first().innerText().catch(() => '(no flash)')).replace(/\n/g, ' | ').slice(0, 160);
  const step = async (name, fn) => { where = name; try { await fn(); } catch (e) { problems.push(`[${name}] FAILED: ${e.message.split('\n')[0]}`); } };
  // D74: the import's four steps. After the files are added: pick the source, Continue, answer every question
  // (first choice; consent values "Not opted in"; tick opt-out columns), Continue twice, confirm opt-ins, Import.
  const toColumns = async () => { await page.locator('.im-filelist__row').first().waitFor({ timeout: 20000 }); await page.getByText('My own relationships').first().click(); await page.getByRole('button', { name: 'Continue', exact: true }).click(); await page.locator('.im-cols').first().waitFor({ state: 'attached' }); };
  const answerAll = async () => {
    for (const q of await page.locator('.im-q').all()) {
      const vals = q.locator('.im-q__value');
      if (await vals.count()) { for (const v of await vals.all()) await v.getByRole('button', { name: 'Not opted in' }).click(); }
      else await q.locator('.im-choice').first().click();
    }
    for (const c of await page.locator('.im-col input[type=checkbox]').all()) await c.check();
  };
  const toReview = async () => { await answerAll(); await page.getByRole('button', { name: 'Continue to fix and tag' }).click(); await page.locator('h2', { hasText: 'ready' }).first().waitFor(); };
  const finish = async () => {
    await page.getByRole('button', { name: 'Continue', exact: true }).click(); await page.locator('h2', { hasText: 'Where did these lists come from?' }).waitFor();
    const cb = page.locator('.mlo-section input[type=checkbox]'); if (await cb.count()) await cb.check();
    await page.getByRole('button', { name: /^Import \d+ (people|person)/ }).click(); await page.locator('h2', { hasText: 'Imported' }).waitFor();
  };
  const importAll = async () => { await toColumns(); await toReview(); await finish(); };

  await page.goto(B + '/api/cc/dev-login?email=owner@example.com');
  await step('import', async () => {
    await page.goto(B + '/mlo/contacts/import'); await page.locator('input[type=file]').waitFor();
    await page.setInputFiles('input[type=file]', CSV);
    await importAll();
  });
  await step('import: Excel + phone contacts + CSV at once', async () => {
    await page.goto(B + '/mlo/contacts/import'); await page.locator('input[type=file]').waitFor();
    await page.setInputFiles('input[type=file]', [
      { name: 'Past clients.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: fs.readFileSync(path.join(process.cwd(), 'fixtures/contacts/sample.xlsx')) },
      { name: 'phone.vcf', mimeType: 'text/vcard', buffer: Buffer.from('BEGIN:VCARD\nFN:Ann Lee\nTEL;TYPE=CELL:(206) 555-1234\nEMAIL:ann@example.com\nEND:VCARD\n') },
    ]);
    await toColumns(); await toReview();
    const ready = await page.locator('h2', { hasText: 'people ready' }).innerText();
    console.log('bulk ready:', ready);
    if (!/^5 people ready/.test(ready)) problems.push('[import bulk] expected 5 people after merging, got: ' + ready);
    await finish();
  });
  // D73: tag at import, find them in one tap, bulk-add a tag, rename it, change one person's tags.
  await step('tags: import, filter, bulk, rename, contact', async () => {
    await page.goto(B + '/mlo/contacts/import'); await page.locator('input[type=file]').waitFor();
    await page.setInputFiles('input[type=file]', path.join(process.cwd(), 'tests/fixtures/import/past-clients-messy.csv'));
    await toColumns(); await toReview();
    await page.getByRole('tab', { name: /^Ready/ }).click();
    const whole = page.getByRole('group', { name: 'Tags for everyone in this import' });
    const pre = await whole.locator('.cc-tag').allInnerTexts();
    if (!pre.some((t) => /^Imported [A-Z][a-z]{2} \d{1,2}, \d{4}/.test(t))) problems.push('[tags] no "Imported <date>" tag pre-filled: ' + pre.join(' | '));
    await whole.locator('input.mlo-input').fill('QA list'); await whole.locator('input.mlo-input').press('Enter');
    const cell = await page.locator('.mlo-scroll table tbody tr').first().locator('td').last().innerText();
    if (!/QA list/.test(cell)) problems.push('[tags] preview Tags column lacks the import tag: ' + cell);
    await finish();
    await page.getByRole('link', { name: 'See the people from this import' }).click(); await page.waitForURL(/tag=/);
    console.log('tags: import filter:', await page.locator('.mlo-section .mlo-note').first().innerText());
    await page.goto(B + '/mlo/contacts?tag=QA%20list');
    const n = await page.locator('table.cc-contacts tbody tr').count();
    if (n < 1) problems.push('[tags] ?tag=QA list found nobody');
    await page.getByRole('checkbox', { name: 'Select everyone on this page' }).check();
    await page.locator('.cc-bulkbar input').fill('QA bulk');
    await page.locator('.cc-bulkbar').getByRole('button', { name: 'Add tag' }).click();
    await page.locator('.cc-bulk .mlo-flash').waitFor(); console.log('tags: bulk:', await page.locator('.cc-bulk .mlo-flash').innerText());
    await page.goto(B + '/mlo/contacts?tag=QA%20bulk');
    if ((await page.locator('table.cc-contacts tbody tr').count()) !== n) problems.push('[tags] bulk-added tag does not find the same people');
    const row = page.locator('.cc-tagadmin__row', { has: page.getByRole('link', { name: 'QA bulk', exact: true }) });
    await row.locator('summary').click(); await row.locator('input[name=to]').fill('QA bulk renamed');
    await row.getByRole('button', { name: 'Rename tag' }).click(); await page.waitForURL(/f=/); console.log('tags: rename:', await flash());
    await page.goto(B + '/mlo/contacts?tag=QA%20bulk%20renamed');
    if ((await page.locator('table.cc-contacts tbody tr').count()) !== n) problems.push('[tags] renamed tag does not find the same people');
    await page.locator('table.cc-contacts tbody th a').first().click(); await page.locator('#tags').waitFor();
    await page.locator('#tags input.mlo-input').fill('QA one'); await page.locator('#tags input.mlo-input').press('Enter');
    await page.locator('#tags [role=status]', { hasText: 'Tags saved.' }).waitFor();
    await page.locator('#tags').getByRole('button', { name: 'Remove tag QA one' }).click();
    await page.locator('#tags [role=status]', { hasText: 'Tags saved.' }).waitFor();
    await page.reload(); if (/QA one/.test(await page.locator('#tags').innerText())) problems.push('[tags] removed tag still on the contact');
  });
  // D74: the review. Column cards and a format question (messy file), Needs a look and Fix with M8, the skipped download,
  // a Last First name question, opt-out columns confirmed before import, and "Use column 'Home #' as Other phone?".
  await step('import review: columns, questions, needs a look, fix', async () => {
    const FX = (f) => path.join(process.cwd(), 'tests/fixtures/import', f);
    await page.goto(B + '/mlo/contacts/import'); await page.locator('input[type=file]').waitFor();
    await page.setInputFiles('input[type=file]', FX('past-clients-messy.csv'));
    await toColumns();
    const counts = (await page.locator('.im-counts').first().innerText()).replace(/\n/g, ' ');
    const color = page.locator('.im-col', { has: page.locator('.im-col__h', { hasText: 'Favorite Color' }) });
    if (!/Check this/.test(await color.locator('.im-chip').innerText())) problems.push('[review] unmatched "Favorite Color" is not "Check this"');
    if (!(await page.locator('.im-q', { hasText: 'Dates like' }).count())) problems.push('[review] no date-order question on the messy file');
    if (!(await page.getByRole('button', { name: 'Continue to fix and tag' }).isDisabled())) problems.push('[review] Continue not blocked by unanswered questions');
    console.log('review: columns', counts, '|', await page.locator('#im-pending').innerText());
    await page.locator('.im-q', { hasText: 'Dates like' }).locator('.im-choice').first().click();
    await toReview();
    const tabs = (await page.getByRole('tab').allInnerTexts()).join(' | ');
    const lookN = Number((/Needs a look \((\d+)\)/.exec(tabs) || [])[1] || 0);
    if (!lookN) problems.push('[review] nothing in Needs a look: ' + tabs);
    await page.getByRole('button', { name: 'Fix with M8' }).click(); await page.locator('.im-fix').waitFor();
    console.log('review: fix with M8:', await page.locator('.im-fix__ask').innerText());
    const box = page.locator('.im-fix input.mlo-input');
    await box.fill('(206) 555-3434');
    if (!/Looks right/.test(await page.locator('.im-fix .im-fixed__msg').innerText())) problems.push('[review] typed phone not re-checked as right');
    await page.locator('.im-fix').getByRole('button', { name: 'Save and next' }).click();
    const after = Number((/Needs a look \((\d+)\)/.exec((await page.getByRole('tab').allInnerTexts()).join(' ')) || [])[1] || 0);
    if (after !== lookN - 1) problems.push(`[review] Needs a look went ${lookN} → ${after} after a fix`);
    await page.locator('.im-fix').getByRole('button', { name: 'Later' }).click();
    await page.locator('.im-fix').getByRole('button', { name: 'Close' }).click();
    await page.getByRole('tab', { name: /^Skipped/ }).click();
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Download the skipped rows/ }).click()]);
    const csv = fs.readFileSync(await dl.path(), 'utf8');
    if (!/^\uFEFF?File,Row,Reason,/.test(csv)) problems.push('[review] skipped CSV has no Reason column: ' + csv.slice(0, 60));
    console.log('review: skipped csv:', csv.split('\r\n').length - 2, 'rows');
    await finish();
    console.log('review: done:', (await page.locator('.im-stats').innerText()).replace(/\n/g, ' '));
    // Names in one column: Last First.
    await page.goto(B + '/mlo/contacts/import'); await page.locator('input[type=file]').waitFor();
    await page.setInputFiles('input[type=file]', FX('names-one-column.csv'));
    await toColumns();
    const nq = page.locator('.im-q', { hasText: 'Names in this file are written' });
    await nq.getByRole('button', { name: 'Last First' }).click();
    if (!/Maria · Garcia/.test(await nq.innerText())) problems.push('[review] Last First preview lacks "Maria · Garcia"');
    await toReview(); await finish();
    // Opt-out columns must be confirmed.
    await page.goto(B + '/mlo/contacts/import'); await page.locator('input[type=file]').waitFor();
    await page.setInputFiles('input[type=file]', FX('bonzo-optout.csv'));
    await toColumns();
    await page.locator('.im-q').first().locator('.im-choice').first().click();
    if (!(await page.getByRole('button', { name: 'Continue to fix and tag' }).isDisabled())) problems.push('[review] opt-out columns not required to be confirmed');
    await toReview(); await finish();
    // A column that can reach a skipped row.
    const home = path.join(path.dirname(CSV), 'home.csv');
    fs.writeFileSync(home, 'Name,Mobile,Email,Home #\nDee Home,,,(425) 555-2110\nEd Cell,(425) 555-2111,ed@example.com,\n');
    await page.goto(B + '/mlo/contacts/import'); await page.locator('input[type=file]').waitFor();
    await page.setInputFiles('input[type=file]', home);
    await toColumns(); await toReview();
    await page.getByRole('tab', { name: /^Skipped/ }).click();
    const sug = page.locator('.im-suggest', { hasText: 'Use column “Home #” as Other phone?' });
    if (!(await sug.count())) problems.push('[review] no "Use column Home # as Other phone?" suggestion');
    else { await sug.getByRole('button', { name: 'Use it' }).click(); if (!/Skipped \(0\)/.test((await page.getByRole('tab').allInnerTexts()).join(' '))) problems.push('[review] using Home # did not reach the skipped row'); }
    await finish();
  });
  let key = '';
  await step('pipeline key + loan + lead', async () => {
    await page.goto(B + '/mlo/pipeline');
    await page.getByRole('button', { name: 'Make a connection key' }).click();
    key = (await page.locator('code.mlo-code').nth(1).innerText()).trim();
    for (const st of ['Application Taken', 'Initial Disclosures Sent']) await page.request.post(B + '/api/pipeline/inbound', { headers: { 'X-CC-Key': key }, data: { loanNumber: 'L-1', borrowerFirstName: 'Bo', borrowerLastName: 'Park', borrowerPhone: '425-555-2222', loanStatus: st, loanPurpose: 'Purchase', applicationDate: '2026-11-17', closingDate: '2026-12-04', buyerAgentName: 'Al Agent' } });
    await page.request.post(B + '/api/leads/inbound?source=zillow', { headers: { 'X-CC-Key': key }, data: { first_name: 'Eve', last_name: 'Ng', phone: '(503) 555-2468' } });
  });
  // Every page, both widths. D72: body.scrollWidth too (html{overflow-x:clip} hides overflow from documentElement).
  const pages = ['/mlo', '/mlo/concierge', '/mlo/scripts', '/mlo/calls', '/mlo/automations', '/mlo/refi', '/mlo/report', '/mlo/inbox', '/mlo/pipeline', '/mlo/contacts', '/mlo/contacts?kind=agent', '/mlo/contacts?tag=QA%20list&select=all', '/mlo/contacts/import', '/mlo/contacts/permission', '/mlo/leads', '/mlo/rules', '/mlo/team', '/mlo/network', '/mlo/security', '/mlo/expenses', '/mlo/expenses/report', '/mlo/templates', '/mlo/templates?k=rebuttal', '/mlo/academy', '/mlo/academy/p5', '/mlo/academy/l2', '/mlo/messages', '/mlo/texting', '/mlo/launch', '/mlo/setup', '/mlo/pricing', '/mlo/voice', '/mlo/training', '/mlo/loa'];
  for (const w of [390, 1280]) {
    await page.setViewportSize({ width: w, height: 900 });
    for (const p of pages) await step(`${p} @${w}`, async () => {
      const r = await page.goto(B + p);
      if (!r || r.status() >= 400) problems.push(`[${p} @${w}] status ${r && r.status()}`);
      if (await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) > window.innerWidth + 1)) problems.push(`[${p} @${w}] horizontal overflow`);
      if ((await page.locator('h1').count()) !== 1) problems.push(`[${p} @${w}] h1 count ${await page.locator('h1').count()}`);
    });
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  // Flows.
  const openContact = async (name) => { await page.goto(B + '/mlo/contacts?q=' + encodeURIComponent(name.split(' ')[1])); await page.getByRole('link', { name: new RegExp(name) }).first().click(); await page.locator('#script').waitFor(); };
  await step('contact: consent', async () => {
    await openContact('Ann Lee');
    const f = page.locator('#permission form').first();
    console.log('perm form fields:', await f.locator('select, input').evaluateAll((els) => els.map((e) => e.name)));
  });
  await step('contact: dnc', async () => { await openContact('Ann Lee'); const f = page.locator('form', { has: page.locator('select[name=onList]') }); await f.locator('input[name=source]').fill('Registry'); await f.getByRole('button', { name: 'Record check' }).click(); await page.waitForURL(/f=/); console.log('dnc:', await flash()); });
  await step('contact: rnd', async () => { await openContact('Ann Lee'); const f = page.locator('form', { has: page.locator('select[name=result]') }).last(); await f.locator('input[name=since]').fill('2020-11-20'); await f.getByRole('button', { name: 'Record check' }).click(); await page.waitForURL(/f=/); console.log('rnd:', await flash()); });
  await step('contact: script', async () => { await openContact('Ann Lee'); await page.getByRole('button', { name: 'Build my script' }).click(); await page.locator('.cs-script').waitFor(); console.log('script:', await flash()); });
  await step('contact: debrief', async () => { await openContact('Ann Lee'); await page.locator('#debrief textarea').fill('Talked to Ann about a kitchen remodel next spring.'); await page.getByRole('button', { name: 'Save the note' }).click(); await page.locator('#debrief .mlo-flash').waitFor(); console.log('debrief:', (await page.locator('#debrief .mlo-flash').innerText()).replace(/\n/g, ' ')); });
  await step('contact: their page link', async () => { await openContact('Ann Lee'); console.log('their-page:', (await page.locator('#their-page').innerText()).replace(/\n/g, ' | ').slice(0, 120)); });
  await step('bulk permission', async () => { await page.goto(B + '/mlo/contacts/permission'); await page.locator('input[name=proof]').fill('Consent in our loan application, e-signed; copies in ARIVE'); await page.locator('input[name=namesUs]').check(); await page.locator('input[name=canProduce]').check(); await page.getByRole('button', { name: /^Record permission/ }).click(); await page.waitForURL(/f=/); console.log('bulk:', await flash()); });
  await step('rnd bulk', async () => { await page.goto(B + '/mlo/contacts/permission'); const list = await page.locator('#rnd pre').innerText().catch(() => ''); const rows = list.split('\n').filter(Boolean).map((l) => `${l},no`).join('\n'); await page.locator('#rnd textarea').fill(rows || '(206) 555-1234,2020-11-20,no'); await page.locator('#rnd').getByRole('button', { name: 'Record results' }).click(); await page.waitForURL(/f=/); console.log('rnd bulk:', await flash()); });
  await step('calls: log', async () => { await page.goto(B + '/mlo/calls'); const n = await page.locator('#next').count(); console.log('calls ready:', n); if (n) { await page.locator('#next').getByRole('button', { name: 'No answer' }).click(); await page.waitForURL(/f=/); console.log('call:', await flash()); } });
  await step('concierge: settings + run', async () => { await page.goto(B + '/mlo/concierge'); await page.locator('input[name=enabled]').check(); await page.locator('input[name=voice]').fill('friendly, short'); await page.getByRole('button', { name: 'Save' }).click(); await page.waitForURL(/f=/); await page.getByRole('button', { name: 'Run now' }).click(); await page.locator('.mlo-flash', { hasText: 'Looked at' }).waitFor(); console.log('sweep:', await flash()); });
  await step('concierge: dismiss draft', async () => { await page.goto(B + '/mlo/concierge'); const d = page.locator('#drafts').getByRole('button', { name: 'Dismiss' }); const n = await d.count(); console.log('drafts:', n); if (n) { await d.first().click(); await page.waitForURL(/f=/); console.log('dismiss:', await flash()); } });
  await step('concierge: tell (no key)', async () => { await page.goto(B + '/mlo/concierge'); await page.locator('#tell textarea').fill('Draft a check-in to my past clients'); await page.getByRole('button', { name: 'Prepare it' }).click(); await page.locator('#tell [role=status]').waitFor(); console.log('tell:', (await page.locator('#tell [role=status]').innerText()).slice(0, 120)); });
  await step('automations', async () => { await page.goto(B + '/mlo/automations'); await page.locator('input[name=borrower_appraisal]').check(); await page.getByRole('button', { name: 'Save' }).click(); await page.waitForURL(/f=/); console.log('auto:', await flash()); });
  await step('journey', async () => {
    await page.goto(B + '/mlo/pipeline'); await page.getByRole('link', { name: 'Bo Park' }).first().click(); await page.locator('#clocks').waitFor();
    await page.locator('#clocks input[name=intentToProceedOn]').fill('2026-11-18'); await page.getByRole('button', { name: 'Save dates' }).click(); await page.waitForURL(/f=/); console.log('dates:', await flash());
    await page.locator('#s-14A').getByRole('button', { name: 'Draft the borrower text' }).click(); await page.waitForURL(/f=/); console.log('14A:', await flash());
    await page.locator('#s-13').getByRole('button', { name: 'Lock' }).click(); await page.waitForTimeout(1200); console.log('lock:', await flash());
    await page.locator('#docs textarea[name=lines]').first().fill('Pay stubs'); await page.locator('#docs').getByRole('button', { name: 'Add' }).first().click(); await page.waitForURL(/f=/);
    await page.locator('#docs').getByRole('button', { name: 'Draft the request to the borrower' }).first().click(); await page.waitForURL(/f=/); console.log('docs request:', await flash());
  });
  // D70: the LOA switches (preset, keyboard on a radiogroup, save) and the per-loan strip.
  await step('loa: switches', async () => {
    await page.goto(B + '/mlo/loa#autopilot');
    await page.locator('.loa-presets').getByRole('button', { name: 'Recommended' }).click(); await page.waitForURL(/f=/); console.log('preset:', await flash());
    const g = page.getByRole('radiogroup', { name: 'Ask escrow for their fee estimate, purchase' });
    await g.getByRole('radio', { name: 'LO-Auth' }).focus(); await page.keyboard.press('ArrowLeft');
    if (!(await g.getByRole('radio', { name: 'Full-auto' }).isChecked())) problems.push('[loa: switches] arrow key did not move the choice');
    await page.keyboard.press('Tab');
    if (await page.evaluate(() => document.activeElement?.closest('fieldset')?.getAttribute('aria-label')) === 'Ask escrow for their fee estimate, purchase') problems.push('[loa: switches] Tab did not leave the group');
    const hoa = page.getByRole('radiogroup', { name: 'Ask for HOA or condo documents, purchase' }).getByRole('radio', { name: 'Full-auto' });
    if (!(await hoa.isDisabled())) problems.push('[loa: switches] HOA Full-auto should be disabled');
    const u0 = page.url(); await page.getByRole('button', { name: 'Save switches' }).click(); await page.waitForURL((u) => u.href !== u0); console.log('switches:', await flash());
  });
  await step('loa: loan strip', async () => {
    await page.goto(B + '/mlo/pipeline'); await page.getByRole('link', { name: 'Bo Park' }).first().click(); await page.locator('.loa-strip').waitFor();
    console.log('strip:', (await page.locator('.loa-strip__line').first().innerText()).replace(/\n/g, ' '));
    await page.locator('.loa-strip__more > summary').click();
    await page.getByRole('radiogroup', { name: 'Open escrow, just this loan' }).getByRole('radio', { name: 'Off' }).check();
    await page.getByRole('button', { name: 'Save for this loan' }).click(); await page.waitForURL(/f=/); console.log('loan switches:', await flash());
    let u1 = page.url(); await page.getByRole('button', { name: 'Pause on this loan' }).click(); await page.waitForURL((u) => u.href !== u1); console.log('pause:', await flash());
    u1 = page.url(); await page.getByRole('button', { name: 'Resume on this loan' }).click(); await page.waitForURL((u) => u.href !== u1); console.log('resume:', await flash());
  });
  // D71: Full-auto at work. A refinance with escrow's email typed in (so confirmed) queues the fee request with
  // the morning run; then the queue, "Send in 15 minutes", Stop and "What your LOA did". QA_SHOTS = a folder for screenshots.
  await step('loa: full-auto queue', async () => {
    const shot = async (name) => { if (process.env.QA_SHOTS) await page.screenshot({ path: path.join(process.env.QA_SHOTS, name), fullPage: false }); };
    await page.request.post(B + '/api/pipeline/inbound', { headers: { 'X-CC-Key': key }, data: { loanNumber: 'R-9', borrowerFirstName: 'Di', borrowerLastName: 'Cho', borrowerPhone: '425-555-3333', loanStatus: 'Application Taken', loanPurpose: 'Refinance', applicationDate: '2026-11-17' } });
    await page.goto(B + '/mlo/loa#autopilot');
    await page.getByRole('radiogroup', { name: 'Ask escrow for their fee estimate, refinance' }).getByRole('radio', { name: 'Full-auto' }).check();
    const u0 = page.url(); await page.getByRole('button', { name: 'Save switches' }).click(); await page.waitForURL((u) => u.href !== u0); console.log('refi fees full-auto:', await flash());
    const when = await page.locator('#sendwhen').innerText();
    if (!when.includes('With the next morning run')) problems.push('[loa: full-auto] no "When Full-auto messages go out" setting');
    if (!when.includes('/api/cc/loa/tick')) problems.push('[loa: full-auto] the owner note about an outside 15-minute caller is missing');
    await page.goto(B + '/mlo/pipeline'); await page.getByRole('link', { name: 'Di Cho' }).first().click(); await page.locator('#loa').waitFor();
    const add = page.locator('details', { hasText: 'Add or change someone' });
    await add.locator('summary').click();
    await add.locator('select[name=role]').selectOption('escrow');
    await add.locator('input[name=name]').fill('Dana Fox'); await add.locator('input[name=company]').fill('Lake Escrow'); await add.locator('input[name=email]').fill('dana@lake-escrow.example');
    const u1 = page.url(); await add.getByRole('button', { name: 'Save' }).click(); await page.waitForURL((u) => u.href !== u1);
    const f1 = await flash(); console.log('escrow typed in:', f1);
    if (!/Asked escrow for fees\. It goes out with (this|tomorrow) morning's run unless you stop it\./.test(f1)) problems.push('[loa: full-auto] the flash did not give the send time: ' + f1);
    await page.locator('#autolog').scrollIntoViewIfNeeded(); await shot('loan-autolog-1280.png');
    const log1 = await page.locator('#autolog').innerText();
    if (!/Goes out with (this|tomorrow) morning's run\./.test(log1) || !/Going out/.test(log1)) problems.push('[loa: full-auto] the loan does not show the queued email and its time');
    await page.goto(B + '/mlo/loa#needs');
    const item = page.locator('#needs .loa-queue__item--auto').first(); await item.waitFor();
    console.log('queued:', (await item.innerText()).replace(/\n/g, ' | ').slice(0, 200));
    await item.scrollIntoViewIfNeeded(); await shot('queue-1280.png');
    const u2 = page.url(); await item.getByRole('button', { name: 'Send in 15 minutes' }).click(); await page.waitForURL((u) => u.href !== u2);
    const f2 = await flash(); console.log('send in 15:', f2);
    if (!/Goes out at \d{1,2}:\d{2} [AP]M PT, or when you next open Command Center/.test(f2)) problems.push('[loa: full-auto] Send in 15 minutes did not show the time: ' + f2);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(B + '/mlo/loa#going'); await page.locator('#needs .loa-queue__item--auto').first().scrollIntoViewIfNeeded(); await shot('queue-390.png');
    if (await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) > window.innerWidth + 1)) problems.push('[loa: full-auto] sideways scroll on the queue at 390px');
    const u3 = page.url(); await page.locator('#needs .loa-queue__item--auto').first().getByRole('button', { name: 'Stop' }).click(); await page.waitForURL((u) => u.href !== u3);
    console.log('stop:', await flash());
    if ((await page.locator('#needs .loa-queue__item--auto').count()) !== 0) problems.push('[loa: full-auto] Stop left the message in the queue');
    await page.goto(B + '/mlo/pipeline'); await page.getByRole('link', { name: 'Di Cho' }).first().click(); await page.locator('#autolog').scrollIntoViewIfNeeded(); await shot('loan-autolog-390.png');
    const log2 = await page.locator('#autolog').innerText();
    console.log('log:', log2.replace(/\n/g, ' | ').slice(0, 260));
    if (!/Stopped/.test(log2)) problems.push('[loa: full-auto] the log does not show Stopped');
    if (await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) > window.innerWidth + 1)) problems.push('[loa: full-auto] sideways scroll on the loan at 390px');
    await page.setViewportSize({ width: 1280, height: 900 });
    const t = await page.request.get(B + '/api/cc/loa/tick');
    if (t.status() !== 404) problems.push('[loa: tick] answered without the secret: ' + t.status());
  });
  await step('scripts: practice', async () => { await page.goto(B + '/mlo/scripts'); await page.locator('textarea[name=situation]').fill('A past client from 2022 asked about adding a second story.'); await page.getByRole('button', { name: 'Build a practice script' }).click(); await page.locator('.cs-script').waitFor(); console.log('practice:', await flash()); });
  await step('refi', async () => { await page.goto(B + '/mlo/refi?ref=5.75'); console.log('refi:', (await page.locator('.mlo-section').nth(1).innerText()).split('\n')[0]); });
  await step('team: invite', async () => { await page.goto(B + '/mlo/team'); await page.locator('input[name=name]').fill('Sam Helper'); await page.locator('input[name=email]').fill('sam@example.com'); await page.locator('form select[name=role]').first().selectOption('assistant'); await page.locator('form select[name=assists]').first().selectOption({ index: 1 }); await page.getByRole('button', { name: 'Add and email a sign-in link' }).click(); await page.waitForURL(/f=/); console.log('invite:', await flash()); });
  await step('client page', async () => {
    await openContact('Ann Lee'); const link = (await page.locator('#their-page code').innerText().catch(() => '')).trim();
    if (!link) { console.log('client page: no link (no secret)'); return; }
    const local = link.replace(/^https?:\/\/[^/]+/, B);
    const p2 = await ctx.newPage(); await p2.goto(local);
    console.log('client page h1:', await p2.locator('h1').innerText());
    await p2.getByRole('button', { name: 'Stop email' }).click(); await p2.waitForURL(/m=/); console.log('client stop email:', (await p2.locator('.mlo-flash').innerText()).slice(0, 80));
    await p2.close();
  });
  await step('client page: where is my loan', async () => {
    await openContact('Bo Park'); const link = (await page.locator('#their-page code').innerText().catch(() => '')).trim();
    if (!link) return;
    const p3 = await ctx.newPage(); await p3.goto(link.replace(/^https?:\/\/[^/]+/, B));
    const t = await p3.locator('.mlo-wrap').innerText();
    if (!t.includes("Where's my loan?")) problems.push('[client page] no Where\'s my loan section for a borrower with a loan');
    console.log('where is my loan:', (await p3.locator('.mlo-section').first().innerText()).replace(/\n/g, ' | ').slice(0, 220));
    await p3.close();
  });
  await step('email: composer', async () => {
    await openContact('Ann Lee');
    const n = await page.locator('#email').count();
    console.log('email composer:', n ? 'shown' : 'none (no email on file)');
    const send = page.locator('#email').getByRole('button', { name: 'Send email' });
    if (n && await send.isDisabled()) { console.log('email: not connected here (no mailbox or Resend):', (await page.locator('#email .mlo-note').last().innerText()).slice(0, 80)); return; }
    if (n) { await page.locator('#email input[name=subject]').fill('Re: checking in'); await page.locator('#email textarea').fill('Hi Ann, just checking in.'); await page.locator('#email').getByRole('button', { name: 'Send email' }).click(); await page.waitForURL(/f=/); console.log('email (bad subject):', await flash()); }
  });
  await step('email page (D52)', async () => {
    await page.goto(B + '/mlo/email');
    const t = await page.locator('main').innerText();
    console.log('email page:', t.includes('Connect Gmail') ? 'Connect Gmail shown' : 'no connect button', '|', t.includes('/api/cc/mail/callback/google') ? 'redirect URI shown' : 'no redirect URI');
    if (!t.includes('Send only.')) problems.push('[email page] missing how-it-works');
    const r = await page.request.get(B + '/api/cc/mail/start?provider=google', { maxRedirects: 0 });
    const loc = r.headers()['location'] ?? '';
    console.log('start:', r.status(), loc.slice(0, 60));
    if (!loc.startsWith('https://accounts.google.com/')) problems.push('[email start] did not go to Google');
    const cb = await page.request.get(B + '/api/cc/mail/callback/google?code=x&state=wrong', { maxRedirects: 0 });
    if (!/\/mlo\/email\?f=/.test(cb.headers()['location'] ?? '')) problems.push('[email callback] bad state did not come back with a message');
  });
  await step('membership: set up, fee, say, idea, spend', async () => {
    const go = () => page.goto(B + '/mlo/network');
    await go(); const row = page.locator('#members tbody tr').first();
    await row.locator('input[name=area]').fill('Eastside, WA'); await row.locator('input[name=fee]').fill('300'); await row.getByRole('button', { name: 'Save' }).click(); await page.waitForURL(/f=/); console.log('member:', await flash());
    await go(); await page.locator('#members tbody tr').first().getByRole('button', { name: 'Fee paid' }).click(); await page.waitForURL(/f=/); console.log('fee:', await flash());
    await go(); await page.locator('input[name=pct_social_ads]').fill('60'); await page.locator('input[name=pct_sponsorship]').fill('40'); await page.getByRole('button', { name: 'Save my split' }).click(); await page.waitForURL(/f=/); console.log('split:', await flash());
    await go(); await page.locator('#say textarea[name=text]').fill('Sponsor the Kirkland 5K in June'); await page.getByRole('button', { name: 'Suggest it' }).click(); await page.waitForURL(/f=/); console.log('idea:', await flash());
    await go(); await page.locator('#ideas input[name=reply]').first().fill('Yes'); await page.locator('#ideas').getByRole('button', { name: 'Approve' }).first().click(); await page.waitForURL(/f=/); console.log('answer:', await flash());
    const fillSpend = async (tick) => { await go(); await page.locator('#coop select[name=area]').selectOption('Eastside, WA'); await page.locator('#coop input[name=dollars]').fill('20'); await page.locator('#coop select[name=channel]').selectOption('social_ads'); await page.locator('#coop input[name=what]').fill('Local housing-category ads'); await page.locator('#coop input[name=proof]').fill('INV-1'); if (tick) await page.locator('#coop input[name=locationOnly]').check(); await page.getByRole('button', { name: 'Record spend' }).click(); await page.waitForURL(/f=/); };
    await fillSpend(false); console.log('spend without tick:', await flash());
    await fillSpend(true); console.log('spend:', await flash());
    console.log('area:', (await page.locator('#area').innerText()).split('\n').slice(0, 2).join(' | '));
  });
  await step('security: turn on the phone code', async () => {
    await page.goto(B + '/mlo/security');
    await page.getByRole('button', { name: 'Start' }).click(); await page.locator('.mlo-key').waitFor();
    const key = (await page.locator('.mlo-key').innerText()).replace(/\s/g, '');
    const { createHmac } = await import('node:crypto');
    const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let bits = 0, val = 0; const bytes = [];
    for (const ch of key) { val = (val << 5) | B32.indexOf(ch); bits += 5; if (bits >= 8) { bytes.push((val >>> (bits - 8)) & 255); bits -= 8; } }
    const msg = Buffer.alloc(8); msg.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
    const h = createHmac('sha1', Buffer.from(bytes)).update(msg).digest(); const o = h[h.length - 1] & 15;
    const code = String((((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6).padStart(6, '0');
    await page.locator('input[name=code]').fill(code); await page.getByRole('button', { name: 'Turn it on' }).click();
    await page.locator('.mlo-codes').waitFor(); console.log('recovery codes shown:', (await page.locator('.mlo-codes').innerText()).split('\n').length);
  });
  await step('expenses: tell, confirm, receipt, report, csv', async () => {
    await page.goto(B + '/mlo/expenses');
    await page.locator('#tell textarea').fill("$84 lunch with an agent at Daniel's yesterday\nDrove 32 miles to a closing in Bellevue");
    await page.locator('#tell').getByRole('button', { name: 'Add', exact: true }).click();
    await page.locator('#tell [role=status]').waitFor(); console.log('tell:', await page.locator('#tell [role=status]').innerText());
    await page.waitForFunction(() => document.querySelectorAll('#drafts .cc-card').length >= 2);
    await page.locator('#drafts .cc-card').first().getByRole('button', { name: 'Confirm' }).click(); await page.waitForURL(/f=/); console.log('confirm:', await flash());
    await page.goto(B + '/mlo/expenses');
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
    await page.locator('#tell input[type=file]').setInputFiles({ name: 'receipt.png', mimeType: 'image/png', buffer: png });
    await page.locator('#tell [role=status]').waitFor(); console.log('receipt:', await page.locator('#tell [role=status]').innerText());
    await page.goto(B + '/mlo/expenses/report');
    console.log('report:', (await page.locator('.ex-report h2').allInnerTexts()).join(' / '));
    const r = await page.request.get(B + '/api/cc/expenses/csv'); console.log('csv:', r.status(), (await r.text()).split('\n').length - 2, 'rows');
  });
  await step('templates: answer, use, make', async () => {
    await page.goto(B + '/mlo/templates');
    await page.locator('#answer textarea').fill("I'm just going to use my bank.");
    await page.getByRole('button', { name: 'Help me answer' }).click();
    await page.locator('#answer [role=status]').first().waitFor(); console.log('answer:', (await page.locator('#answer [role=status]').first().innerText()).slice(0, 90).replace(/\n/g, ' | '));
    await page.locator('#list .cc-card').first().getByText('Use it').click();
    console.log('use it fields:', await page.locator('#list .cc-card').first().locator('.tp-fields input').count());
    await page.locator('#make input[name=title]').fill('My coffee ask'); await page.locator('#make textarea[name=body]').fill('Hi {agentFirst}, could I buy you a coffee and hear how you like to work with lenders?');
    await page.getByRole('button', { name: 'Save template' }).click(); await page.waitForURL(/f=/); console.log('save:', await flash());
    await page.goto(B + '/mlo/templates'); await page.locator('#make input[name=title]').fill('Bad'); await page.locator('#make textarea[name=body]').fill('Rates at 5.5% this week, {first}!');
    await page.getByRole('button', { name: 'Save template' }).click(); await page.waitForURL(/f=/); console.log('save bad:', await flash());
  });
  await step('training: numbers, quiz, practice', async () => {
    await page.goto(B + '/mlo/academy');
    await page.locator('input[name=goal]').fill('4'); await page.locator('#numbers input[name=conversations]').first().fill('10'); await page.locator('#numbers input[name=meetings]').first().fill('2');
    await page.getByRole('button', { name: 'Save targets' }).click(); await page.waitForURL(/f=/); console.log('targets:', await flash());
    await page.goto(B + '/mlo/academy/p1');
    const qs = page.locator('.ac-q'); const n = await qs.count();
    for (let i = 0; i < n; i++) await qs.nth(i).locator('input[type=radio]').nth(1).check();
    await page.getByRole('button', { name: 'Check my answers' }).click(); await page.locator('#quiz [role=status]').waitFor(); console.log('quiz:', await page.locator('#quiz [role=status]').innerText());
    await page.goto(B + '/mlo/academy/p5');
    await page.locator('#practice textarea').fill("Hi Jordan, I saw your listing on Elm. Could I buy you a coffee and hear how you work with lenders?");
    await page.getByRole('button', { name: 'Say it' }).click(); await page.waitForFunction(() => document.querySelectorAll('#practice .mlo-msg').length >= 3);
    await page.getByRole('button', { name: 'Coach me' }).click(); await page.locator('#practice .cc-card').waitFor(); console.log('coach:', (await page.locator('#practice .cc-card').innerText()).slice(0, 90).replace(/\n/g, ' | '));
  });
  console.log('\nPROBLEMS:', problems.length ? '\n' + problems.join('\n') : 'none');
  await b.close();
  process.exit(problems.length ? 1 : 0);
})();
