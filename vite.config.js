import { defineConfig } from 'vite';

// Chỉ ở chế độ dev/test (vite serve) mới cho phép kết nối tới Firebase Emulator trên máy cục bộ.
// Bản build production giữ nguyên CSP chặt, không cho phép localhost.
const devCsp = {
  name: 'crew-dev-csp',
  apply: 'serve',
  transformIndexHtml: (h) => h.replace("connect-src 'self'", "connect-src 'self' http://127.0.0.1:* ws://127.0.0.1:*"),
};

// Triển khai GitHub Pages: dùng đường dẫn tương đối để chạy được ở /<tên-repo>/.
export default defineConfig({
  base: './',
  plugins: [devCsp],
  build: { target: 'es2022', sourcemap: false, chunkSizeWarningLimit: 800 },
  server: { port: 5173, strictPort: true },
});
