// node lcp-probe.cjs <url> <runs> [variant]  — đo LCP thật (không mô phỏng) với Slow 4G + CPU 4x, viewport mobile
// variant: none | noanim (tắt animation ảnh hero) | nofont (chặn tải font)
const { chromium } = require('playwright');
(async () => {
  const [url, runsArg, variant = 'none'] = process.argv.slice(2);
  const runs = Number(runsArg || 3);
  const out = [];
  const browser = await chromium.launch();
  for (let i = 0; i < runs; i++) {
    const ctx = await browser.newContext({ viewport: { width: 412, height: 823 }, deviceScaleFactor: 1.75, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    if (variant === 'nofont') await page.route(/\.woff2$/, r => r.abort());
    await page.addInitScript(v => {
      window.__m = { lcp: [], fcp: 0, long: 0 };
      new PerformanceObserver(l => { for (const e of l.getEntries()) window.__m.lcp.push({ t: Math.round(e.startTime), render: Math.round(e.renderTime), load: Math.round(e.loadTime), el: (e.element?.tagName || '') + '.' + (e.element?.className || '').toString().split(' ')[0] }); }).observe({ type: 'largest-contentful-paint', buffered: true });
      new PerformanceObserver(l => { for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') window.__m.fcp = Math.round(e.startTime); }).observe({ type: 'paint', buffered: true });
      new PerformanceObserver(l => { for (const e of l.getEntries()) window.__m.long += e.duration; }).observe({ type: 'longtask', buffered: true });
      if (v === 'noanim') document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = '.hero-img{animation:none!important}'; document.head.appendChild(s); });
    }, variant);
    await page.goto(url, { waitUntil: 'load', timeout: 120000 });
    await page.waitForTimeout(6000);
    const m = await page.evaluate(() => {
      const img = performance.getEntriesByType('resource').find(r => r.name.includes('cong-wellness'));
      const css = performance.getEntriesByType('resource').filter(r => r.name.endsWith('.css')).map(r => Math.round(r.responseEnd));
      const fonts = performance.getEntriesByType('resource').filter(r => r.name.endsWith('.woff2')).map(r => Math.round(r.responseEnd));
      const nav = performance.getEntriesByType('navigation')[0];
      return { ...window.__m, ttfb: Math.round(nav.responseStart), imgEnd: img ? Math.round(img.responseEnd) : null, cssEnd: Math.max(0, ...css), fontEnd: fonts.length ? Math.max(...fonts) : 0, fontCount: fonts.length };
    });
    const last = m.lcp.at(-1) || {};
    out.push({ run: i + 1, TTFB: m.ttfb, FCP: m.fcp, LCP: last.t, LCP_el: last.el, img_responseEnd: m.imgEnd, render_delay: last.t && m.imgEnd ? last.t - m.imgEnd : null, css_end: m.cssEnd, font_end: m.fontEnd, fonts: m.fontCount, long_tasks_ms: Math.round(m.long) });
    await ctx.close();
  }
  await browser.close();
  const lcps = out.map(o => o.LCP).sort((a, b) => a - b);
  console.table(out);
  console.log(`${variant}: LCP từng lần ${out.map(o => o.LCP).join(' / ')} ms — trung vị ${lcps[Math.floor(lcps.length / 2)]} ms`);
})().catch(e => { console.error(e.message); process.exit(1); });
