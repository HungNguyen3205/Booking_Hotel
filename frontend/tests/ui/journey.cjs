// node tests/ui/journey.cjs <base> <outDir>
// Quay video: cuộn xuống hết trang → cuộn ngược lên → chuyển loại phòng (desktop 1440, mobile 390),
// đồng thời đo: khoảng trống bất thường, chữ mờ/xuất hiện muộn, dịch chuyển bố cục & khung hình dài khi cuộn,
// header cố định che phần tử được focus. Kèm ảnh toàn trang và ảnh chi tiết các vùng.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const [base, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const report = [];
const log = (n, ok, d = '') => { report.push({ n, ok, d }); console.log(`${ok ? 'PASS' : 'FAIL'} ${n}${d ? ' — ' + d : ''}`); };

async function probe(page) {
  return page.evaluate(() => {
    const vh = innerHeight, vw = innerWidth;
    // chữ trong khung nhìn có độ mờ < 0.95 (kể cả do phần tử cha)
    const faded = [...document.querySelectorAll('h1,h2,h3,p,a,li,figcaption,span')].filter(e => {
      const r = e.getBoundingClientRect();
      if (r.bottom < 80 || r.top > vh - 40 || r.width === 0 || !e.textContent.trim()) return false;
      if (e.closest('[aria-hidden="true"]') || getComputedStyle(e).visibility === 'hidden') return false; // cố ý ẩn
      let o = 1, n = e; while (n && n !== document.body) { o *= +getComputedStyle(n).opacity; n = n.parentElement; }
      return o < 0.95;
    }).length;
    return { faded, y: Math.round(scrollY), h: document.documentElement.scrollHeight };
  });
}

async function run(browser, width, height, label) {
  const mobile = width < 700;
  const ctx = await browser.newContext({ viewport: { width, height }, isMobile: mobile, hasTouch: mobile, locale: 'vi-VN',
    recordVideo: { dir: path.join(out, `video-${label}`), size: { width, height } } });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    window.__ls = 0; window.__loaf = [];
    new PerformanceObserver(l => { for (const e of l.getEntries()) window.__ls += e.value; }).observe({ type: 'layout-shift', buffered: true });
    try { new PerformanceObserver(l => { for (const e of l.getEntries()) window.__loaf.push(Math.round(e.duration)); }).observe({ type: 'long-animation-frame' }); } catch { /* không hỗ trợ */ }
  });
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500); // hero mở đầu
  await page.evaluate(() => { window.__ls = 0; window.__loaf = []; });

  // Cuộn xuống từng nhịp, chụp và đo
  let fadedMax = 0, blank = [];
  const step = Math.round(height * 0.6);
  let i = 0;
  for (;;) {
    await page.mouse.wheel(0, step);
    await page.waitForTimeout(450);
    const m = await probe(page);
    fadedMax = Math.max(fadedMax, m.faded);
    const shot = await page.screenshot({ type: 'png' });
    // khoảng trống: tỉ lệ hàng pixel gần như một màu
    const sharp = require('sharp');
    const { data, info } = await sharp(shot).resize(120, 80, { fit: 'fill' }).greyscale().raw().toBuffer({ resolveWithObject: true });
    let flat = 0;
    for (let r = 0; r < info.height; r++) { let mn = 255, mx = 0; for (let c = 0; c < info.width; c++) { const v = data[r * info.width + c]; mn = Math.min(mn, v); mx = Math.max(mx, v); } if (mx - mn < 6) flat++; }
    const ratio = flat / info.height;
    if (ratio > 0.55) blank.push(`${m.y}px:${Math.round(ratio * 100)}%`);
    if (++i > 60 || m.y + height >= m.h - 2) break;
  }
  const down = await page.evaluate(() => ({ ls: window.__ls, loaf: window.__loaf }));
  // Cuộn ngược lên
  for (let k = 0; k < 80; k++) { await page.mouse.wheel(0, -step); await page.waitForTimeout(300); const y = await page.evaluate(() => scrollY); if (y <= 0) break; }
  await page.waitForTimeout(800);
  const up = await probe(page);
  const after = await page.evaluate(() => ({ ls: window.__ls, loaf: window.__loaf, heroVisible: getComputedStyle(document.querySelector('.hero-title')).opacity }));
  log(`${label}: không chữ mờ/xuất hiện muộn khi cuộn xuống`, fadedMax === 0, `tối đa ${fadedMax} phần tử chữ mờ trong khung`);
  log(`${label}: không khoảng trống bất thường (>55% khung một màu)`, blank.length === 0, blank.join(', ') || 'không có');
  log(`${label}: cuộn ngược không làm nội dung biến mất`, up.faded === 0 && after.heroVisible === '1', `chữ mờ khi về đầu trang=${up.faded}, tiêu đề hero opacity=${after.heroVisible}`);
  const longFrames = after.loaf.filter(d => d > 100);
  log(`${label}: dịch chuyển bố cục & khung hình dài khi cuộn`, after.ls < 0.05, `CLS khi cuộn=${after.ls.toFixed(3)}; khung >100ms: ${longFrames.length} (${longFrames.slice(0, 6).join(',')}) — máy không giới hạn CPU`);

  // Chuyển loại phòng
  await page.locator('.explorer').scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  const items = page.locator('.explorer-item');
  const n = await items.count();
  const names = [];
  // Thứ tự 2 → 3 → 1: chạm vào mục đang chọn sẽ mở trang chi tiết (thiết kế), nên bắt đầu từ mục chưa chọn
  for (const k of [...Array(n).keys()].slice(1).concat(0)) {
    if (mobile) await items.nth(k).tap(); else await items.nth(k).hover();
    await page.waitForTimeout(1300);
    names.push(await page.textContent('.stage-card h3'));
  }
  if (!mobile) await items.nth(0).hover();
  await page.waitForTimeout(1000);
  log(`${label}: chuyển loại phòng cập nhật đúng thẻ thông tin`, names.length === n && new Set(names).size === n && page.url().endsWith('/'), names.join(' → '));
  await page.screenshot({ path: path.join(out, `chi-tiet-phong-nghi-${label}.png`), clip: await page.locator('.chapter-rooms').boundingBox().then(b => ({ x: 0, y: b.y, width, height: Math.min(b.height, 1400) })) }).catch(() => {});
  await ctx.close();
}

async function stills(browser) {
  for (const [w, h, label] of [[1440, 900, 'desktop'], [390, 844, 'mobile']]) {
    const mobile = w < 700;
    // Ảnh toàn trang chụp ở chế độ giảm chuyển động để mọi phần ở trạng thái cuối, không lệch do animation cuộn
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile, reducedMotion: 'reduce' });
    const p = await ctx.newPage();
    await p.goto(base + '/', { waitUntil: 'networkidle' });
    await p.waitForTimeout(800);
    await p.screenshot({ path: path.join(out, `toan-trang-${label}.jpg`), type: 'jpeg', quality: 78, fullPage: true });
    await p.screenshot({ path: path.join(out, `hero-${label}.jpg`), type: 'jpeg', quality: 85 });
    const clip = async (sel, name, extra = 0) => {
      const b = await p.locator(sel).first().boundingBox();
      await p.screenshot({ path: path.join(out, `${name}-${label}.jpg`), type: 'jpeg', quality: 82, fullPage: true,
        clip: { x: 0, y: Math.max(0, b.y - extra), width: w, height: Math.min(b.height + extra * 2, 2000) } });
    };
    await clip('.chapter-rooms', 'phong-nghi');
    // chuyển chương: ranh giới Không gian → Phòng nghỉ, Trải nghiệm → dải tre → Thư viện
    const b1 = await p.locator('.chapter-rooms').boundingBox();
    await p.screenshot({ path: path.join(out, `chuyen-chuong-1-${label}.jpg`), type: 'jpeg', quality: 82, fullPage: true, clip: { x: 0, y: b1.y - h * 0.5, width: w, height: h } });
    const b2 = await p.locator('.pause').boundingBox();
    await p.screenshot({ path: path.join(out, `chuyen-chuong-2-${label}.jpg`), type: 'jpeg', quality: 82, fullPage: true, clip: { x: 0, y: b2.y - h * 0.35, width: w, height: Math.min(b2.height + h * 0.7, 1800) } });
    const vis = await p.locator('.chapter-visit').boundingBox();
    const ft = await p.locator('.site-footer').boundingBox();
    await p.screenshot({ path: path.join(out, `footer-${label}.jpg`), type: 'jpeg', quality: 82, fullPage: true, clip: { x: 0, y: vis.y, width: w, height: ft.y + ft.height - vis.y } });
    // Header cố định không che phần tử nhận focus / thông báo
    await p.goto(base + '/dat-phong', { waitUntil: 'networkidle' });
    await p.locator('input[name=check_in]').focus();
    await p.evaluate(() => { scrollTo(0, document.documentElement.scrollHeight); });
    await p.locator('input[name=check_in]').focus();
    await p.waitForTimeout(400);
    const cover = await p.evaluate(() => {
      const hd = document.querySelector('.site-header').getBoundingClientRect();
      const el = document.activeElement.getBoundingClientRect();
      return { headerBottom: Math.round(hd.bottom), fieldTop: Math.round(el.top) };
    });
    log(`${label}: header cố định không che ô đang nhập`, cover.fieldTop >= cover.headerBottom, `header đến ${cover.headerBottom}px, ô nhập bắt đầu ${cover.fieldTop}px`);
    await ctx.close();
  }
}

(async () => {
  const browser = await chromium.launch();
  await run(browser, 1440, 900, 'desktop');
  await run(browser, 390, 844, 'mobile');
  await stills(browser);
  await browser.close();
  fs.writeFileSync(path.join(out, 'journey.json'), JSON.stringify(report, null, 2));
  console.log(`\n${report.filter(r => r.ok).length}/${report.length} đạt`);
})().catch(e => { console.error('LỖI', e.message.split('\n')[0]); process.exit(1); });
