// Real-browser integration check. External font/PDF requests are served from local fixtures.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const os = require('node:os');

(async () => {
  const { default: puppeteer } = await import('puppeteer');
  const root = path.resolve(__dirname, '..');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'buchfalten-smoke-'));
  const artwork = path.join(directory, 'bands.svg');
  fs.writeFileSync(artwork, '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect x="70" y="20" width="60" height="50"/><rect x="70" y="120" width="60" height="50"/></svg>');
  const fontPath = process.env.BUCHFALTEN_TEST_FONT || '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
  const font = fs.readFileSync(fontPath).toString('base64');
  const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
  const server = http.createServer((req, res) => {
    const requested = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
    if (!requested.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
    try {
      res.setHeader('Content-Type', mime[path.extname(requested)] || 'application/octet-stream');
      res.end(fs.readFileSync(requested));
    } catch { res.writeHead(404); res.end(); }
  });
  let browser;
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setRequestInterception(true);
    page.on('request', request => {
      const url = request.url();
      if (url.startsWith('https://fonts.googleapis.com/')) {
        const family = new URL(url).searchParams.get('family');
        if (family === 'Missing Font') return request.respond({ status: 404, body: '' });
        return request.respond({ contentType: 'text/css', body: `@font-face { font-family: "${family}"; font-style: normal; font-weight: 400; src: url(data:font/ttf;base64,${font}) format("truetype"); }` });
      }
      if (url.startsWith('http://127.0.0.1:') || url.startsWith('blob:') || url.startsWith('data:')) return request.continue();
      return request.abort();
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
    const status = expected => page.waitForFunction(value => document.querySelector('#plannerForm').dataset.status === value, { timeout: 15000 }, expected);
    const input = (id, value) => page.$eval('#' + id, (element, next) => { element.value = next; element.dispatchEvent(new Event('input', { bubbles: true })); }, value);
    const pdfText = () => page.$eval('#pdfDownloadLink', async element => {
      const bytes = new Uint8Array(await (await fetch(element.href)).arrayBuffer());
      return new TextDecoder('latin1').decode(bytes);
    });
    await page.click('#imageModeBtn');
    await (await page.$('#svgInput')).uploadFile(artwork);
    await status('ready');
    assert.match(await pdfText(), /^%PDF/);
    assert.match(await page.$eval('#summaryLine', element => element.textContent), /ausgelassen/);
    await input('columnInput', '2.5');
    assert.equal(await page.$eval('#pdfDownloadLink', element => element.getAttribute('href')), '#');
    await status('error');
    await input('columnInput', '20');
    await input('heightInput', '400');
    await status('ready');
    assert.match(await pdfText(), /Skizze/);
    await page.click('#textModeBtn');
    await input('fontInput', 'Test Font');
    await input('textInput', 'Hi');
    await status('ready');
    assert.match(await pdfText(), /Test Font/);
    assert(!/bands\.svg/.test(await pdfText()));
    await input('textInput', '');
    await page.waitForFunction(() => !document.querySelector('#artworkPreview').getAttribute('src'));
    assert.equal(await page.$eval('#pdfDownloadLink', element => element.getAttribute('href')), '#');
    await input('fontInput', 'Missing Font');
    await input('textInput', 'Hi');
    await status('error');
    assert.match(await page.$eval('#textStatus', element => element.textContent), /nicht geladen/);
    await page.click('#imageModeBtn');
    await status('ready');
    assert.match(await pdfText(), /bands\.svg/);
    assert.deepEqual(errors, []);
    console.log('Browser smoke passed: image/canvas analysis, retained modes, validation, font success/failure, stale exports and real PDF blobs.');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(directory, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
