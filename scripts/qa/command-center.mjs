// LoanM8 Command Center QA sweep (D28). Needs Playwright available to Node and a local
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

  await page.goto(B + '/api/cc/dev-login?email=owner@example.com');
  await step('import', async () => {
    await page.goto(B + '/mlo/contacts/import'); await page.locator('input[type=file]').waitFor();
    await page.setInputFiles('input[type=file]', CSV);
    await page.getByText('My own relationships').click();
    await page.getByRole('button', { name: /^Import \d+ people/ }).click();
    await page.getByRole('heading', { name: 'Imported' }).waitFor();
  });
  let key = '';
  await step('pipeline key + loan + lead', async () => {
    await page.goto(B + '/mlo/pipeline');
    await page.getByRole('button', { name: 'Make a connection key' }).click();
    key = (await page.locator('code.mlo-code').nth(1).innerText()).trim();
    for (const st of ['Application Taken', 'Initial Disclosures Sent']) await page.request.post(B + '/api/pipeline/inbound', { headers: { 'X-CC-Key': key }, data: { loanNumber: 'L-1', borrowerFirstName: 'Bo', borrowerLastName: 'Park', borrowerPhone: '425-555-2222', loanStatus: st, loanPurpose: 'Purchase', applicationDate: '2026-11-17', closingDate: '2026-12-04', buyerAgentName: 'Al Agent' } });
    await page.request.post(B + '/api/leads/inbound?source=zillow', { headers: { 'X-CC-Key': key }, data: { first_name: 'Eve', last_name: 'Ng', phone: '(503) 555-2468' } });
  });
  // Every page, both widths.
  const pages = ['/mlo', '/mlo/concierge', '/mlo/scripts', '/mlo/calls', '/mlo/automations', '/mlo/refi', '/mlo/report', '/mlo/inbox', '/mlo/pipeline', '/mlo/contacts', '/mlo/contacts?kind=agent', '/mlo/contacts/import', '/mlo/contacts/permission', '/mlo/leads', '/mlo/rules', '/mlo/team', '/mlo/network', '/mlo/security', '/mlo/expenses', '/mlo/expenses/report', '/mlo/messages', '/mlo/texting', '/mlo/launch', '/mlo/setup', '/mlo/pricing', '/mlo/voice', '/mlo/training'];
  for (const w of [390, 1280]) {
    await page.setViewportSize({ width: w, height: 900 });
    for (const p of pages) await step(`${p} @${w}`, async () => {
      const r = await page.goto(B + p);
      if (!r || r.status() >= 400) problems.push(`[${p} @${w}] status ${r && r.status()}`);
      if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) problems.push(`[${p} @${w}] horizontal overflow`);
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
    if (n) { await page.locator('#email input[name=subject]').fill('Re: checking in'); await page.locator('#email textarea').fill('Hi Ann, just checking in.'); await page.locator('#email').getByRole('button', { name: 'Send email' }).click(); await page.waitForURL(/f=/); console.log('email (bad subject):', await flash()); }
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
  console.log('\nPROBLEMS:', problems.length ? '\n' + problems.join('\n') : 'none');
  await b.close();
  process.exit(problems.length ? 1 : 0);
})();
