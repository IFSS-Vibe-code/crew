# CrewWork – Quản lý công việc của Khoa

Ứng dụng web quản lý **công việc, chương trình/sự kiện, phê duyệt kế hoạch, kinh phí, tài liệu và báo cáo** cho một Khoa (hoặc CLB). Lấy cảm hứng bố cục từ mockup `design/mockup-index.html` và cách tổ chức công việc của ClickUp/Asana (Workspace → Ban → Dự án → Công việc; xem Danh sách/Bảng Kanban/Lịch; phê duyệt; bảng điều khiển).

- **Chi phí 0 đồng:** Firebase **Spark** (Authentication + Cloud Firestore), web tĩnh trên **GitHub Pages**. Không Firebase Hosting, không Cloud Functions, không Billing.
- **An toàn:** phân quyền ở Firestore Security Rules (mặc định từ chối, có 61 test), xác minh email, CSP, escape mặc định, CI với quyền tối thiểu.
- **Đồng bộ thật:** realtime nhiều người, tự lưu tiêu đề/mô tả, phát hiện xung đột.

Trạng thái triển khai, kết quả kiểm thử và các hạng mục chưa xác minh: xem [docs/FINAL-REPORT.md](docs/FINAL-REPORT.md).

## Chức năng chính
Đăng ký/xác minh email · nhiều Workspace + lời mời · 5 vai trò (Owner, Approver, Manager, Member, Lecturer) theo Ban · công việc (checklist, minh chứng, bình luận, lịch sử, Danh sách + Kanban kéo thả, lọc, CSV) · chương trình + nhân bản năm trước · hộp thông báo từ Trường · phê duyệt 2 cấp (trả/gửi lại/từ chối, đếm ngày chờ) · kinh phí (đề xuất → duyệt) · tài liệu (link) · lịch · báo cáo · thông báo trong ứng dụng · **trao đổi (chat)** theo kênh chung và kênh của từng Ban.

## Stack
HTML/CSS/JavaScript (ES modules) + Vite · Firebase Web SDK · Vitest · `@firebase/rules-unit-testing` · Playwright. Chi tiết: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Chạy local
Cần Node.js ≥ 22 và (cho Emulator) Java 21 + Firebase CLI. Xem [docs/SETUP.md](docs/SETUP.md).

```bash
npm ci
npm run dev                  # kết nối Firebase production (project khoaflow-ifss-2026)
# hoặc, với Emulator (không đụng dữ liệu thật):
firebase emulators:start --only auth,firestore --project demo-crewwork
VITE_USE_EMULATORS=true npm run dev
```

## Lệnh kiểm tra
| Lệnh | Nội dung |
|---|---|
| `npm run lint` / `npm run format:check` | ESLint / Prettier |
| `npm test` | Unit test nghiệp vụ (Vitest) |
| `npm run test:rules` | Test Security Rules trên Firestore Emulator |
| `npm run test:integration` | Repo ↔ Auth+Firestore Emulator ↔ Rules thật |
| `npm run test:e2e` | Playwright trên trình duyệt thật (Emulator) |
| `npm run build` | Build production vào `dist/` |
| `node scripts/scan-secrets.mjs` · `node scripts/check-dist.mjs` | Quét secret · kiểm tra bản build |

## Firebase
- Project: `khoaflow-ifss-2026` · Firestore `(default)` · vùng `asia-southeast1` · Auth: Email/Password.
- Rules/Indexes: `firestore.rules`, `firestore.indexes.json`; triển khai thủ công: `firebase deploy --only firestore --project khoaflow-ifss-2026`.
- **Cấu hình Web trong `src/config/firebase-config.js` không phải bí mật**; dữ liệu được bảo vệ bằng Authentication + Rules.

## Triển khai GitHub Pages
Push `main` → [.github/workflows/deploy.yml](.github/workflows/deploy.yml) chạy toàn bộ kiểm tra rồi mới xuất bản `dist/`. Workflow không có secret hay service-account.

## ⛔ Điều cấm (ràng buộc chi phí)
Không chuyển Spark → Blaze · không liên kết Billing Account · không `firebase init hosting` / `deploy --only hosting` / App Hosting · không Cloud Functions/Run/Storage/Phone Auth · không mở Rules (`allow ... if true`) để "cho chạy". Nếu chạm hạn mức miễn phí, giữ nguyên gói và xử lý lỗi an toàn.

## Lỗi thường gặp
| Hiện tượng | Nguyên nhân / cách xử lý |
|---|---|
| "Không có quyền thực hiện thao tác" | Vai trò của bạn không cho phép (Rules từ chối) – nhờ Owner cấp quyền |
| "Truy vấn dữ liệu chưa sẵn sàng (thiếu chỉ mục)" | Triển khai `firestore.indexes.json` |
| Không thấy lời mời | Phải đăng nhập bằng **đúng email** được mời và đã **xác minh email** |
| "Mất kết nối" | Ứng dụng không hỗ trợ offline; thao tác chưa được lưu |
| "Hệ thống đã chạm hạn mức miễn phí" | Chờ sang ngày mới (quota Spark reset hằng ngày) |

## Bảo mật
Xem [SECURITY.md](SECURITY.md) và [docs/SECURITY-REVIEW.md](docs/SECURITY-REVIEW.md).
