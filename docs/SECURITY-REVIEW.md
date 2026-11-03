# Rà soát bảo mật

Ngày: 2026-11-03 · Phạm vi: `firestore.rules`, mã UI (XSS), luồng xác thực, CSP, GitHub Actions, scripts.

## Mô hình tin cậy
- Trình duyệt người dùng **không đáng tin**: mọi ràng buộc quan trọng nằm ở Firestore Rules.
- Cấu hình Web Firebase (`apiKey`…) là công khai theo thiết kế, không phải bí mật.
- Vai trò lấy từ `members/{uid}` do Owner quản lý; người dùng không tự sửa được role/unitIds.
- Email phải **đã xác minh** thì Rules mới cho đọc/ghi (chặn đăng ký bằng email người khác để nhận lời mời).
- Tin cậy: Google (Firebase/Auth), GitHub (Pages/Actions). Không có backend riêng, không Admin SDK, không service-account trong repo hay workflow.

## Phương pháp
Tôi rà soát có hướng dẫn bởi skill `security-audit` (Cloudflare) ở **chế độ focused review** do chính tôi thực hiện, **không** chạy quy trình đầy đủ 6 pha với nhiều sub-agent và không có xác minh độc lập bởi agent khác. Mọi phát hiện dưới đây được xác nhận bằng test/emulator; phần không có test được ghi là chưa kiểm chứng.

## Phát hiện và xử lý
| # | Mức | Phát hiện | Xử lý | Test hồi quy |
|---|---|---|---|---|
| 1 | Cao | Người lập hồ sơ duyệt (Trưởng Ban) có thể tự ghi bước "đã duyệt", mạo danh người duyệt, xóa/sửa lịch sử khi gửi/gửi lại | Rules: tạo chỉ ở Nháp với bước `waiting/by=null`; gửi chỉ đổi `status` bước hiện tại sang `waiting/pending`; lịch sử chỉ **nối thêm 1 mục do chính người ghi**, giữ nguyên mục cũ | `Hồi quy bảo mật…` (6 test) |
| 2 | Trung bình | Người được giao tự đặt "Đã duyệt"; bỏ qua yêu cầu minh chứng khi "Hoàn thành" | Rules chặn "Đã duyệt" với người được giao; "Hoàn thành" cần minh chứng khi Workspace bật | 3 test |
| 3 | Trung bình | Màn hình "Đang mở Workspace" chèn thông báo lỗi vào HTML **không escape** | Dùng template `html` (escape mặc định) | E2E kiểm không có thẻ HTML lộ |
| 4 | Thấp | Có thể nhúng trong iframe trang khác (clickjacking); GitHub Pages không đặt được header `frame-ancestors` | Mã chặn khi `window.top !== window.self` | **Chưa có test tự động** |
| 5 | Cao (chuỗi cung ứng) | `npm audit`: `@grpc/grpc-js` < 1.13.6 (qua firebase), `minimatch` (qua eslint) | `overrides` lên bản đã vá; `npm audit` = 0 | CI chạy `npm audit --audit-level=high` |

Các lỗ hổng #1–#2 là lỗi **do tôi tạo ra ở bản Rules đầu** và đã được sửa **trước khi** có người dùng thật; Rules sửa đã triển khai (khớp từng byte với file kiểm thử, kiểm tra ngày 2026-11-03).

## Kiểm soát đã có
- **Rules:** mặc định từ chối; `hasOnly` cho mọi collection; kiểu/độ dài/enum; dấu thời gian máy chủ; trường bất biến; bộ đếm công việc chống trùng; bình luận/lịch sử chỉ tạo; chủ Workspace không bị hạ quyền; 50 test (chưa đăng nhập, chủ sở hữu, người khác, thiếu quyền, sai kiểu, trường bị bảo vệ, đường dẫn chưa khai báo).
- **XSS:** template escape mặc định; link ngoài chỉ `https:` (`safeHref`) + `rel="noopener noreferrer"`; CSV chống formula injection; E2E có ca bình luận chứa `<img onerror>`.
- **CSP** (thẻ meta; bản production không cho phép localhost) · build production **từ chối** kết nối Emulator · `check-dist` kiểm tra trong CI.
- **GitHub Actions:** `permissions: contents: read` mặc định, chỉ job deploy có `pages/id-token: write`; tất cả Actions pin theo **full SHA**; không `pull_request_target`; không dùng `${{ github.event.* }}` trong lệnh shell; `persist-credentials: false`; `concurrency`; deploy chỉ từ `main` sau khi verify đạt; **không có secret nào**.
- **Repo:** secret scanning + push protection, Dependabot alerts + updates, private vulnerability reporting, token workflow mặc định chỉ đọc, ruleset `main` (chặn xóa, chặn force-push, bắt buộc check `verify`).

## Trao đổi (chat) – bổ sung 03/11/2026
- Quyền kênh do **Rules** cưỡng chế (không chỉ ẩn ở giao diện): kênh chung cho thành viên đã xác minh; kênh Ban chỉ cho thành viên được gán Ban + Owner; Approver **không** tự động đọc kênh Ban.
- Chống mạo danh: `authorUid == uid` và `authorName ==` tên hiển thị trong hồ sơ thành viên; `createdAt == request.time`; `hasOnly` 4 trường; 1–2000 ký tự; không sửa tin; xóa: tác giả hoặc Owner.
- XSS: nội dung luôn escape; chỉ tự tạo liên kết cho `https://` (qua `safeHref`, `rel="noopener noreferrer"`); E2E gửi chuỗi `<b>` và kiểm tra không thành thẻ HTML.
- 11 test Rules + 1 test tích hợp + luồng E2E hai trình duyệt.
- Giới hạn: **không có giới hạn tốc độ gửi** (Rules không đếm được theo thời gian) → một thành viên có thể spam và tiêu hạn mức ghi Spark; cách xử lý hiện tại là Owner xóa tin/xóa thành viên. Tin nhắn **không mã hóa đầu-cuối** (Google lưu dạng thường như mọi dữ liệu Firestore). Chấm "chưa đọc" lưu trên trình duyệt (localStorage), không đồng bộ giữa các máy.

## Rủi ro còn lại / giới hạn
1. Ruleset `main` cho phép **admin repo bỏ qua** (1 người quản trị, không có người review thứ hai); không yêu cầu PR review.
2. Repo **public** (theo lựa chọn của người dùng, để dùng Pages miễn phí): mã nguồn công khai; bảo mật dựa vào Rules, không dựa vào việc giấu mã.
3. CSP bằng thẻ meta không hỗ trợ `frame-ancestors`/report; dùng frame-buster (#4).
4. Email xác minh/đặt lại mật khẩu dùng mẫu & hạn mức mặc định của Firebase; chưa tùy biến.
5. Không có giới hạn tốc độ riêng ngoài cơ chế chống lạm dụng mặc định của Firebase Auth/Firestore.
6. Chưa kiểm thử xâm nhập độc lập và chưa quét lịch sử Git bằng công cụ chuyên dụng (chỉ có `scripts/scan-secrets.mjs` + GitHub secret scanning); lịch sử chỉ có 1 commit.
7. Hai PR Dependabot tự mở sau lần push đầu chưa được xem xét.
8. Vai trò "Approver" thấy toàn bộ công việc/kinh phí của Workspace: **Cần xác nhận** với khách hàng.
