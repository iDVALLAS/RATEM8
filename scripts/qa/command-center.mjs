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
    await page.getByRole('link', { name: /See these people/ }).click(); await page.waitForURL(/import=/);
    console.log('tags: import filter:', await page.locator('.mlo-section .mlo-note').first().innerText());
    await page.goto(B + '/mlo/contacts?tag=QA%20list');
    const n = await page.locator('.cc-people > li').count();
    if (n < 1) problems.push('[tags] ?tag=QA list found nobody');
    await page.getByRole('checkbox', { name: 'Select everyone on this page' }).check();
    await page.locator('.cc-bulkbar input').fill('QA bulk');
    await page.locator('.cc-bulkbar').getByRole('button', { name: 'Add tag' }).click();
    await page.locator('.cc-bulk .mlo-flash').waitFor(); console.log('tags: bulk:', await page.locator('.cc-bulk .mlo-flash').innerText());
    await page.goto(B + '/mlo/contacts?tag=QA%20bulk');
    if ((await page.locator('.cc-people > li').count()) !== n) problems.push('[tags] bulk-added tag does not find the same people');
    const row = page.locator('.cc-tagadmin__row', { has: page.getByRole('link', { name: 'QA bulk', exact: true }) });
    await row.locator('summary').click(); await row.locator('input[name=to]').fill('QA bulk renamed');
    await row.getByRole('button', { name: 'Rename tag' }).click(); await page.waitForURL(/f=/); console.log('tags: rename:', await flash());
    await page.goto(B + '/mlo/contacts?tag=QA%20bulk%20renamed');
    if ((await page.locator('.cc-people > li').count()) !== n) problems.push('[tags] renamed tag does not find the same people');
    await page.locator('.cc-person__name').first().click(); await page.getByRole('tab', { name: 'Details' }).click(); await page.locator('#tags').waitFor();
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
  // D75: re-import a file with people already in the book (the newer information), review the merges, check the
  // honest counts, see the import's people, undo it from the history, and check the people are back as they were.
  let impId = '';
  await step('import: people you already have, merge review, undo, history', async () => {
    const dir = path.dirname(CSV);
    const v1 = path.join(dir, 'd75-v1.csv'); const v2 = path.join(dir, 'd75-v2.csv');
    fs.writeFileSync(v1, 'First Name,Last Name,Mobile,Email,City\nGia,Rowe,(360) 555-2101,gia@example.com,Seattle\nHal,Rowe,(360) 555-2102,hal@example.com,Seattle\n');
    fs.writeFileSync(v2, 'First Name,Last Name,Mobile,Email,City\nGia,Rowe,(360) 555-2101,gia@example.com,Tacoma\nHal,Rowe,(360) 555-2102,hal@example.com,Seattle\nJo,Rowe,(360) 555-2101,jo@example.com,Tacoma\nKim,Vale,(360) 555-2104,kim@example.com,Everett\nKim,Vale,(360) 555-2104,,Everett\n');
    const toMatch = async (f) => {
      await page.goto(B + '/mlo/contacts/import'); await page.locator('input[type=file]').waitFor();
      await page.setInputFiles('input[type=file]', f); await toColumns(); await toReview();
      await page.waitForFunction(() => /already in your contacts/.test(document.querySelector('.im-preview')?.textContent || ''), null, { timeout: 15000 });
      return page.locator('.im-preview').innerText();
    };
    await toMatch(v1); await finish();
    const pre = await toMatch(v2);
    if (!/^2 new · 2 already in your contacts · 1 merged inside your files/.test(pre)) problems.push('[d75] preview counts: ' + pre);
    const card = page.locator('.im-files .mlo-note', { hasText: 'already in your book' });
    if (!/2 already in your book · 0 would change/.test(await card.innerText())) problems.push('[d75] fill-blanks file card: ' + await card.innerText());
    await page.getByLabel('Use the newer information from this file').check();
    if (!/2 already in your book · 1 would change/.test(await card.innerText())) problems.push('[d75] newer file card: ' + await card.innerText());
    const merges = page.locator('#im-existing details').first();
    if (!(await merges.evaluate((d) => d.open))) await merges.locator('summary').click();
    const spouses = merges.locator('.im-pair', { hasText: 'Gia Rowe + Jo Rowe' });
    if (!/Possible duplicate/.test(await spouses.innerText())) problems.push('[d75] spouses sharing a phone not kept separate');
    const kims = merges.locator('.im-pair', { hasText: 'Kim Vale + Kim Vale' });
    await kims.getByRole('button', { name: 'Keep separate' }).click();
    if (!/2 kept separate/.test(await merges.locator('summary').innerText())) problems.push('[d75] Keep separate did not stick: ' + await merges.locator('summary').innerText());
    await kims.getByRole('button', { name: 'Merge them' }).click();
    console.log('d75: merges:', await merges.locator('summary').innerText());
    await finish();
    const stats = (await page.locator('.im-stats').innerText()).replace(/\n/g, ' ');
    console.log('d75: done:', stats);
    if (!/^2 New people 2 Already yours, updated from this file 1 changed 1 Duplicates/.test(stats)) problems.push('[d75] done counts: ' + stats);
    for (const t of [/Check do-not-call and phone type for these 4 people/, /See these people/, /Start a campaign for these 4 people/, /Import history/]) if (!(await page.getByRole('link', { name: t }).count())) problems.push('[d75] done screen lacks ' + t);
    const see = await page.getByRole('link', { name: /See these people/ }).getAttribute('href');
    impId = (/import=(imp_[\w-]+)/.exec(see) || [])[1] || '';
    await page.goto(B + see);
    if ((await page.locator('.cc-people > li').count()) !== 4) problems.push('[d75] See these people did not list the 4');
    await page.goto(B + '/mlo/contacts/permission?import=' + impId + '#dnc');
    console.log('d75: checks:', (await page.locator('#lines h2').innerText()), '|', (await page.locator('#dnc h2').innerText()));
    await page.goto(B + '/mlo/campaigns?import=' + impId);
    console.log('d75: campaigns:', await page.locator('#from-import h2').innerText());
    await page.goto(B + '/mlo/contacts/import/history');
    const run = page.locator('.im-history__run').first();
    console.log('d75: history:', (await run.innerText()).replace(/\n/g, ' | '));
    await run.locator('summary').click();
    await run.locator('input[name=confirm]').fill('nope'); await run.getByRole('button', { name: 'Undo this import' }).click(); await page.waitForURL(/f=/);
    if (!/Type UNDO/.test(await flash())) problems.push('[d75] undo without typing UNDO was not refused');
    await page.goto(B + '/mlo/contacts/import/history');
    const run2 = page.locator('.im-history__run').first();
    await run2.locator('summary').click(); await run2.locator('input[name=confirm]').fill('UNDO'); await run2.getByRole('button', { name: 'Undo this import' }).click(); await page.waitForURL(/f=/);
    console.log('d75: undo:', await flash());
    if (!/2 people removed\. 2 people already yours put back/.test(await flash())) problems.push('[d75] undo result: ' + await flash());
    await page.goto(B + '/mlo/contacts?q=rowe');
    const left = await page.locator('.cc-person__name').allInnerTexts();
    if (left.length !== 2) problems.push('[d75] after undo expected Gia and Hal only: ' + left.join(', '));
    await page.locator('.cc-person__name', { hasText: /Gia/i }).first().click(); await page.locator('.cc-contact-head').waitFor();
    if (!/Seattle/.test(await page.locator('main').innerText())) problems.push('[d75] Gia not put back to Seattle');
  });
  let key = '';
  await step('pipeline key + loan + lead', async () => {
    // D76: connection addresses are made on Connections, from the picked system's three steps.
    await page.goto(B + '/mlo/pipeline'); await page.getByRole('link', { name: 'Connect your loan system' }).click(); await page.waitForURL(/sys=arive/);
    await page.locator('#arive').getByRole('button', { name: 'Make my connection address' }).click();
    key = new URL((await page.locator('#arive code.mlo-code').first().innerText()).trim()).searchParams.get('key') ?? '';
    if (!key) problems.push('[pipeline key] no key in the connection address');
    for (const st of ['Application Taken', 'Initial Disclosures Sent']) await page.request.post(B + '/api/pipeline/inbound', { headers: { 'X-CC-Key': key }, data: { loanNumber: 'L-1', borrowerFirstName: 'Bo', borrowerLastName: 'Park', borrowerPhone: '425-555-2222', loanStatus: st, loanPurpose: 'Purchase', applicationDate: '2026-11-17', closingDate: '2026-12-04', buyerAgentName: 'Al Agent' } });
    await page.request.post(B + '/api/leads/inbound?source=zillow', { headers: { 'X-CC-Key': key }, data: { first_name: 'Eve', last_name: 'Ng', phone: '(503) 555-2468' } });
  });
  // D77: add a person by hand (and a duplicate refused), record permission, edit the phone (permission set back, checks
  // cleared), merge a second record into them, and check the list's row and the header's one-tap actions.
  let d77 = '';
  await step('d77: add, edit, merge, list', async () => {
    const add = async (first, phone, email) => {
      await page.goto(B + '/mlo/contacts'); await page.locator('#add > summary').click();
      const f = page.locator('#add form');
      await f.getByLabel('First name').fill(first); await f.getByLabel('Last name').fill('Vance');
      if (phone) await f.getByLabel('Mobile or main phone').fill(phone);
      if (email) await f.getByLabel('Email').fill(email);
      await f.getByLabel('How you know them (optional)').fill('Met at an open house');
      await f.getByRole('button', { name: 'Add them' }).click();
    };
    await add('Uma', '(509) 555-3101', 'uma@example.com'); await page.waitForURL(/\/mlo\/contacts\/c_/);
    d77 = page.url().split('?')[0];
    if (!/Uma Vance added/.test(await flash())) problems.push('[d77] add flash: ' + await flash());
    if (!/Call only/.test(await page.locator('.cc-contact-head').innerText())) problems.push('[d77] new person is not "Call only"');
    await add('Uma', '509-555-3101', '');
    await page.locator('#add .mlo-flash--err').waitFor();
    if (!/already in your book/.test(await page.locator('#add .mlo-flash--err').innerText())) problems.push('[d77] duplicate not refused');
    await page.goto(d77 + '?tab=permission');
    const pf = page.locator('#permission form').first();
    await pf.locator('select[name=channel]').selectOption('text'); await pf.locator('select[name=evidence]').selectOption('written');
    await pf.locator('input[name=proof]').fill('Signed form, Nov 21'); await pf.getByRole('button', { name: 'Record it' }).click(); await page.waitForURL(/f=/);
    if (!/Texts OK/.test(await page.locator('.cc-contact-head__line').innerText())) problems.push('[d77] permission line lacks Texts OK: ' + await page.locator('.cc-contact-head__line').innerText());
    // Text in one tap from the top: the Conversation tab opens with the cursor in the composer.
    await page.goto(d77 + '?tab=details');
    await page.locator('.cc-contact-actions').getByRole('link', { name: 'Text' }).click();
    await page.waitForFunction(() => document.activeElement?.tagName === 'TEXTAREA');
    if (await page.locator('#cc-panel-conversation').isHidden()) problems.push('[d77] Text did not open Conversation');
    // Edit: a new phone warns, then clears the checks and sets text permission back.
    await page.getByRole('tab', { name: 'Details' }).click();
    await page.locator('#edit').getByRole('button', { name: 'Edit' }).click();
    await page.locator('#edit').getByLabel('Mobile or main phone').fill('(509) 555-3199');
    if (!(await page.locator('#edit .cc-warnline', { hasText: 'Permission you recorded for the old number may not cover the new one.' }).count())) problems.push('[d77] no warning on a phone change');
    await page.locator('#edit').getByLabel('ZIP').fill('992');
    await page.locator('#edit').getByRole('button', { name: 'Save changes' }).click();
    await page.locator('#edit .cc-field-err').waitFor();
    if (!/ZIP should be 5 digits/.test(await page.locator('#edit .cc-field-err').innerText())) problems.push('[d77] bad ZIP not refused');
    await page.locator('#edit').getByLabel('ZIP').fill('99201');
    await page.locator('#edit').getByRole('button', { name: 'Save changes' }).click();
    await page.locator('#edit .mlo-flash--ok').waitFor(); console.log('d77: edit:', await page.locator('#edit .mlo-flash--ok').innerText());
    await page.reload();
    const line = await page.locator('.cc-contact-head__line').innerText();
    if (!/Texts: no permission yet/.test(line)) problems.push('[d77] text permission not set back after the phone change: ' + line);
    await page.getByRole('tab', { name: 'Permission' }).click();
    if (!/Do-not-call not checked/.test(await page.locator('#cc-panel-permission').innerText())) problems.push('[d77] the old number\'s checks were kept');
    // Merge a second record (another email) into Uma.
    await add('Umi', '', 'umi@example.com'); await page.waitForURL(/\/mlo\/contacts\/c_/);
    const umi = page.url().split('?')[0];
    await page.goto(d77 + '?tab=details#merge');
    await page.locator('#merge input[name=mq]').fill('umi'); await page.locator('#merge').getByRole('button', { name: 'Find' }).click(); await page.waitForURL(/mq=/);
    await page.locator('#merge .cc-row__go').first().click(); await page.waitForURL(/merge=/);
    console.log('d77: merge outcome:', (await page.locator('.cc-merge__out').innerText()).replace(/\n/g, ' | ').slice(0, 200));
    await page.locator('.cc-merge input[name=same]').check();
    await page.locator('.cc-merge').getByRole('button', { name: /^Keep Uma Vance/ }).click(); await page.waitForURL(/f=/);
    console.log('d77: merge:', await flash());
    if (!/Merged into Uma Vance/.test(await flash())) problems.push('[d77] merge flash: ' + await flash());
    if (!/From Umi Vance's record|Merged in/.test(await page.locator('main').textContent())) problems.push('[d77] merged history not shown');
    const gone = await page.goto(umi); if (!gone || gone.status() !== 404) problems.push('[d77] the merged-away record still opens');
    await page.goto(B + '/mlo/contacts?q=vance');
    const rows = page.locator('.cc-people > li');
    if ((await rows.count()) !== 1) problems.push('[d77] list after merge has ' + await rows.count() + ' rows');
    console.log('d77: list row:', (await rows.first().innerText()).replace(/\n/g, ' | '));
    if ((await rows.first().locator('.cc-iconbtn').count()) !== 2) problems.push('[d77] row lacks Call and Text buttons');
  });
  // D78: filter, save a list, open it, bulk actions (download, add to a campaign), a campaign from a list, a call session from a list.
  let d78List = '';
  await step('d78: filter, save, open, bulk, campaign, calls', async () => {
    await page.goto(B + '/mlo/contacts');
    for (const t of ['Everyone', 'New this week', 'Needs permission', 'Past clients', 'Agents']) if (!(await page.locator('.cc-listrow').getByRole('link', { name: t, exact: true }).count())) problems.push('[d78] list tab missing: ' + t);
    await page.locator('#filters > summary').click();
    await page.locator('#filters select[name=state]').selectOption('WA');
    await page.locator('#filters select[name=rel]').selectOption('past_client');
    await page.locator('#filters').getByRole('button', { name: 'Show them' }).click(); await page.waitForURL(/state=WA/);
    const chips = await page.locator('.cc-ask__chips .cc-tag').allInnerTexts();
    if (!chips.some((c) => /State: WA/.test(c)) || !chips.some((c) => /Relationship: Past client/.test(c))) problems.push('[d78] filter chips: ' + chips.join(' | '));
    const n = await page.locator('.cc-people > li').count();
    if (n < 1) problems.push('[d78] WA past clients found nobody');
    await page.locator('.cc-savelist input[name=name]').fill('QA WA past clients');
    await page.locator('.cc-savelist').getByRole('button', { name: 'Save list' }).click(); await page.waitForURL(/f=/);
    console.log('d78: save:', await flash());
    if (!/Saved “QA WA past clients”/.test(await flash())) problems.push('[d78] save flash: ' + await flash());
    if ((await page.locator('.cc-listrow a[aria-current=page]').innerText()) !== 'QA WA past clients') problems.push('[d78] the saved list is not the current tab');
    // Open it from Everyone.
    await page.goto(B + '/mlo/contacts');
    await page.locator('.cc-listrow').getByRole('link', { name: 'QA WA past clients', exact: true }).click(); await page.waitForURL(/state=WA/);
    if ((await page.locator('.cc-people > li').count()) !== n) problems.push('[d78] the saved list opens a different count');
    d78List = page.url();
    // Built-in list: Needs permission reads the consent log.
    await page.goto(B + '/mlo/contacts?perm=relationship');
    console.log('d78: needs permission:', await page.locator('.cc-resultline').innerText().catch(() => '(none)'));
    // Bulk: download the list as CSV (all matching).
    await page.goto(d78List);
    await page.getByRole('checkbox', { name: 'Select everyone on this page' }).check();
    await page.locator('.cc-bulkbar select').first().selectOption('download');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('.cc-bulkbar').getByRole('button', { name: 'Download CSV' }).click()]);
    const csv = fs.readFileSync(await dl.path(), 'utf8');
    if (!/^﻿?First name,Last name,Phone/.test(csv)) problems.push('[d78] CSV header: ' + csv.slice(0, 60));
    console.log('d78: csv rows:', csv.trim().split('\r\n').length - 1);
    // A campaign to add people to.
    await page.goto(B + '/mlo/campaigns?new=1');
    await page.getByRole('button', { name: 'Use this one' }).first().click(); await page.waitForURL(/\/mlo\/campaigns\/cmp_/);
    const camp = page.url().split('?')[0];
    await page.goto(camp);
    const opts = await page.locator('select[name=from] option').allInnerTexts();
    if (!opts.includes('QA WA past clients')) problems.push('[d78] the campaign page lacks the saved list: ' + opts.slice(0, 8).join(' | '));
    const val = await page.locator('select[name=from] option', { hasText: 'QA WA past clients' }).getAttribute('value');
    await page.locator('select[name=from]').selectOption(val);
    await page.getByRole('button', { name: 'Add them' }).click(); await page.waitForURL(/f=/);
    console.log('d78: campaign from list:', await flash());
    if (!/^Added \d+/.test(await flash())) problems.push('[d78] add from list: ' + await flash());
    // The trigger "when I add this tag" is offered.
    if (!(await page.locator('select', { has: page.locator('option[value=tag_added]') }).count())) problems.push('[d78] no tag trigger in the editor');
    // Bulk: Add to a campaign.
    await page.goto(d78List);
    await page.getByRole('checkbox', { name: 'Select everyone on this page' }).check();
    await page.locator('.cc-bulkbar select').first().selectOption('campaign');
    await page.locator('.cc-bulkbar').getByRole('button', { name: 'Add to campaign' }).click();
    await page.locator('.cc-bulk .mlo-flash').waitFor(); console.log('d78: bulk campaign:', await page.locator('.cc-bulk .mlo-flash').innerText());
    if (!/Added \d+ (people|person)/.test(await page.locator('.cc-bulk .mlo-flash').innerText())) problems.push('[d78] bulk add to campaign: ' + await page.locator('.cc-bulk .mlo-flash').innerText());
    // Bulk: Check do-not-call opens Record permission for just these people.
    await page.getByRole('checkbox', { name: 'Select everyone on this page' }).check();
    await page.locator('.cc-bulkbar select').first().selectOption('check');
    await page.locator('.cc-bulkbar').getByRole('link', { name: 'Check them' }).click(); await page.waitForURL(/permission\?ids=/);
    console.log('d78: check:', await page.locator('#lines h2').innerText());
    // A call session from the list.
    await page.goto(B + '/mlo/calls');
    await page.locator('select[name=list]').selectOption({ label: 'QA WA past clients' });
    await page.getByRole('button', { name: 'Start', exact: true }).click(); await page.waitForURL(/list=lst_/);
    const head = await page.locator('main').innerText();
    if (!/From your list “QA WA past clients”/.test(head)) problems.push('[d78] call session not from the list');
    console.log('d78: calls:', (await page.locator('main h2').first().innerText()));
    // Campaign page stays reachable.
    await page.goto(camp);
  });
  // D79: replies land in the Inbox (a pretend text through /api/cc/dev-inbound, the same path a real one takes after the
  // signature check), reply from it, mark one Done, snooze one; Your settings; a new lead sends the alert (dev-mail in the log).
  await step('d79: inbox reply, done, snooze; settings; new-lead alert', async () => {
    const idOf = async (q, name) => { await page.goto(B + '/mlo/contacts?q=' + encodeURIComponent(q)); return ((await page.getByRole('link', { name }).first().getAttribute('href')) ?? '').split('/').pop().split('?')[0]; };
    const ann = await idOf('Lee', /Ann Lee/); const cy = await idOf('Ng', /Cy Ng/); const bo = await idOf('Park', /Bo Park/);
    if (!/^c_/.test(ann) || !/^c_/.test(cy) || !/^c_/.test(bo)) problems.push(`[d79] contacts not found: ${ann} ${cy} ${bo}`);
    // Ann can be texted (written permission), so a reply can go if her quiet hours allow.
    await page.goto(B + '/mlo/contacts/' + ann + '?tab=permission');
    const pf = page.locator('#permission form').first();
    await pf.locator('select[name=channel]').selectOption('text'); await pf.locator('select[name=evidence]').selectOption('written');
    await pf.locator('input[name=proof]').fill('Signed form, Nov 21'); await pf.getByRole('button', { name: 'Record it' }).click(); await page.waitForURL(/f=/);
    const before = await page.goto(B + '/mlo/inbox').then(() => page.locator('.cc-ibx-tabs a').first().innerText());
    for (const [id, body] of [[ann, 'Is the appraisal back yet?'], [cy, 'Thanks, got it.'], [bo, 'Can we talk tomorrow? <b>not bold</b>']]) {
      const r = await page.request.post(B + '/api/cc/dev-inbound', { data: { contactId: id, body } });
      if (r.status() !== 200) problems.push(`[d79] dev-inbound ${r.status()}`);
    }
    await page.goto(B + '/mlo/inbox');
    const tabs = await page.locator('.cc-ibx-tabs a').allInnerTexts();
    console.log('d79: tabs before/after:', before, '→', tabs.join(' | '));
    if (!/^Needs reply \(\d+\)$/.test(tabs[0]) || Number(tabs[0].match(/\d+/)[0]) < 3) problems.push('[d79] Needs reply count: ' + tabs[0]);
    const names = await page.locator('.cc-thread__name').allInnerTexts();
    for (const n of ['Ann Lee', 'Cy Ng', 'Bo Park']) if (!names.includes(n)) problems.push(`[d79] ${n} not in Needs reply: ${names.join(', ')}`);
    // Their words are text, never markup.
    if (await page.locator('.cc-thread__preview b').count()) problems.push('[d79] a reply rendered as HTML');
    if (!(await page.locator('.cc-thread__preview', { hasText: '<b>not bold</b>' }).count())) problems.push('[d79] the raw reply text is not shown as written');
    const badge = await page.locator('.cc-badge').allInnerTexts();
    console.log('d79: badges:', badge.join(','));
    // Open Ann: the pane, the slim card, the reply box.
    await page.locator('.cc-thread', { hasText: 'Ann Lee' }).click(); await page.waitForURL(/c=c_/);
    if (!/Ann Lee/.test(await page.locator('.cc-ibx-card').innerText())) problems.push('[d79] pane is not Ann');
    if (!(await page.locator('.cc-tl--in', { hasText: 'Is the appraisal back yet?' }).count())) problems.push('[d79] Ann\'s message not in the conversation');
    // Reply (texting isn't set up here, so it's "Text from my phone": the same checks, then logged).
    await page.locator('#phone-text textarea').fill('Yes, it came in at value. I will call you.');
    await page.locator('#phone-text').getByRole('button', { name: 'Open in Messages' }).click();
    await page.locator('#phone-text .mlo-flash').waitFor();
    const said = await page.locator('#phone-text .mlo-flash').innerText();
    console.log('d79: reply:', said.replace(/\n/g, ' | ').slice(0, 160));
    if (/Messages is opening/.test(said)) {
      await page.goto(B + '/mlo/inbox?tab=all&c=' + ann);
      if ((await page.locator('.cc-thread', { hasText: 'Ann Lee' }).getAttribute('data-state')) !== 'sent') problems.push('[d79] Ann still needs a reply after the reply');
      if (!(await page.locator('.cc-tl', { hasText: 'Yes, it came in at value.' }).count())) problems.push('[d79] the reply is not in the conversation');
    } else if (!/window|quiet|hours|opens/i.test(said)) problems.push('[d79] reply refused for a reason other than quiet hours: ' + said);
    // Done: Cy leaves Needs reply and shows under Done.
    await page.goto(B + '/mlo/inbox?c=' + cy);
    await page.locator('.cc-ibx-acts').getByRole('button', { name: 'Done', exact: true }).click(); await page.waitForURL(/f=/);
    console.log('d79: done:', await flash());
    if (!/Marked Cy done/.test(await flash())) problems.push('[d79] done flash: ' + await flash());
    if (await page.locator('.cc-thread', { hasText: 'Cy Ng' }).count()) problems.push('[d79] Cy still in Needs reply');
    await page.goto(B + '/mlo/inbox?tab=done');
    if (!(await page.locator('.cc-thread', { hasText: 'Cy Ng' }).count())) problems.push('[d79] Cy not under Done');
    // Snooze: Bo leaves Needs reply until tomorrow 9 AM.
    await page.goto(B + '/mlo/inbox?c=' + bo);
    await page.getByRole('button', { name: 'Snooze until tomorrow 9 AM' }).click(); await page.waitForURL(/f=/);
    console.log('d79: snooze:', await flash());
    if (!/Snoozed Bo until .* 9:00 AM/.test(await flash())) problems.push('[d79] snooze flash: ' + await flash());
    if (await page.locator('.cc-thread', { hasText: 'Bo Park' }).count()) problems.push('[d79] Bo still in Needs reply');
    await page.goto(B + '/mlo/inbox?tab=all');
    if (!/Snoozed until/.test(await page.locator('.cc-thread', { hasText: 'Bo Park' }).innerText())) problems.push('[d79] Bo not shown as snoozed in All');
    // A new message from Cy brings the conversation back.
    await page.request.post(B + '/api/cc/dev-inbound', { data: { contactId: cy, body: 'One more question' } });
    await page.goto(B + '/mlo/inbox');
    if (!(await page.locator('.cc-thread', { hasText: 'Cy Ng' }).count())) problems.push('[d79] Cy did not come back after writing again');
    // Your settings: Eastern, text and email, alerts any time.
    await page.goto(B + '/mlo/settings');
    await page.locator('select[name=timeZone]').selectOption('America/New_York');
    await page.getByLabel('Text and email').check();
    await page.locator('input[name=alertPhone]').fill('(206) 555-0123');
    await page.getByRole('button', { name: 'Save', exact: true }).click(); await page.waitForURL(/f=/);
    if (!/isn't a US mobile number/.test(await flash())) problems.push('[d79] a fake mobile number was accepted: ' + await flash());
    await page.locator('select[name=timeZone]').selectOption('America/New_York');
    await page.getByLabel('Email', { exact: true }).check();
    await page.locator('input[name=alertPhone]').fill('');
    await page.locator('select[name=alertFrom]').selectOption('0'); await page.locator('select[name=alertTo]').selectOption('24');
    await page.getByRole('button', { name: 'Save', exact: true }).click(); await page.locator('.mlo-flash--ok').waitFor();
    console.log('d79: settings:', await flash(), '|', await page.locator('#alerts .mlo-note').last().innerText());
    if (!/Saved/.test(await flash())) problems.push('[d79] settings not saved: ' + await flash());
    if ((await page.locator('select[name=timeZone]').inputValue()) !== 'America/New_York') problems.push('[d79] time zone not kept');
    // A new lead: alert email (no Resend here, so the dev server logs it).
    const t0 = Date.now();
    const r = await page.request.post(B + '/api/leads/inbound?source=Zillow', { headers: { 'X-CC-Key': key }, data: { first_name: 'Wes', last_name: 'Ray', phone: '(206) 234-7781', email: 'wes@example.com', state: 'WA', message: 'Call me after 5' } });
    console.log('d79: lead:', r.status(), 'in', Date.now() - t0, 'ms');
    const log = process.env.QA_SERVER_LOG && fs.existsSync(process.env.QA_SERVER_LOG) ? fs.readFileSync(process.env.QA_SERVER_LOG, 'utf8') : '';
    const mail = log.split('\n').filter((l) => l.includes('[dev-mail]') && l.includes('New lead: Wes')).pop();
    if (!process.env.QA_SERVER_LOG) console.log('d79: alert: set QA_SERVER_LOG to check the alert email');
    else if (!mail) problems.push('[d79] no new-lead alert in the server log');
    else {
      console.log('d79: alert:', mail.slice(0, 220));
      if (!/"subject":"New lead: Wes, WA, from Zillow"/.test(mail)) problems.push('[d79] alert subject: ' + mail.slice(0, 200));
      if (/234-7781|2342347781|wes@example|Call me|Ray/.test(mail)) problems.push('[d79] alert carries more than name, state and source');
      if (!/\/mlo\/contacts\/c_/.test(mail)) problems.push('[d79] alert has no link to the contact');
    }
    // Times in the Inbox follow the zone picked (Eastern now).
    await page.goto(B + '/mlo/inbox?tab=all&c=' + cy);
    console.log('d79: time shown:', await page.locator('.cc-tl time').first().innerText());
  });
  // D80: import a file with loan columns, accept the suggested lists, ask for "closed with a rate from 7.2% to 9%",
  // change a chip, save it, open the saved list, add it to a campaign (the gate decides), freeze one, the loan
  // fields on a contact (and the edit checks them), and a protected-trait ask refused.
  const D80 = process.env.QA_D80_SHOTS || '';
  if (D80) fs.mkdirSync(D80, { recursive: true });
  const shot = async (n) => { if (D80) await page.screenshot({ path: path.join(D80, `${n}.png`), fullPage: true }); };
  await step('d80: loan import, suggested lists, ask, chips, save, campaign, freeze, loan tab', async () => {
    const FX = path.join(process.cwd(), 'tests/fixtures/import/loans-programs.csv');
    await page.goto(B + '/mlo/contacts/import'); await page.locator('input[type=file]').waitFor();
    await page.setInputFiles('input[type=file]', FX);
    await toColumns();
    const card = (h) => page.locator('.im-col', { has: page.locator('.im-col__h', { hasText: h }) });
    const prog = await card('Program').locator('select').inputValue();
    if (prog !== 'loanProgram') problems.push('[d80] Program column goes into ' + prog);
    if ((await card('Lender').locator('select').inputValue()) !== 'lender') problems.push('[d80] Lender column not matched');
    const marital = card('Marital Status');
    if (!/Not imported/.test(await marital.locator('.im-chip').textContent()) || !(await marital.locator('select').isDisabled())) problems.push('[d80] Marital Status column is not "Not imported"');
    console.log('d80: marital card:', ((await marital.locator('.im-col__note').textContent().catch(() => '')) || '').slice(0, 90));
    if (!(await page.locator('.im-colpanel').first().evaluate((d) => d.open))) await page.locator('.im-colpanel > summary').first().click();
    await shot('1-columns');
    await toReview();
    await page.locator('#im-lists-title').waitFor();
    const rows = page.locator('.im-lists__row');
    await page.waitForFunction(() => document.querySelectorAll('.im-lists__row').length > 0);
    const names = await rows.locator('.im-lists__pick strong').allInnerTexts();
    console.log('d80: suggested:', names.join(' | '));
    for (const want of ['Real estate agents', '2025 closed loans', '2024 closed loans', 'ARM loans', 'FHA and VA', 'Rate 7% and up']) if (!names.includes(want)) problems.push('[d80] suggestion missing: ' + want);
    const agentsBox = await page.locator('.im-lists__info').innerText();
    if (!/2 real estate agents in this file go to Agents/.test(agentsBox)) problems.push('[d80] agents box: ' + agentsBox.slice(0, 120));
    // Rename one, drop one, describe another.
    const arm = rows.filter({ hasText: 'ARM loans' });
    await arm.getByRole('button', { name: 'Rename or edit' }).click();
    await arm.locator('.im-lists__editor input').fill('QA ARM loans');
    await rows.filter({ hasText: 'Rate 7% and up' }).locator('input[type=checkbox]').uncheck();
    await page.locator('#im-lists-ask').fill('Loans over $500k');
    await page.locator('.im-lists__ask').getByRole('button', { name: 'Add list' }).click();
    await page.locator('.im-lists__row', { hasText: 'Loans over $500k' }).waitFor();
    console.log('d80: total:', await page.locator('.im-lists__total').innerText());
    await shot('2-suggested-lists');
    await finish();
    const made = await page.locator('.im-next__tile', { hasText: /ARM|closed loans|agents|FHA|500k/ }).allInnerTexts();
    console.log('d80: done lists:', made.map((t) => t.split('\n')[0]).join(' | '));
    if (!made.some((t) => /QA ARM loans/.test(t))) problems.push('[d80] renamed list not made');
    if (!made.some((t) => /already your list “Agents”/.test(t))) problems.push('[d80] the agents list did not link to Agents');
    if (made.some((t) => /Rate 7% and up/.test(t))) problems.push('[d80] an unchecked list was made');
    await shot('3-done');
    await page.locator('.im-next__tile', { hasText: 'QA ARM loans' }).click(); await page.waitForURL(/rtype=arm/);
    const armN = await page.locator('.cc-people > li').count();
    const loanLine = await page.locator('.cc-person__loan').first().innerText().catch(() => '');
    console.log('d80: ARM list:', armN, 'people; first loan line:', loanLine);
    if (armN < 3 || !/ARM/.test(loanLine)) problems.push(`[d80] ARM list: ${armN} people, line "${loanLine}"`);
    // Agents went to Agents.
    await page.goto(B + '/mlo/contacts?kind=agent&q=Turner');
    if (!(await page.locator('.cc-people > li', { hasText: 'Jake Turner' }).count())) problems.push('[d80] the realtor in the client file is not under Agents');
    // Ask M8 for a list (no AI key here: the words are read).
    await page.goto(B + '/mlo/contacts');
    await page.locator('#cc-ask-input').fill('All loans closed with a rate from 7.2% to 9%');
    await page.locator('.cc-ask').getByRole('button', { name: 'Ask', exact: true }).click(); await page.waitForURL(/rmin=7\.2/);
    const asChips = await page.locator('.cc-ask__chips .cc-tag').allInnerTexts();
    console.log('d80: read as:', await page.locator('.cc-ask__as').innerText(), asChips.join(' | '));
    if (!asChips.includes('Has a closed date') || !asChips.includes('Note rate 7.200% to 9.000%')) problems.push('[d80] ask chips: ' + asChips.join(' | '));
    const asked = await page.locator('.cc-people > li').count();
    const lines = await page.locator('.cc-person__loan').allInnerTexts();
    console.log('d80: ask found', asked, '|', lines.slice(0, 3).join(' / '));
    if (asked < 5) problems.push('[d80] the rate ask found ' + asked);
    for (const l of lines) { const r = Number((/^(\d+\.\d{3})%/.exec(l) || [])[1]); if (!(r >= 7.2 && r <= 9)) problems.push('[d80] a rate outside 7.2–9: ' + l); }
    if (!(await page.locator('.cc-ratenote').count())) problems.push('[d80] no "for your eyes only" rate note');
    await shot('4-ask-result');
    // Change a chip: rate to 8%.
    await page.locator('.cc-ask__chips').getByRole('button', { name: 'Change: Note rate 7.200% to 9.000%' }).click();
    await page.locator('.cc-ask__edit input').nth(1).fill('8');
    await shot('5-edit-chip');
    await page.locator('.cc-ask__edit').getByRole('button', { name: 'Show them' }).click(); await page.waitForURL(/rmax=8/);
    const edited = await page.locator('.cc-people > li').count();
    if (!(await page.locator('.cc-ask__chips .cc-tag', { hasText: 'Note rate 7.200% to 8.000%' }).count())) problems.push('[d80] the edited chip is not shown');
    if (edited >= asked) problems.push(`[d80] narrowing the rate kept ${edited} of ${asked}`);
    // Save it, then open it from Everyone.
    await page.locator('.cc-savelist input[name=name]').fill('QA rate 7.2 to 8');
    await page.locator('.cc-savelist').getByRole('button', { name: 'Save list' }).click(); await page.waitForURL(/f=/);
    if (!/Saved “QA rate 7.2 to 8”/.test(await flash())) problems.push('[d80] save: ' + await flash());
    await page.goto(B + '/mlo/contacts');
    await page.locator('.cc-listrow').getByRole('link', { name: 'QA rate 7.2 to 8', exact: true }).click(); await page.waitForURL(/rmax=8/);
    if ((await page.locator('.cc-people > li').count()) !== edited) problems.push('[d80] the saved list opens a different count');
    const saved = page.url();
    await shot('6-saved-list');
    // Add it to a campaign from the result bar: the gate decides who goes in.
    await page.locator('.cc-resultline').getByRole('link', { name: 'Add to campaign' }).click(); await page.waitForURL(/act=campaign/);
    if (await page.locator('.cc-bulkbar').getByRole('button', { name: 'Add to campaign' }).count()) {
      await page.locator('.cc-bulkbar').getByRole('button', { name: 'Add to campaign' }).click();
      await page.locator('.cc-bulk .mlo-flash').waitFor();
      const said = await page.locator('.cc-bulk .mlo-flash').innerText();
      console.log('d80: campaign:', said.slice(0, 200));
      if (!/Added \d+/.test(said)) problems.push('[d80] add to campaign: ' + said);
    } else console.log('d80: campaign: no campaign to add to');
    await shot('7-campaign');
    // Freeze the saved list.
    await page.goto(saved);
    await page.locator('details.cc-savelist > summary').click();
    await page.locator('details.cc-savelist').getByRole('button', { name: 'Freeze this list' }).click(); await page.waitForURL(/f=/);
    console.log('d80: freeze:', await flash());
    if (!/Froze “QA rate 7.2 to 8” with \d+/.test(await flash())) problems.push('[d80] freeze: ' + await flash());
    // ARMs by words, and a protected-trait ask refused.
    await page.goto(B + '/mlo/contacts');
    await page.locator('#cc-ask-input').fill('loans with ARMs');
    await page.locator('.cc-ask').getByRole('button', { name: 'Ask', exact: true }).click(); await page.waitForURL(/rtype=arm/);
    await page.locator('#cc-ask-input').fill('past clients with kids');
    await page.locator('.cc-ask').getByRole('button', { name: 'Ask', exact: true }).click();
    await page.locator('.cc-ask__error').waitFor();
    if (!/protected traits/.test(await page.locator('.cc-ask__error').innerText())) problems.push('[d80] protected ask: ' + await page.locator('.cc-ask__error').innerText());
    await shot('8-refused');
    // The loan fields on a contact, and the edit checks them.
    await page.goto(B + '/mlo/contacts?q=Priya');
    await page.getByRole('link', { name: /Priya Nair/ }).first().click(); await page.waitForURL(/contacts\/c_/);
    const cid = page.url().split('/').pop().split('?')[0];
    await page.goto(B + `/mlo/contacts/${cid}?tab=loan`);
    const dl = await page.locator('#loan-details dl').innerText();
    console.log('d80: loan tab:', dl.replace(/\n/g, ' ').slice(0, 200));
    for (const w of ['8.125%', 'ARM', 'Refinance', 'Kind Lending']) if (!dl.includes(w)) problems.push('[d80] loan tab lacks ' + w);
    await page.locator('#loan-details summary').click();
    await page.locator('#loan-details input[name=noteRate]').fill('45');
    await page.locator('#loan-details').getByRole('button', { name: 'Save loan details' }).click(); await page.waitForURL(/f=/);
    if (!/Note rate: a percent/.test(await flash())) problems.push('[d80] a 45% rate was accepted: ' + await flash());
    if (!(await page.locator('#loan-details details').evaluate((d) => d.open))) await page.locator('#loan-details summary').click();
    await page.locator('#loan-details input[name=noteRate]').fill('8.125');
    await page.locator('#loan-details select[name=occupancy]').selectOption('primary');
    const before = page.url();
    await page.locator('#loan-details').getByRole('button', { name: 'Save loan details' }).click(); await page.waitForURL((u) => u.toString() !== before);
    if (!/Loan details saved/.test(await flash())) problems.push('[d80] loan save: ' + await flash());
    await shot('9-loan-tab');
  });
  // Every page, both widths. D72: body.scrollWidth too (html{overflow-x:clip} hides overflow from documentElement).
  const pages = ['/mlo', '/mlo/concierge', '/mlo/scripts', '/mlo/calls', '/mlo/automations', '/mlo/refi', '/mlo/report', '/mlo/inbox', '/mlo/inbox?tab=all', '/mlo/inbox?tab=done', '/mlo/settings', '/mlo/pipeline', '/mlo/contacts', '/mlo/contacts?kind=agent', '/mlo/contacts?tag=QA%20list&select=all', '/mlo/contacts?state=WA&rel=past_client&perm=relationship&contacted=q30&noreply=1&select=all', '/mlo/calls?list=d-past', '/mlo/contacts?rmin=7.2&rmax=9&closed=1&asked=words', '/mlo/contacts?prog=fha,va&rtype=arm&cfrom=2023-01-01&cto=2025-12-31&select=all', '/mlo/contacts/import', '/mlo/contacts/import/history', '/mlo/contacts/permission', '/mlo/leads', '/mlo/rules', '/mlo/team', '/mlo/network', '/mlo/security', '/mlo/expenses', '/mlo/expenses/report', '/mlo/templates', '/mlo/templates?k=rebuttal', '/mlo/academy', '/mlo/academy/p5', '/mlo/academy/l2', '/mlo/messages', '/mlo/texting', '/mlo/launch', '/mlo/setup', '/mlo/pricing', '/mlo/voice', '/mlo/training', '/mlo/loa', '/mlo/agents', '/mlo/campaigns', '/mlo/campaigns?new=1', '/mlo/connections', '/mlo/connections?sys=arive', '/mlo/videos', '/mlo/voicemail', '/mlo/cards', '/mlo/email', '/mlo/welcome'];
  for (const w of [390, 1280]) {
    await page.setViewportSize({ width: w, height: 900 });
    for (const p of pages) await step(`${p} @${w}`, async () => {
      const r = await page.goto(B + p);
      if (!r || r.status() >= 400) problems.push(`[${p} @${w}] status ${r && r.status()}`);
      if (await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) > window.innerWidth + 1)) problems.push(`[${p} @${w}] horizontal overflow`);
      if ((await page.locator('h1').count()) !== 1) problems.push(`[${p} @${w}] h1 count ${await page.locator('h1').count()}`);
    });
  }
  // D77: the contact page's tabs at both widths.
  for (const w of [390, 1280]) {
    await page.setViewportSize({ width: w, height: 900 });
    for (const t of ['conversation', 'details', 'loan', 'permission']) await step(`contact ${t} @${w}`, async () => {
      if (!d77) return;
      const r = await page.goto(d77 + '?tab=' + t);
      if (!r || r.status() >= 400) problems.push(`[contact ${t} @${w}] status ${r && r.status()}`);
      if (await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) > window.innerWidth + 1)) problems.push(`[contact ${t} @${w}] horizontal overflow`);
      if ((await page.locator('h1').count()) !== 1) problems.push(`[contact ${t} @${w}] h1 count`);
    });
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  // Flows.
  const openContact = async (name, tab) => { await page.goto(B + '/mlo/contacts?q=' + encodeURIComponent(name.split(' ')[1])); await page.getByRole('link', { name: new RegExp(name) }).first().click(); await page.locator('.cc-contact-head').waitFor(); if (tab) await page.getByRole('tab', { name: tab }).click(); };
  await step('contact: consent', async () => {
    await openContact('Ann Lee', 'Permission');
    const f = page.locator('#permission form').first();
    console.log('perm form fields:', await f.locator('select, input').evaluateAll((els) => els.map((e) => e.name)));
  });
  await step('contact: dnc', async () => { await openContact('Ann Lee', 'Permission'); const f = page.locator('form', { has: page.locator('select[name=onList]') }); await f.locator('input[name=source]').fill('Registry'); await f.getByRole('button', { name: 'Record check' }).click(); await page.waitForURL(/f=/); console.log('dnc:', await flash()); });
  await step('contact: rnd', async () => { await openContact('Ann Lee', 'Permission'); const f = page.locator('form', { has: page.locator('select[name=result]') }).last(); await f.locator('input[name=since]').fill('2020-11-20'); await f.getByRole('button', { name: 'Record check' }).click(); await page.waitForURL(/f=/); console.log('rnd:', await flash()); });
  await step('contact: script', async () => { await openContact('Ann Lee', 'Loan & agent'); await page.getByRole('button', { name: 'Build my script' }).click(); await page.locator('.cs-script').waitFor(); console.log('script:', await flash()); });
  await step('contact: debrief', async () => { await openContact('Ann Lee'); await page.locator('#debrief > summary').click(); await page.locator('#debrief textarea').fill('Talked to Ann about a kitchen remodel next spring.'); await page.getByRole('button', { name: 'Save the note' }).click(); await page.locator('#debrief .mlo-flash').waitFor(); console.log('debrief:', (await page.locator('#debrief .mlo-flash').innerText()).replace(/\n/g, ' ')); });
  await step('contact: their page link', async () => { await openContact('Ann Lee', 'Details'); console.log('their-page:', (await page.locator('#their-page').innerText()).replace(/\n/g, ' | ').slice(0, 120)); });
  await step('bulk permission', async () => { await page.goto(B + '/mlo/contacts/permission'); await page.locator('input[name=proof]').fill('Consent in our loan application, e-signed; copies in ARIVE'); await page.locator('input[name=namesUs]').check(); await page.locator('input[name=canProduce]').check(); await page.getByRole('button', { name: /^Record permission/ }).click(); await page.waitForURL(/f=/); console.log('bulk:', await flash()); });
  await step('rnd bulk', async () => { await page.goto(B + '/mlo/contacts/permission'); const list = await page.locator('#rnd pre').innerText().catch(() => ''); const rows = list.split('\n').filter(Boolean).map((l) => `${l},no`).join('\n'); await page.locator('#rnd textarea').fill(rows || '(206) 555-1234,2020-11-20,no'); await page.locator('#rnd').getByRole('button', { name: 'Record results' }).click(); await page.waitForURL(/f=/); console.log('rnd bulk:', await flash()); });
  await step('calls: log', async () => { await page.goto(B + '/mlo/calls'); const n = await page.locator('#next').count(); console.log('calls ready:', n); if (n) { await page.locator('#next').getByRole('button', { name: 'No answer' }).click(); await page.waitForURL(/f=/); console.log('call:', await flash()); } });
  await step('concierge: settings + run', async () => { await page.goto(B + '/mlo/concierge'); await page.locator('input[name=enabled]').check(); await page.locator('input[name=voice]').fill('friendly, short'); await page.getByRole('button', { name: 'Save' }).click(); await page.waitForURL(/f=/); await page.getByRole('button', { name: 'Run now' }).click(); await page.locator('.mlo-flash', { hasText: 'Looked at' }).waitFor(); console.log('sweep:', await flash()); });
  await step('concierge: dismiss draft', async () => { await page.goto(B + '/mlo/concierge'); const d = page.locator('#drafts').getByRole('button', { name: 'Skip' }); const n = await d.count(); console.log('drafts:', n); if (n) { await d.first().click(); await page.waitForURL(/f=/); console.log('dismiss:', await flash()); } });
  await step('concierge: tell (no key)', async () => { await page.goto(B + '/mlo/concierge'); await page.locator('#tell textarea').fill('Draft a check-in to my past clients'); await page.getByRole('button', { name: 'Draft it' }).click(); await page.locator('#tell [role=status]').waitFor(); console.log('tell:', (await page.locator('#tell [role=status]').innerText()).slice(0, 120)); });
  await step('automations', async () => {
    // D76: folded sections with a count, one switch per row, a save bar after a change.
    await page.goto(B + '/mlo/automations');
    if (await page.locator('.cc-savebar').isVisible()) problems.push('[automations] the save bar shows before any change');
    await page.locator('#borrower_updates > summary').click();
    await page.getByRole('radiogroup', { name: 'Borrower: appraisal ordered' }).getByRole('radio', { name: 'LO-Auth' }).check();
    console.log('auto count:', await page.locator('#borrower_updates [data-count-out]').innerText());
    await page.getByRole('button', { name: 'Save changes' }).click(); await page.waitForURL(/f=/); console.log('auto:', await flash());
  });
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
    const when = (await page.locator('#sendwhen').textContent()) ?? '';
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
    await openContact('Ann Lee', 'Details'); const link = (await page.locator('#their-page code').innerText().catch(() => '')).trim();
    if (!link) { console.log('client page: no link (no secret)'); return; }
    const local = link.replace(/^https?:\/\/[^/]+/, B);
    const p2 = await ctx.newPage(); await p2.goto(local);
    console.log('client page h1:', await p2.locator('h1').innerText());
    await p2.getByRole('button', { name: 'Stop email' }).click(); await p2.waitForURL(/m=/); console.log('client stop email:', (await p2.locator('.mlo-flash').innerText()).slice(0, 80));
    await p2.close();
  });
  await step('client page: where is my loan', async () => {
    await openContact('Bo Park', 'Details'); const link = (await page.locator('#their-page code').innerText().catch(() => '')).trim();
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
    if (n) await page.locator('#email > summary').click();
    console.log('email composer:', n ? 'shown' : 'none (no email on file)');
    const send = page.locator('#email').getByRole('button', { name: 'Send email' });
    if (n && await send.isDisabled()) { console.log('email: not connected here (no mailbox or Resend):', (await page.locator('#email .mlo-note').last().innerText()).slice(0, 80)); return; }
    if (n) { await page.locator('#email input[name=subject]').fill('Re: checking in'); await page.locator('#email textarea').fill('Hi Ann, just checking in.'); await page.locator('#email').getByRole('button', { name: 'Send email' }).click(); await page.waitForURL(/f=/); console.log('email (bad subject):', await flash()); }
  });
  await step('email page (D52)', async () => {
    await page.goto(B + '/mlo/email');
    const t = (await page.locator('main').textContent()) ?? '';
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
