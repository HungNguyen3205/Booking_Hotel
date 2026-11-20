// node qa.cjs <baseUrl> <outDir> [skipBooking]
const { chromium } = require('playwright');
const fs = require('fs');
const [base, out, skipBooking] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const results = [];
const log = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); };

async function ctx(browser, width, height = 860, extra = {}) {
  const mobile = width < 700;
  return browser.newContext({ viewport: { width, height }, isMobile: mobile, hasTouch: mobile, locale: 'vi-VN', ...extra });
}

(async () => {
  const browser = await chromium.launch();

  // A. Quét responsive: tràn ngang, ảnh thiếu alt, chữ quá nhỏ, nút quá nhỏ
  const pages = ['/', '/phong', '/phong/phong-doi', '/tien-ich', '/thu-vien-anh', '/lien-he', '/gioi-thieu', '/dat-phong', '/tra-cuu'];
  for (const w of [360, 390, 720, 768, 1024, 1440]) {
    const c = await ctx(browser, w);
    const p = await c.newPage();
    for (const path of pages) {
      await p.goto(base + path, { waitUntil: 'networkidle', timeout: 60000 });
      const r = await p.evaluate(() => {
        const vw = document.documentElement.clientWidth;
        const wide = [...document.querySelectorAll('body *')].filter(e => { const b = e.getBoundingClientRect(); return b.right > vw + 1 && getComputedStyle(e).position !== 'fixed' && b.width > 0; })
          .slice(0, 3).map(e => `${e.tagName.toLowerCase()}.${(e.className || '').toString().split(' ')[0]}`);
        const noAlt = [...document.querySelectorAll('img')].filter(i => !i.hasAttribute('alt')).length;
        const tiny = [...document.querySelectorAll('a, button, input, select')].filter(e => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && b.height < 24 && getComputedStyle(e).display !== 'inline'; }).length;
        const h1 = document.querySelectorAll('h1').length;
        return { overflow: document.documentElement.scrollWidth > vw, wide, noAlt, tiny, h1 };
      });
      const ok = !r.overflow && r.noAlt === 0 && r.h1 === 1;
      if (!ok || w === 390) log(`responsive ${w}px ${path}`, ok, `tràn=${r.overflow}${r.wide.length ? ' (' + r.wide.join(',') + ')' : ''} thiếu-alt=${r.noAlt} h1=${r.h1} điều-khiển<24px=${r.tiny}`);
      if (path === '/' || path === '/phong/phong-doi') await p.screenshot({ path: `${out}/${w}${path.replace(/\//g, '_') || '_home'}.jpg`, type: 'jpeg', quality: 70 });
    }
    await c.close();
  }

  // B. Bàn phím: Tab hiển thị focus; Escape đóng menu và trả focus
  {
    const c = await ctx(browser, 1440);
    const p = await c.newPage();
    await p.goto(base + '/', { waitUntil: 'networkidle' });
    const seen = [];
    for (let i = 0; i < 6; i++) {
      await p.keyboard.press('Tab');
      seen.push(await p.evaluate(() => { const e = document.activeElement; const s = getComputedStyle(e); return `${e.tagName}:${(e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 18)}|${s.outlineStyle !== 'none' && s.outlineWidth !== '0px'}`; }));
    }
    log('Tab qua liên kết có viền focus', seen.every(s => s.endsWith('|true')), seen.join(' · '));
    await c.close();
    const m = await ctx(browser, 390);
    const q = await m.newPage();
    await q.goto(base + '/', { waitUntil: 'networkidle' });
    await q.click('.menu-toggle');
    const opened = await q.isVisible('#site-nav');
    await q.keyboard.press('Escape');
    const closed = !(await q.isVisible('#site-nav'));
    const focusBack = await q.evaluate(() => document.activeElement?.classList.contains('menu-toggle'));
    log('Menu điện thoại: mở, Esc đóng, focus trả về nút', opened && closed && focusBack, `mở=${opened} đóng=${closed} focus=${focusBack}`);
    const cta = await q.isVisible('.header-cta');
    log('Nút Đặt phòng luôn thấy trên điện thoại', cta);
    await m.close();
  }

  // C. Giảm chuyển động: nội dung vẫn hiện đủ
  {
    const c = await ctx(browser, 1440, 900, { reducedMotion: 'reduce' });
    const p = await c.newPage();
    await p.goto(base + '/', { waitUntil: 'networkidle' });
    const anim = await p.evaluate(() => document.getAnimations().length);
    const op = await p.evaluate(() => [...document.querySelectorAll('.reveal, .hero .line')].map(e => +getComputedStyle(e).opacity).filter(o => o < 0.99).length);
    await p.screenshot({ path: `${out}/reduced-motion-1440.jpg`, type: 'jpeg', quality: 70, fullPage: true });
    log('Giảm chuyển động: không còn animation, không phần tử mờ', anim === 0 && op === 0, `animations=${anim} mờ=${op}`);
    await c.close();
  }

  // D. CLS & LCP trang chủ (điện thoại + desktop)
  for (const w of [390, 1440]) {
    const c = await ctx(browser, w);
    const p = await c.newPage();
    await p.addInitScript(() => {
      window.__cls = 0; window.__lcp = 0;
      new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
      new PerformanceObserver(l => { const e = l.getEntries().at(-1); window.__lcp = e.startTime; window.__lcpEl = e.element?.tagName + '.' + (e.element?.className || ''); }).observe({ type: 'largest-contentful-paint', buffered: true });
    });
    await p.goto(base + '/', { waitUntil: 'networkidle' });
    await p.mouse.wheel(0, 3000); await p.waitForTimeout(800); await p.mouse.wheel(0, -3000); await p.waitForTimeout(800);
    const m = await p.evaluate(() => ({ cls: window.__cls, lcp: Math.round(window.__lcp), el: window.__lcpEl }));
    log(`CLS/LCP ${w}px (máy cục bộ, không giới hạn mạng)`, m.cls < 0.1, `CLS=${m.cls.toFixed(3)} LCP=${m.lcp}ms phần tử=${m.el}`);
    await c.close();
  }

  // E. Luồng đặt phòng trên điện thoại
  if (!skipBooking) {
    const c = await ctx(browser, 390);
    const p = await c.newPage();
    let posts = 0;
    p.on('request', r => { if (r.method() === 'POST' && r.url().includes('/api/public/bookings') && !r.url().includes('lookup')) posts++; });
    await p.goto(base + '/', { waitUntil: 'networkidle' });
    const d = n => new Date(Date.now() + 7 * 3600000 + n * 86400000).toISOString().slice(0, 10);
    await p.fill('.hero-search input[name=check_in]', d(3));
    await p.fill('.hero-search input[name=check_out]', d(5));
    const ci = await p.inputValue('.hero-search input[name=check_in]');
    await p.selectOption('.hero-search select[name=adults]', '2');
    await p.click('.hero-search button[type=submit], .hero-search .btn');
    await p.waitForURL(/dat-phong/);
    await p.waitForSelector('.plan button', { timeout: 20000 });
    log('Trang chủ → kết quả phòng trống', true, `ngày nhận ${ci}`);
    await p.screenshot({ path: `${out}/book-1-results.jpg`, type: 'jpeg', quality: 70, fullPage: true });
    await p.locator('.plan button').first().click();
    await p.fill('input[autocomplete=name]', 'Khách kiểm thử giao diện');
    await p.fill('input[type=tel]', '0977111222');
    await p.fill('input[type=email]', 'qa-ui@example.test');
    await p.waitForSelector('input[type=checkbox]');
    await p.screenshot({ path: `${out}/book-2-review.jpg`, type: 'jpeg', quality: 70, fullPage: true });
    await p.check('input[type=checkbox]');
    const btn = p.locator('button.book-submit');
    await btn.dblclick();
    await p.waitForSelector('.confirm-code', { timeout: 20000 });
    const code = (await p.textContent('.confirm-code')).trim();
    await p.screenshot({ path: `${out}/book-3-done.jpg`, type: 'jpeg', quality: 70, fullPage: true });
    log('Bấm đúp "Đặt phòng" chỉ tạo 1 yêu cầu, có mã xác nhận', posts === 1 && /^0977111222[B-Z]?$/.test(code), `POST=${posts} mã=${code}`);
    const honest = await p.evaluate(() => document.body.innerText);
    log('Xác nhận không báo "đã thanh toán" khi chưa thu tiền', !/đã thanh toán thành công/i.test(honest) && /giữ chỗ/i.test(honest));
    await p.goto(base + '/phong/phong-doi', { waitUntil: 'networkidle' });
    const kept = await p.inputValue('input[name=check_in]');
    log('Sang trang khác vẫn giữ ngày đã chọn', kept === ci, `ngày=${kept}`);
    await c.close();
  }

  fs.writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 2));
  console.log(`\n${results.filter(r => r.ok).length}/${results.length} đạt`);
  await browser.close();
})().catch(e => { console.error('LỖI', e.message); process.exit(1); });
