// D89.2 hydration check. Needs Playwright available to Node and a local server on http://localhost:3100
// started like command-center.mjs (CC_DEV_LOGIN=1 … NEXT_PUBLIC_STEALTH_MODE=false; seeded data helps, so run
// it after command-center.mjs on the same server).
//
// The rare React #418 ("server rendered HTML didn't match the client") happened when Next.js started
// hydrating before the rest of a streamed page had arrived (a busy server or a slow network). This script
// makes that happen on purpose, two ways:
//   1. slow: a small proxy in front of :3100 sends each page's HTML in pieces (everything up to the second
//      flight-data script, then one script every QA_PAUSE ms, default 40), one page at a time;
//   2. busy: QA_PAR browsers (default 6) load pages straight from :3100 at the same time.
// Before the fix, (1) failed on most loads of Home and often on Pricing and Call scripts, and (2) on about
// 1 in 100 loads. Signed in as the owner, it loads Command Center pages at 390px and 1280px and fails on any
// page error, console error or missing h1. Env: QA_LOADS = loads per mode (default 240), QA_CHROME = a
// Chromium binary (optional). Exits 1 on any problem.
import http from 'node:http';
import { chromium } from 'playwright';

const B = 'http://localhost:3100';
const LOADS = Number(process.env.QA_LOADS || 240);
const PAR = Number(process.env.QA_PAR || 6);
const PAUSE = Number(process.env.QA_PAUSE || 40);
const IGNORE_CONSOLE = [/_vercel\/insights/, /_vercel\/speed-insights/, /404 \(Not Found\)/];

// The slow proxy: same pages, HTML in pieces.
const proxy = http.createServer((req, res) => {
  const up = http.request({ host: '127.0.0.1', port: 3100, path: req.url, method: req.method, headers: { ...req.headers, host: 'localhost:3100', 'accept-encoding': 'identity' } }, (r) => {
    if (!/text\/html/.test(r.headers['content-type'] || '')) { res.writeHead(r.statusCode, r.headers); r.pipe(res); return; }
    const bufs = [];
    r.on('data', (c) => bufs.push(c));
    r.on('end', async () => {
      const headers = { ...r.headers };
      delete headers['content-length'];
      delete headers['transfer-encoding'];
      res.writeHead(r.statusCode, headers);
      const parts = Buffer.concat(bufs).toString('utf8').split(/(?=<script>self\.__next_f\.push\(\[1,)/);
      res.write(parts.slice(0, 2).join(''));
      for (const p of parts.slice(2)) { await new Promise((ok) => setTimeout(ok, PAUSE)); res.write(p); }
      res.end();
    });
  });
  up.on('error', () => { res.writeHead(502); res.end(); });
  req.pipe(up);
});
await new Promise((ok) => proxy.listen(0, '127.0.0.1', ok));
const SLOW = `http://localhost:${proxy.address().port}`;

const b = await chromium.launch({ executablePath: process.env.QA_CHROME || undefined });
const problems = [];
const counts = { slow: 0, busy: 0 };

// Pages where the error was seen (D32–D89.1), plus a few more of the busiest.
const pages = ['/mlo', '/mlo/pricing', '/mlo/calls?list=d-past', '/mlo/calls', '/mlo/leads/plan', '/mlo/leads', '/mlo/scripts', '/mlo/contacts', '/mlo/contacts/import', '/mlo/inbox', '/mlo/team'];
{
  const ctx = await b.newContext();
  const page = await ctx.newPage();
  await page.goto(B + '/api/cc/dev-login?email=owner@example.com');
  await page.goto(B + '/mlo/contacts');
  const contact = await page.locator('a[href^="/mlo/contacts/c_"]').first().getAttribute('href').catch(() => null);
  if (contact) pages.push(contact);
  await ctx.close();
}

async function run(mode, base, workers) {
  let next = 0;
  await Promise.all(Array.from({ length: workers }, async (_, w) => {
    const width = w % 2 ? 390 : 1280;
    const ctx = await b.newContext({ viewport: { width, height: width === 390 ? 844 : 900 } });
    const page = await ctx.newPage();
    await page.goto(base + '/api/cc/dev-login?email=owner@example.com');
    let errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !IGNORE_CONSOLE.some((r) => r.test(m.text()))) errors.push('console: ' + m.text()); });
    while (next < LOADS) {
      const i = next++;
      // Single-worker runs alternate widths per load; parallel runs keep one width per worker.
      if (workers === 1) await page.setViewportSize(i % 2 ? { width: 390, height: 844 } : { width: 1280, height: 900 });
      const p = pages[Math.floor(i / (workers === 1 ? 2 : 1)) % pages.length];
      const w = page.viewportSize().width;
      errors = [];
      try {
        const r = await page.goto(base + p, { waitUntil: 'load', timeout: 60000 });
        await page.waitForTimeout(150);
        if (!r || r.status() >= 400) errors.push(`HTTP ${r?.status()}`);
        if ((await page.locator('h1').count()) !== 1) errors.push('not exactly one h1');
      } catch (e) {
        errors.push('load: ' + e.message.split('\n')[0]);
      }
      counts[mode]++;
      for (const e of errors) problems.push(`[${mode} ${p} @${w}] ${e.slice(0, 240)}`);
    }
    await ctx.close();
  }));
}

await run('slow', SLOW, 1);
await run('busy', B, PAR);
await b.close();
proxy.close();

const hydration = problems.filter((p) => /418|[Hh]ydrat/.test(p)).length;
console.log(`hydration: ${counts.slow} slow-stream loads + ${counts.busy} busy-server loads over ${pages.length} pages at 390/1280; React #418 / hydration errors: ${hydration}`);
console.log(problems.length ? 'PROBLEMS:\n' + problems.join('\n') : 'PROBLEMS: none');
process.exit(problems.length ? 1 : 0);
