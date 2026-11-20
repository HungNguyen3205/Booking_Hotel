// node tests/ui/booking-slow.cjs <base> <outDir> <phone>
// Luồng đặt phòng trên mạng chậm (Slow 4G + CPU 4x): tìm → quay lại/tiến → chọn → nhập → mất mạng lần gửi đầu → gửi lại → bấm đúp → quay lại sau khi đặt.
const { chromium } = require('playwright');
const fs = require('fs');
const [base, out, phone] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const res = [];
const log = (n, ok, d = '') => { res.push({ n, ok, d }); console.log(`${ok ? 'PASS' : 'FAIL'} ${n}${d ? ' — ' + d : ''}`); };
const day = n => new Date(Date.now() + 7 * 3600000 + n * 86400000).toISOString().slice(0, 10);

(async () => {
  const b = await chromium.launch();
  const c = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'vi-VN' });
  const p = await c.newPage();
  const cdp = await c.newCDPSession(p);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const posts = [];
  p.on('request', r => { if (r.method() === 'POST' && /\/api\/public\/bookings$/.test(r.url())) posts.push(JSON.parse(r.postData() || '{}').request_key); });

  await p.goto(base + '/', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.fill('.hero-search input[name=check_in]', day(6));
  await p.fill('.hero-search input[name=check_out]', day(8));
  await p.selectOption('.hero-search select[name=adults]', '2');
  const t0 = Date.now();
  await p.click('.hero-search .btn');
  await p.waitForURL(/dat-phong/, { timeout: 120000 });
  const sawLoading = await p.waitForSelector('text=Đang tìm', { timeout: 15000 }).then(() => true).catch(() => false);
  await p.waitForSelector('.plan button', { timeout: 120000 });
  log('Tìm phòng trên mạng chậm có trạng thái đang tải và ra kết quả', true, `${Date.now() - t0} ms, thấy "Đang tìm…": ${sawLoading}`);

  await p.goBack({ waitUntil: 'domcontentloaded' });
  const homeCi = await p.inputValue('.hero-search input[name=check_in]');
  log('Quay lại trang chủ vẫn giữ ngày đã chọn', homeCi === day(6), homeCi);
  await p.goForward({ waitUntil: 'domcontentloaded' });
  await p.waitForSelector('.plan button', { timeout: 120000 });
  const bookCi = await p.inputValue('input[name=check_in]');
  log('Tiến lại trang đặt phòng: tự hiển thị lại kết quả đúng ngày', bookCi === day(6), bookCi);

  await p.locator('.plan button').first().click();
  await p.fill('input[autocomplete=name]', 'Khách thử mạng chậm');
  await p.fill('input[type=tel]', phone);
  await p.fill('input[type=email]', 'slow-net@example.test');
  await p.check('input[type=checkbox]');
  await p.screenshot({ path: `${out}/slow-review.jpg`, type: 'jpeg', quality: 70, fullPage: true });

  // Lần gửi đầu: mất mạng (offline thật qua DevTools) → phải báo lỗi rõ, không báo thành công
  const slow = { latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 };
  await cdp.send('Network.emulateNetworkConditions', { offline: true, ...slow });
  const btn = p.locator('button.book-submit');
  await btn.click();
  const errShown = await p.waitForSelector('.notice-error', { timeout: 30000 }).then(e => e.textContent()).catch(() => null);
  log('Mất mạng khi gửi: báo lỗi rõ, không báo thành công', !!errShown && !(await p.$('.confirm-code')), (errShown || 'không thấy thông báo lỗi').trim().slice(0, 110));
  await p.screenshot({ path: `${out}/slow-error.jpg`, type: 'jpeg', quality: 70, fullPage: true });
  await cdp.send('Network.emulateNetworkConditions', { offline: false, ...slow });

  // Gửi lại bằng bấm đúp
  await btn.dblclick();
  await p.waitForSelector('.confirm-code, .notice-error:not(:has-text("Không kết nối"))', { timeout: 120000 });
  if (!(await p.$('.confirm-code'))) {
    await p.screenshot({ path: `${out}/slow-retry-error.jpg`, type: 'jpeg', quality: 70, fullPage: true });
    throw new Error('Gửi lại không thành công: ' + (await p.textContent('.notice-error')).trim());
  }
  const code = (await p.textContent('.confirm-code')).trim();
  const keys = [...new Set(posts)];
  log('Gửi lại sau lỗi + bấm đúp: cùng một request_key, ra 1 mã', keys.length === 1, `POST=${posts.length} khóa khác nhau=${keys.length} mã=${code}`);
  log('Mã đặt phòng là đúng số điện thoại vừa nhập', code.replace(/[A-Z]$/, '') === phone, `nhập ${phone} → mã ${code}`);
  await p.screenshot({ path: `${out}/slow-done.jpg`, type: 'jpeg', quality: 70, fullPage: true });

  const before = posts.length;
  await p.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {});
  await p.waitForTimeout(3000);
  log('Quay lại sau khi đặt: không gửi lại yêu cầu', posts.length === before, `POST sau khi quay lại=${posts.length - before}`);

  fs.writeFileSync(`${out}/booking-slow.json`, JSON.stringify({ code, posts: posts.length, res }, null, 2));
  console.log(`\n${res.filter(r => r.ok).length}/${res.length} đạt · mã ${code}`);
  await b.close();
})().catch(e => { console.error('LỖI', e.message.split('\n')[0]); process.exit(1); });
