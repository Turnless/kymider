// Renders the Wave 2 deck to a PDF, one landscape page per slide.
//
//   cd frontend && npm run deck:pdf
//
// Source of truth: hackathon/wave2/DECK.html and its deck/shots/*.jpg. The
// page size comes from the deck's own `@media print` rule (330 x 186 mm), so
// this file and "open DECK.html, press P" produce the same layout.
//
// The script fails, rather than writing a degraded PDF, if a screenshot does
// not load or the page count differs from the slide count. Google Fonts are
// fetched over the network; without it the deck falls back to system fonts
// and the script says so.

import { chromium } from '@playwright/test';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const deck = fileURLToPath(new URL('../../hackathon/wave2/DECK.html', import.meta.url));
const out = process.argv[2] ?? fileURLToPath(new URL('../../hackathon/wave2/DECK.pdf', import.meta.url));
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined;

// Behind an HTTPS proxy with its own CA (some sandboxes), Chromium does not
// trust the proxy's certificate, but Node does (NODE_EXTRA_CA_CERTS). The font
// requests are then fetched through Playwright's Node side instead.
const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;

const browser = await chromium.launch({
  ...(executablePath ? { executablePath } : {}),
  ...(proxy ? { proxy: { server: proxy } } : {}),
});
try {
  // 1600 x 902 is the 330:186 page ratio, so vw/vh-sized type lays out as it
  // does on a 16:9 screen.
  const page = await browser.newPage({ viewport: { width: 1600, height: 902 } });
  if (proxy) {
    await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, async (route) =>
      route.fulfill({ response: await route.fetch() }),
    );
  }
  await page.goto(pathToFileURL(deck).href, { waitUntil: 'networkidle' });
  await page.emulateMedia({ media: 'print' });

  const state = await page.evaluate(async () => {
    await document.fonts.ready;
    const imgs = Array.from(document.images);
    await Promise.all(imgs.map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; }))));
    return {
      slides: document.querySelectorAll('.slide').length,
      shots: document.querySelectorAll('.shot').length,
      loaded: imgs.filter((i) => i.naturalWidth > 0).map((i) => i.getAttribute('src')),
      fonts: Array.from(document.fonts).filter((f) => f.status === 'loaded').length,
    };
  });
  if (state.loaded.length !== state.shots) {
    throw new Error(`only ${state.loaded.length} of ${state.shots} screenshots loaded: ${state.loaded.join(', ')}`);
  }
  if (state.fonts === 0) console.warn('warning: no web fonts loaded; the PDF uses fallback fonts');

  await page.pdf({ path: out, printBackground: true, preferCSSPageSize: true });

  const pages = (readFileSync(out, 'latin1').match(/\/Type\s*\/Page(?!s)/g) ?? []).length;
  if (pages !== state.slides) throw new Error(`${pages} PDF pages for ${state.slides} slides`);
  const mb = (statSync(out).size / 1024 / 1024).toFixed(2);
  console.log(`${out}: ${pages} pages, ${mb} MB, ${state.loaded.length} screenshots, ${state.fonts} font faces`);
} finally {
  await browser.close();
}
