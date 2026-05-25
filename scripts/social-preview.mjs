// scripts/social-preview.mjs
//
// Capture a 1280×640 GitHub social preview image.
// Boots `vite preview`, opens the dashboard at the exact viewport, and
// writes docs/social-preview.png at 2x for crispness.
//
// Usage:  npm run build && node scripts/social-preview.mjs

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const OUT = path.resolve('docs/social-preview.png');
const PAGE = '/production/index.html';
const THEME = process.env.THEME || 'light';
const VIEWPORT = { width: 1280, height: 640 };

function spawnPreview() {
  if (process.env.PREVIEW_URL) return { url: process.env.PREVIEW_URL, kill: () => {} };
  if (!existsSync('dist/production/index.html')) {
    console.error('No dist/ — run `npm run build` first.');
    process.exit(1);
  }
  const port = process.env.PREVIEW_PORT || '9175';
  const proc = spawn('npx', ['vite', 'preview', '--port', port, '--host'], {
    stdio: ['ignore', 'pipe', 'inherit']
  });
  return new Promise((resolve, reject) => {
    let url = '';
    const onData = (chunk) => {
      const m = chunk.toString().match(/Local:\s+(https?:\/\/[^\s]+)/);
      if (m) {
        url = m[1].replace(/\/$/, '');
        proc.stdout.off('data', onData);
        setTimeout(() => resolve({ url, kill: () => proc.kill() }), 500);
      }
    };
    proc.stdout.on('data', onData);
    proc.on('exit', (code) => { if (!url) reject(new Error(`preview exited with code ${code}`)); });
  });
}

async function main() {
  await mkdir(path.dirname(OUT), { recursive: true });
  const { url: baseUrl, kill } = await spawnPreview();
  console.log(`→ ${THEME} theme, ${VIEWPORT.width}×${VIEWPORT.height} @ 2x`);

  const browser = await chromium.launch();
  const scale = Number(process.env.SCALE || 1);
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: scale });
  const page = await ctx.newPage();

  await page.emulateMedia({ colorScheme: THEME });
  await page.addInitScript((t) => {
    try { localStorage.setItem('theme', t); } catch (_e) {}
  }, THEME);

  await page.goto(baseUrl + PAGE, { waitUntil: 'networkidle' });
  await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), THEME);
  await page.waitForTimeout(1500);

  await page.screenshot({ path: OUT, fullPage: false, clip: { x: 0, y: 0, ...VIEWPORT } });
  await browser.close();
  kill();

  console.log(`✓ ${path.relative(process.cwd(), OUT)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
