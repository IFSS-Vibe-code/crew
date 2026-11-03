# Kiến trúc

## Stack và lý do
- **HTML/CSS/JavaScript (ES modules) + Vite**: ứng dụng là SPA nhỏ, không cần framework lớn. Template HTML tự viết có **escape mặc định** (`src/lib/html.js`), nên chống XSS ở một chỗ.
- **Firebase Web SDK (Auth + Cloud Firestore)**, gói Spark. Không Hosting, không Functions.
- **GitHub Pages** + GitHub Actions để triển khai; **Vitest**, **@firebase/rules-unit-testing**, **Playwright** để kiểm thử.

## Phân tầng (`src/`)
```
domain/      Nghiệp vụ thuần: constants, dates, validation, permissions, tasks, approvals, budget, reports, calendar
services/    firebase/app.js (khởi tạo), firebase/auth.js, repo.js (MỌI truy cập Firestore), sync.js (listener), errors.js
state/       store.js – trạng thái toàn cục + pub/sub, gom render theo requestAnimationFrame
ui/          shell, auth, workspacePicker, taskDrawer, formModal, kit, pages/*
styles/      main.css – design tokens lấy từ mockup
config/      firebase-config.js – cấu hình Web công khai
```
Quy tắc: UI không gọi Firestore; `repo.js` luôn kiểm tra dữ liệu trước khi ghi; `domain` không import Firebase/DOM.

## Luồng dữ liệu
```
UI sự kiện → repo.* (validate → ghi batch/transaction) → Firestore
Firestore ──onSnapshot──▶ sync.js ──▶ store.setState ──▶ main.render ──▶ DOM
```
- `sync.js` quản lý vòng đời listener: một bộ listener/Workspace; hủy khi đổi Workspace/đăng xuất; listener công việc dựng lại khi vai trò/Ban của tôi đổi; mất quyền → tự thoát Workspace.
- Dữ liệu người trước bị xóa sạch khi đổi tài khoản (`resetWorkspaceData`, `resetAll`); bộ nhớ đệm Firestore chỉ trong RAM (`memoryLocalCache`) nên không lưu dữ liệu Khoa lâu dài trên máy dùng chung. Hệ quả: **không dùng offline** – mất mạng thì hiện cảnh báo và thao tác ghi không được xác nhận.
- Chỉ báo "Đã đồng bộ/Đang lưu…/Mất kết nối" lấy từ `snapshot.metadata` và số thao tác đang chờ.

## Trao đổi (chat)
- `services/chatSync.js`: 1 listener "tin mới nhất" (`limit 1`) cho mỗi kênh tôi tham gia → chấm chưa đọc; dựng lại khi vai trò/Ban của tôi hoặc danh sách Ban đổi. Kênh đang mở: 100 tin gần nhất (tải thêm 100/lần), **chỉ sống khi đang ở trang Trao đổi** (`leave()` hủy khi rời trang); `stopWorkspace` hủy tất cả.
- `ui/pages/chat.js`: markup khung trang chỉ phụ thuộc danh sách kênh, nên `main.js` không dựng lại khi có tin mới (giữ nguyên nội dung đang gõ); danh sách tin nhắn được cập nhật riêng qua `subscribe()`, giữ vị trí cuộn, chỉ tự cuộn xuống khi đang ở cuối.
- Mốc "đã đọc" lưu ở `localStorage` theo Workspace + người dùng (tiện ích, không phải dữ liệu nghiệp vụ); lần đầu thấy một kênh coi như đã đọc lịch sử cũ.
- Tin gửi đi chỉ xóa khỏi ô soạn **sau khi máy chủ xác nhận**; trong lúc chờ hiện "Đang gửi…" (theo `hasPendingWrites`).

## Đồng bộ và xung đột
- Ghi nhỏ, theo trường cần đổi; chống bấm đúp bằng khóa nút (`run`).
- Tạo công việc dùng transaction với bộ đếm (không trùng mã), có thử lại có kiểm soát khi bộ đếm vừa bị người khác tăng.
- Tự lưu tiêu đề/mô tả dùng transaction so sánh giá trị gốc → báo xung đột.
- Duyệt hồ sơ dùng transaction kiểm tra trạng thái chưa đổi.
- Quy tắc xung đột khác: các trường độc lập được ghi riêng nên không đè nhau; cùng một trường: **người ghi sau thắng** (với trạng thái công việc), trừ các trường văn bản và hồ sơ duyệt đã có phát hiện xung đột ở trên.

## Bảo mật nhiều lớp
1. **Authentication**: email/mật khẩu, bắt buộc xác minh email (Rules kiểm `email_verified`).
2. **Firestore Rules**: mặc định từ chối; vai trò đọc từ `members/{uid}` (chỉ Owner sửa); kiểm tra schema, trường bất biến, dấu thời gian máy chủ.
3. **Giao diện**: ẩn nút theo quyền (chỉ để dễ dùng, không phải ranh giới).
4. **Trình duyệt**: CSP, escape mặc định, link ngoài chỉ https + `rel=noopener`, chặn nhúng iframe.
5. **Chuỗi cung ứng**: `npm ci` theo lockfile, `npm audit`, Dependabot, pin Actions theo SHA.

## Môi trường
| | Dev/Test | Production |
|---|---|---|
| Firebase | Emulator, project `demo-crew` | `khoaflow-ifss-2026` |
| Chọn bằng | `VITE_USE_EMULATORS=true` (chỉ khi chạy `vite` dev) | mặc định |
| Bảo vệ | build production **ném lỗi** nếu bật Emulator; CSP production không cho phép localhost; `scripts/check-dist.mjs` kiểm tra trong CI | |

## Triển khai
Push `main` → workflow `deploy.yml`: verify (lint, format, test, Rules, tích hợp, E2E, audit, secret scan) → build + `check-dist` → GitHub Pages. Rules/Indexes triển khai **thủ công** bằng `firebase deploy --only firestore` (không để service-account key trong GitHub).
