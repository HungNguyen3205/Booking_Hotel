// node admin.cjs <base> <out> — đăng nhập chủ khách sạn (đọc .env, không in mật khẩu), chụp sơ đồ/lịch/việc hôm nay
const { chromium } = require('playwright');
const fs = require('fs');
const [base, out] = process.argv.slice(2);
const env = Object.fromEntries(fs.readFileSync(require('path').resolve(__dirname, '../../../backend/.env'), 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
fs.mkdirSync(out, { recursive: true });
(async () => {
  const b = await chromium.launch();
  for (const w of [1440, 1024, 390]) {
    const c = await b.newContext({ viewport: { width: w, height: w < 700 ? 844 : 900 }, isMobile: w < 700, hasTouch: w < 700 });
    const p = await c.newPage();
    await p.goto(base + '/admin/dang-nhap', { waitUntil: 'networkidle' });
    await p.fill('input[name=email]', env.HOTEL_ADMIN_EMAIL);
    await p.fill('input[name=password]', env.HOTEL_ADMIN_PASSWORD);
    await p.click('button[type=submit], .btn-primary');
    await p.waitForURL(u => !u.pathname.includes('dang-nhap'));
    await p.goto(base + '/admin/lich-phong', { waitUntil: 'networkidle' });
    await p.waitForSelector('.tile, .room-row', { timeout: 20000 });
    const r = await p.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const tiles = [...document.querySelectorAll('.tile')];
      const clipped = tiles.filter(t => [...t.children].some(ch => ch.scrollWidth > ch.clientWidth + 1 && getComputedStyle(ch).textOverflow !== 'ellipsis')).map(t => t.querySelector('.tile-no')?.textContent);
      const overlap = tiles.filter(t => { const k = [...t.children].map(c => c.getBoundingClientRect()); return k.some((a, i) => k.some((bb, j) => j > i && a.bottom > bb.top + 2 && a.top < bb.bottom - 2 && a.height > 0 && bb.height > 0)); }).map(t => t.querySelector('.tile-no')?.textContent);
      return { overflow: document.documentElement.scrollWidth > vw, tiles: tiles.length, clipped, overlap, hk: document.querySelectorAll('.tile-hk').length, occ: document.querySelectorAll('.tile-status').length };
    });
    console.log(`${w}px sơ đồ: ${JSON.stringify(r)}`);
    // Chọn phòng có tên dài
    const tile = p.locator('.tile', { hasText: 'Nguyễn Hoàng' }).first();
    if (await tile.count()) { await tile.click(); await p.waitForTimeout(1500); }
    await p.screenshot({ path: `${out}/map-${w}.jpg`, type: 'jpeg', quality: 72, fullPage: w < 700 });
    await p.click('button[role=tab]:has-text("Lịch")');
    await p.waitForSelector('.cal-row', { timeout: 20000 });
    await p.waitForTimeout(800);
    await p.screenshot({ path: `${out}/cal-${w}.jpg`, type: 'jpeg', quality: 72 });
    await p.goto(base + '/admin', { waitUntil: 'networkidle' });
    await p.waitForSelector('.kpis', { timeout: 20000 });
    await p.screenshot({ path: `${out}/today-${w}.jpg`, type: 'jpeg', quality: 72 });
    await c.close();
  }
  await b.close();
})().catch(e => { console.error('LỖI', e.message); process.exit(1); });
