# Thiết lập và xác minh

## 1. Công cụ (macOS, Apple Silicon – đã dùng khi phát triển)
Cài vào thư mục riêng, không đụng hệ thống: Node.js LTS, GitHub CLI (`gh`), Firebase CLI, JRE 21 (Temurin) cho Emulator. Mỗi bản tải về được kiểm tra SHA-256 theo nhà phát hành. Kích hoạt: `source <đường dẫn>/env.sh`. Kiểm tra: `node -v`, `gh --version`, `firebase --version`, `java -version`.

## 2. Đăng nhập
```bash
gh auth login --web            # tài khoản GitHub chủ repo
firebase login --no-localhost  # tài khoản Google chủ project
firebase use khoaflow-ifss-2026
```

## 3. Firebase (đã làm; lặp lại khi dựng project mới)
```bash
firebase projects:create <project-id> --display-name "CrewWork"
firebase apps:create WEB "CrewWork Web" --project <project-id>
firebase firestore:databases:create "(default)" --location asia-southeast1 --project <project-id>
firebase deploy --only firestore,auth --project <project-id>   # Rules, Indexes, bật Email/Password
```
Sau đó cập nhật `src/config/firebase-config.js` (`firebase apps:sdkconfig WEB`) và `.firebaserc`.
Thêm miền GitHub Pages (`<user>.github.io`) vào **Authentication → Settings → Authorized domains** (cần cho liên kết xác minh email).

### Xác minh Spark (không có Billing)
Cách 1 (giao diện): Firebase Console → bánh răng → *Usage and billing* → phải ghi gói **Spark**; không bấm Upgrade, không liên kết Billing Account.

Cách 2 (API, dùng chính phiên đăng nhập CLI): gọi `GET https://cloudbilling.googleapis.com/v1/projects/<project-id>/billingInfo` với access token của tài khoản đã đăng nhập; kết quả mong đợi có `"billingEnabled": false`. (Đã thực hiện cho `khoaflow-ifss-2026` – xem `docs/FINAL-REPORT.md`.)

> Lưu ý: nếu tài khoản Google của bạn có quyền liên kết Billing Account, quy định trong tài liệu này **không** tự ngăn bạn làm vậy; đó là kỷ luật vận hành, không phải khóa kỹ thuật.

## 4. Chạy Emulator và test
```bash
npm ci
npm run test:rules && npm run test:integration && npm run test:e2e
```
E2E dùng Chrome cài sẵn (`PW_CHANNEL=chrome`); trên CI dùng Chromium của Playwright.

## 5. Bật tính năng bảo mật GitHub (một lần)
Repository → Settings → Code security: bật Dependabot alerts, secret scanning + push protection, private vulnerability reporting. Settings → Pages → Source: **GitHub Actions**. Settings → Branches/Rules: bảo vệ `main` (bắt buộc CI `verify` đạt, chặn force-push).
