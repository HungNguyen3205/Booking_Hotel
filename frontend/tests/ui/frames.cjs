// node frames.cjs <video.webm> <out.jpg> <tileW> <cols> <fps> — tách khung bằng Chromium (canvas) rồi ghép bảng
const { chromium } = require('playwright');
const sharp = require('sharp');
(async () => {
  const [video, out, tw, cols, fps] = process.argv.slice(2);
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--headless=new', '--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage();
  await p.route('http://frames.local/**', r => r.request().url().endsWith('/v.webm')
    ? r.fulfill({ path: video, contentType: 'video/webm' })
    : r.fulfill({ contentType: 'text/html', body: '<video src="/v.webm" preload="auto" muted playsinline style="width:640px"></video>' }));
  await p.goto('http://frames.local/');
  const frames = await p.evaluate(async ({ tw, fps }) => {
    const v = document.querySelector('video'); v.muted = true;
    await new Promise(r => (v.readyState >= 2 ? r() : v.addEventListener('loadeddata', r, { once: true })));
    const c = document.createElement('canvas'), g = c.getContext('2d'), outs = [];
    let next = 0.2, w = +tw, h = 0;
    await new Promise(done => {
      const cb = (_, meta) => {
        if (!h) { h = Math.round(w * v.videoHeight / v.videoWidth); c.width = w; c.height = h; }
        if (meta.mediaTime >= next) { g.drawImage(v, 0, 0, w, h); outs.push({ t: meta.mediaTime.toFixed(1), d: c.toDataURL('image/jpeg', 0.7) }); next += 1 / +fps; }
        if (!v.ended) v.requestVideoFrameCallback(cb);
      };
      v.requestVideoFrameCallback(cb);
      v.addEventListener('ended', done, { once: true });
      v.play();
    });
    return outs;
  }, { tw, fps });
  const W = +tw, C = +cols;
  const bufs = await Promise.all(frames.map(f => sharp(Buffer.from(f.d.split(',')[1], 'base64')).toBuffer({ resolveWithObject: true })));
  const H = bufs[0].info.height, rows = Math.ceil(bufs.length / C);
  await sharp({ create: { width: C * (W + 4), height: rows * (H + 4), channels: 3, background: '#c00' } })
    .composite(bufs.map((x, i) => ({ input: x.data, left: (i % C) * (W + 4), top: Math.floor(i / C) * (H + 4) }))).jpeg({ quality: 70 }).toFile(out);
  console.log(out, frames.length, 'khung', frames.map(f => f.t).join(','));
  await b.close();
})().catch(e => { console.error(e.message); process.exit(1); });
