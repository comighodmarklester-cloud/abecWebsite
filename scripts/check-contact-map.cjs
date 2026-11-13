// Provider cases are intercepted in an isolated HTTPS fixture; no public tile requests.
delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const fixtureHttps = require('./lib/fixture-https.cjs');
const { chromium } = require(process.env.ABEC_PLAYWRIGHT_MODULE || 'playwright');
const root = process.cwd(), output = path.join(root, 'artifacts', 'contact-map');
fs.mkdirSync(output, { recursive: true });
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64');
let checks = 0;
function check(ok, label) { assert.ok(ok, label); checks++; }
const tls = fixtureHttps((req, res) => {
  const url = new URL(req.url, 'https://localhost');
  if (url.pathname.startsWith('/api/')) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"success":true,"data":[]}'); return; }
  const file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
  if (!(file.startsWith(path.join(root, 'Views') + path.sep) || file.startsWith(path.join(root, 'wwwroot') + path.sep)) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json' }[path.extname(file)] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': type, 'Referrer-Policy': 'same-origin' }); fs.createReadStream(file).pipe(res);
});
(async () => {
 await new Promise(resolve => tls.server.listen(0, '127.0.0.1', resolve));
 const base = 'https://127.0.0.1:' + tls.server.address().port;
 const browser = await chromium.launch({ channel: 'msedge', headless: true, args: tls.browserArgs });
 const cases = [], errors = [];
 try {
  for (const width of [320, 390, 1366]) for (const mode of ['primary', 'fallback', 'unavailable']) {
   const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width < 700, hasTouch: width < 700 });
   const requests = [];
   await context.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (/tile.openstreetmap.org|basemaps.cartocdn.com/.test(url.hostname)) {
     const headers = await req.allHeaders(), fallback = url.hostname.endsWith('basemaps.cartocdn.com');
     requests.push({ fallback, referer: headers.referer });
     const ok = mode === 'primary' || mode === 'fallback' && fallback;
     await route.fulfill({ status: ok ? 200 : 503, contentType: ok ? 'image/png' : 'text/plain', body: ok ? png : 'Synthetic provider outage' }); return;
    }
    if (url.origin !== base) { await route.abort(); return; }
    if (url.pathname === '/api/courses') { await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data: [{ courseId: 2, courseName: 'Bookkeeping NC II', totalHours: 448, trainingDays: 37, ojtDays: 19 }] }) }); return; }
    await route.continue();
   });
   const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
   await page.goto(base + '/Views/Home/LandingPage.html', { waitUntil: 'load' });
   await page.locator('#abec-contact-map').scrollIntoViewIfNeeded();
   await page.waitForFunction(mode => mode === 'unavailable' ? !document.getElementById('abec-map-status').hidden : document.querySelectorAll('#abec-contact-map .leaflet-tile-loaded').length > 0, mode, { timeout: 20000 });
   check(requests.length > 0 && requests.every(r => r.referer === base + '/'), 'Map sends origin-only referrer under the production page policy');
   check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Contact map page fits ' + width + 'px');
   check((await page.locator('.abec-directions').getAttribute('href')).includes('3F+PVLB+Building'), 'Directions use the office address consistently');
   check((await page.locator('#course-detail-bookkeeping h3').innerText()) === 'Bookkeeping NC II', 'Public course qualification comes from the shared catalog');
   if (mode === 'unavailable') check(await page.locator('#abec-map-status').isVisible() && (await page.locator('#abec-map-status').innerText()).includes('Get Directions'), 'Provider outage has visible accessible fallback');
   else check(!(await page.locator('#abec-map-status').isVisible()), 'Successful tiles hide the failure message');
   if (mode === 'fallback') check(requests.some(r => r.fallback), 'A failed primary provider switches to the secondary even on small screens');
   await page.locator('#abec-contact-map').screenshot({ path: path.join(output, width + '-' + mode + '.png') });
   if (width === 320 && mode === 'primary') {
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.waitForFunction(() => { var r = document.getElementById('mobile-menu-toggle').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; });
    await page.screenshot({ path: path.join(output, 'menu-debug.png') });
    fs.writeFileSync(path.join(output, 'menu-debug.json'), JSON.stringify(await page.evaluate(() => {
      var button = document.getElementById('mobile-menu-toggle'), rect = button.getBoundingClientRect(), hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      return { button: rect.toJSON(), hit: hit && { tag: hit.tagName, id: hit.id, className: hit.className }, nodes: [button, button.parentElement, button.parentElement.parentElement, document.querySelector('.abec-topnav-inner')].map(el => ({ className: el.className, rect: el.getBoundingClientRect().toJSON(), zIndex: getComputedStyle(el).zIndex, pointerEvents: getComputedStyle(el).pointerEvents })) };
    }), null, 2));
    await page.locator('#mobile-menu-toggle').click();
    check(await page.locator('#mobile-menu-toggle').getAttribute('aria-expanded') === 'true', 'Mobile menu reports expanded state');
    await page.keyboard.press('Shift+Tab');
    check(await page.evaluate(() => document.getElementById('mobile-nav-drawer').contains(document.activeElement)), 'Mobile menu traps reverse keyboard navigation');
    await page.keyboard.press('Escape');
    check(await page.locator('#mobile-menu-toggle').getAttribute('aria-expanded') === 'false', 'Escape closes menu and resets state');
    await page.locator('#mobile-menu-toggle').click(); await page.locator('#mobile-nav-close').click();
    check(await page.locator('#mobile-menu-toggle').getAttribute('aria-expanded') === 'false', 'Close button uses the same accessible state');
    await page.goto(base + '/Views/Home/LoginPage.html');
    check(await page.locator('#student-pin').getAttribute('inputmode') === 'numeric', 'Student PIN opens a numeric mobile keyboard');
    await page.locator('#student-pin-help-button').click();
    check(await page.locator('#student-pin-recovery').isVisible(), 'Forgot PIN provides working registrar recovery guidance');
   }
   cases.push({ width, mode, requests: requests.length }); await context.close();
  }
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.route('**/*', route => route.request().url().startsWith(base) && !route.request().url().endsWith('/leaflet.js') ? route.continue() : route.abort());
  const page = await context.newPage(); await page.goto(base + '/Views/Home/LandingPage.html', { waitUntil: 'load' });
  check(await page.locator('#abec-map-status').isVisible(), 'Missing map library still provides a visible directions fallback');
  await context.close(); check(errors.length === 0, 'Map provider failures produce no uncaught JavaScript exceptions');
  fs.writeFileSync(path.join(output, 'evidence.json'), JSON.stringify({ checks, cases, errors }, null, 2));
  console.log('PASS ' + checks + ' isolated map, catalog, mobile navigation and PIN-help browser checks.');
 } finally { await browser.close(); tls.server.close(); }
})().catch(error => { console.error(error.message); tls.server.close(); process.exitCode = 1; });
