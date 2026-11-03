# Báo cáo kiểm thử

Ngày chạy: 2026-11-03. Môi trường: macOS (Apple Silicon), Node 26.13, Java 21, Firebase CLI 15.34.2, Chrome thật (local), Chromium của Playwright (CI Ubuntu). Mọi test phá hủy chạy trên **Emulator, project `demo-crew`**; không ghi dữ liệu production.

| Cổng | Lệnh | Kết quả |
|---|---|---|
| Lint | `npm run lint` | Đạt, 0 lỗi |
| Định dạng | `npm run format:check` | Đạt |
| Unit (nghiệp vụ) | `npm test` | **49/49** (thêm 15 test chat) |
| Security Rules | `npm run test:rules` | **61/61** (thêm 11 test chat) |
| Tích hợp (repo ↔ Auth+Firestore Emulator ↔ Rules thật) | `npm run test:integration` | **10/10** |
| E2E (Chrome thật, Emulator) | `npm run test:e2e` | **5/5** (lần cập nhật chat: 3 lần chạy liên tiếp đều đạt) |
| Build | `npm run build` | Đạt (~720 kB JS, 216 kB gzip) |
| Kiểm tra bản build | `node scripts/check-dist.mjs` | Đạt: đúng projectId, không Emulator/localhost, có CSP |
| Quét secret | `node scripts/scan-secrets.mjs` | Không phát hiện |
| Lỗ hổng dependency | `npm audit` | 0 |
| CI GitHub (cùng các bước, E2E bằng Chromium) | workflow `Deploy GitHub Pages` | `verify`, `build`, `deploy` đều **success** |

## Phạm vi đã kiểm
- **Unit:** dữ liệu thường/rỗng/thiếu trường/sai kiểu/biên/trùng; năm nhuận; máy trạng thái duyệt; kinh phí; báo cáo; CSV injection.
- **Rules:** chưa đăng nhập, email chưa xác minh, chủ sở hữu, người khác, thiếu vai trò, tự nâng quyền, trường bị bảo vệ, sai cấu trúc, đường dẫn chưa khai báo, query ngoài phạm vi; 9 test hồi quy từ rà soát bảo mật.
- **Tích hợp:** tạo song song không trùng mã #TK, mời/nhận lời mời, phạm vi dữ liệu, duyệt hai cấp và chặn xử lý trùng, tự lưu có phát hiện xung đột.
- **E2E:** đăng ký → xác minh (qua Emulator) → tạo Workspace → tạo việc (validation, minh chứng chỉ https, bình luận chứa HTML không thực thi) → Kanban → reload dữ liệu còn đúng → chương trình, thông báo, phê duyệt 2 cấp, kinh phí, tài liệu (chặn `javascript:`), lịch, báo cáo → mời thành viên, người ngoài không thấy dữ liệu, thành viên chỉ thấy việc được giao, cập nhật realtime giữa hai trình duyệt, đăng xuất không còn dữ liệu cũ → responsive 375 px không tràn ngang; kiểm tra console error và request thất bại ở mỗi luồng.
- **Production (sau deploy, không ghi dữ liệu):** trang tải HTTP 200; không lỗi console; không request thất bại; JS có đúng projectId, không có Emulator; đăng nhập sai báo "Email hoặc mật khẩu không đúng."; mobile không tràn ngang; truy cập Firestore REST **không đăng nhập** (đọc và ghi) bị **403**.

## Trao đổi (chat) – đã kiểm
Unit: kênh theo vai trò, kiểm tra tin (rỗng/sai kiểu/2000/2001 ký tự), chưa đọc, gộp tin theo người/5 phút/ngày, linkify chỉ https. Rules: chưa đăng nhập, chưa xác minh, người ngoài, Ban khác, Approver, Owner, Ban không tồn tại, mạo danh uid/tên, thừa trường, giờ giả, sửa tin, quyền xóa, đường dẫn không khai báo. Tích hợp: gửi/đọc qua repo thật, realtime, chặn kênh Ban, xóa. E2E (hai trình duyệt): Owner thấy 7 kênh, thành viên 1 kênh; HTML hiện như chữ; link `rel=noopener`; chấm chưa đọc realtime và tự tắt khi đọc; Enter/Shift+Enter; **đang gõ dở không mất khi có tin mới**; không thấy nút xóa tin người khác; xóa tin mình đồng bộ sang người kia; tin kênh Ban không lộ cho người ngoài Ban; reload còn lịch sử; đăng xuất không còn tin; mobile 375 px không tràn ngang. Kiểm tra ảnh chụp giao diện desktop + mobile.

**Chưa kiểm:** bộ gõ tiếng Việt thật (Telex/VNI) với phím Enter – mã đã xử lý `isComposing`, nhưng Playwright không mô phỏng được bộ gõ; hiệu năng với hàng nghìn tin; chat trên production với tài khoản thật.

## Lỗi đã sửa trong quá trình kiểm thử
`[hidden]` bị CSS ghi đè (mục "Kinh phí" vẫn hiện với Thành viên) · kiểu xem Bảng không được nhớ sau reload · CSP chặn Emulator khi dev · 2 lỗ hổng Rules + 1 lỗi escape + 2 lỗ hổng dependency (xem `SECURITY-REVIEW.md`).

## Chưa chạy / giới hạn (trung thực)
1. **Một lần chạy E2E trước đây có 1 test thất bại (test "Công việc"), không có log nguyên nhân; 6 lần chạy lặp sau đó đều đạt.** Nguyên nhân chưa xác định → có thể còn test chập chờn.
2. **Chưa thử luồng email thật trên production** (gửi/nhận thư xác minh, liên kết về `github.io`, đặt lại mật khẩu) và **chưa có người dùng thật đăng nhập đọc/ghi trên production**; chỉ kiểm chứng bằng Emulator + từ chối khách ở production. Tránh tạo tài khoản rác/dữ liệu thật ngoài sự đồng ý.
3. Chưa kiểm thử Firefox/Safari/Edge, thiết bị thật, trình đọc màn hình, Lighthouse/hiệu năng trên thiết bị yếu; rà soát truy cập chỉ theo quy tắc, chưa dùng công cụ axe.
4. Emulator không mô phỏng đầy đủ hạn mức/độ trễ production; chưa thử tải nhiều người dùng.
5. Test frame-buster (clickjacking) và hành vi khi chạm hạn mức Spark chưa có.
6. Kiểm thử thủ công trên màn hình lớn/thấp (desktop) chỉ qua ảnh kiểm tra của Playwright, chưa có so sánh trực quan tự động.
