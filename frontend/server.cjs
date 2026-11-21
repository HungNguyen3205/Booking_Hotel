// Điểm khởi động cho cPanel "Setup Node.js App" (Phusion Passenger).
// CommonJS (.cjs) vì Passenger nạp file khởi động bằng require().
// Passenger cấp cổng qua biến PORT; chạy bản đã build (`npm run build`).
// Trên máy cá nhân vẫn dùng `npm run dev` / `npm start` như cũ.
const { createServer } = require('node:http');
const next = require('next');

const port = Number(process.env.PORT) || 3000;
const app = next({ dev: false, dir: __dirname });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer((req, res) => handle(req, res)).listen(port, () => {
    console.log(`GLG web chạy ở cổng ${port}`);
  });
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
