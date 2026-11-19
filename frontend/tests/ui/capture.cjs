// node capture.cjs <url> <outPrefix> <width> <height> [frames] [video]
// Chụp khung hình đầu sau 5 giây, rồi cuộn từng màn hình và chụp; tùy chọn quay video.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
(async () => {
  const [url, out, w, h, framesArg, video] = process.argv.slice(2);
  const width = Number(w), height = Number(h), frames = Number(framesArg || 8);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const browser = await chromium.launch();
  const mobile = width < 700;
  const ctx = await browser.newContext({
    viewport: { width, height }, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile, locale: 'vi-VN',
    ...(video ? { recordVideo: { dir: path.dirname(out), size: { width, height } } } : {}),
  });
  const page = await ctx.newPage();
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);
  await page.screenshot({ path: `${out}-00.jpg`, type: 'jpeg', quality: 70 });
  const total = await page.evaluate(() => document.documentElement.scrollHeight);
  const steps = Math.min(frames, Math.ceil(total / height));
  for (let i = 1; i <= steps; i++) {
    await page.mouse.wheel(0, height * 0.9);
    await page.waitForTimeout(1400);
    await page.screenshot({ path: `${out}-${String(i).padStart(2, '0')}.jpg`, type: 'jpeg', quality: 70 });
  }
  const info = await page.evaluate(() => ({
    title: document.title, scrollH: document.documentElement.scrollHeight,
    overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    h1: [...document.querySelectorAll('h1')].map(e => e.textContent.trim().slice(0, 80)),
    fonts: [...new Set([...document.querySelectorAll('h1,h2,p,a')].slice(0, 60).map(e => getComputedStyle(e).fontFamily.split(',')[0]))],
  }));
  console.log(JSON.stringify({ url, width, loadMs: Date.now() - t0, steps, ...info }));
  await ctx.close();
  await browser.close();
})().catch(e => { console.error(e.message); process.exit(1); });
