# Báo cáo nghiệm thu – Crew

Ngày: 2026-11-03. Ký hiệu: **ĐX** = Đã xác minh (có bằng chứng) · **CX** = Chưa xác minh · **BC** = Bị chặn · **KAD** = Không áp dụng.

## 1. Tổng quan
Ứng dụng web quản lý công việc của Khoa, dựng từ mockup (chỉ là gợi ý) + khảo sát `docs/PHAN_TICH_YEU_CAU.md`, tham khảo cách tổ chức của ClickUp/Asana. Stack: Vite + JavaScript, Firebase Auth + Firestore (Spark), GitHub Pages.
- Mã nguồn: https://github.com/Hsthanh1612/khoaflow (public) — **ĐX** · chuyển sang Organization: **CX** (đang thực hiện)
- Trang chạy: https://hsthanh1612.github.io/khoaflow/ — **ĐX** (HTTP 200, không lỗi console, đăng nhập sai báo lỗi đúng)

## 2. Chức năng đã hoàn thành — ĐX bằng test/E2E trên Emulator
Đăng ký + xác minh email; Workspace nhiều tổ chức + lời mời; 5 vai trò theo Ban; Ban; công việc (Danh sách + Kanban, checklist, minh chứng, bình luận, lịch sử, tự lưu, CSV); chương trình + nhân bản năm trước; hộp thông báo từ Trường; phê duyệt 2 cấp; "chuẩn bị có điều kiện"; kinh phí; tài liệu; lịch; báo cáo; thông báo trong ứng dụng; **trao đổi (chat) theo kênh chung và kênh Ban** (bổ sung 03/11/2026). Chi tiết `docs/REQUIREMENTS.md`, đối chiếu mockup `docs/MOCKUP-REVIEW.md`.

## 3. Tài liệu nguồn đã kiểm tra
`Master_prompt.txt`, `index.html` (mockup, lưu ở `design/`), `PHAN_TICH_YEU_CAU.md`. Trong `BÀN GIAO/` có 2 SRS dạng PDF và 1 slide (`SRS-Nguoi-dung.pdf`, `SRS-Nha-phat-trien.pdf`, `SRS_Quy_trinh_Vibe-coding.pdf`, `presentation_vibe_coding_with_firebase_and_git.pptx`): **CX – tôi chưa đọc nội dung các file này** (có thể là tài liệu của ứng dụng Financial Plan khác). ClickUp/Asana: dùng kiến thức sẵn có, **không** truy cập trang của họ.

## 4. Kiến trúc & nghiệp vụ
`docs/ARCHITECTURE.md`, `ALGORITHM-SPEC.md`, `DATA-MODEL.md`, `USER-FLOWS.md`. Mockup/khảo sát không có công thức phức tạp; các quy tắc ghi rõ ở ALGORITHM-SPEC, phần chưa rõ ghi "Cần xác nhận".

## 5. Skills
Đã cài 84 skill vào `~/.claude/skills/`; **chỉ 2 skill thực sự được dùng** (`web-design-guidelines`, `security-audit` ở chế độ focused). Agent-Reach: **BC** (thiếu chương trình). Chi tiết trung thực: `docs/SKILLS-INVENTORY.md`.

## 6. Firebase
- Project mới `khoaflow-ifss-2026` (tách khỏi project `financial-plan-project-2a92e` của app khác) — **ĐX**.
- Firestore `(default)`, vùng `asia-southeast1` — **ĐX**.
- Billing: `billingEnabled: false` (kiểm tra qua Cloud Billing API, 2 lần trong ngày) — **ĐX**. Lưu ý: tài khoản Google của bạn vẫn có quyền liên kết Billing; đó là kỷ luật vận hành, không phải khóa kỹ thuật.

## 7. Authentication, Rules, indexes
- Email/Password đã bật; miền `hsthanh1612.github.io` đã thêm vào Authorized domains — **ĐX** (qua API). Luồng email thật trên production — **CX**.
- Rules đã triển khai; nội dung production **trùng từng byte** với file đã kiểm thử (đối chiếu SHA-256) — **ĐX**. 61 test Rules — **ĐX**. Khách chưa đăng nhập đọc/ghi qua REST: 403 — **ĐX**.
- Index collection-group `invites.email` đã triển khai — **ĐX**; truy vấn lời mời chạy trong test tích hợp (Emulator) — **ĐX**; **trên production chưa thử** — **CX**.

## 8. Khởi tạo plan / dữ liệu ban đầu
**KAD (một phần):** mockup/khảo sát không có thực thể "plan" cố định cần seed. Khi tạo Workspace, ứng dụng tạo bộ đếm công việc và 6 Ban mặc định lấy từ khảo sát §3 (có thể sửa) — **ĐX** (E2E). Không có script seed production; chưa tạo Workspace thật nào trên production.

## 9. Tự đồng bộ
Realtime `onSnapshot`, tự lưu tiêu đề/mô tả (debounce 900 ms), transaction cho mã #TK và duyệt hồ sơ, phát hiện xung đột, chỉ báo đồng bộ, hủy listener khi đổi tài khoản/Workspace — **ĐX** (tích hợp + E2E hai trình duyệt). **Không hỗ trợ offline** (cố ý, vì thiết bị dùng chung). Chống ghi trùng khi reload — **ĐX**.

## 10. Kiểm thử code/hệ thống
Lint, format, 49 unit, 10 tích hợp, 5 E2E, build, audit 0, secret scan — **ĐX**. CI GitHub (verify→build→deploy) thành công — **ĐX**. Chi tiết và giới hạn: `docs/TEST-REPORT.md`.

## 11. Bảo mật Firestore
61 test Rules (ĐX). Rà soát bảo mật đã tìm và sửa 2 lỗ hổng Rules, 1 lỗi escape, 2 lỗ hổng dependency (do tôi tự rà soát, không có đánh giá độc lập) — `docs/SECURITY-REVIEW.md`.

## 12. GitHub & CI/CD
Secret scanning + push protection, Dependabot, private vulnerability reporting, token workflow chỉ đọc, ruleset `main` — **ĐX** (qua API). Actions pin SHA, quyền tối thiểu, không secret — **ĐX** (đọc workflow + chạy thật). Ruleset cho admin bỏ qua; hiệu lực ruleset **CX** (chưa thử đẩy vi phạm).

## 13. Triển khai
GitHub Pages — **ĐX**. Không Firebase Hosting: site Hosting mặc định do Firebase tự tạo cùng project tồn tại nhưng **không có bản phát hành** (API trả `{}`) — **ĐX**. Không Cloud Functions/Run.

## 14. Spark / Billing
Xem mục 6. Không nâng Blaze, không liên kết Billing — **ĐX**.

## 15. Lỗi còn tồn tại / chưa kiểm tra
- Một lần E2E thất bại không rõ nguyên nhân, không tái hiện (6 lần sau đều đạt).
- Chưa thử luồng email thật và đăng nhập thật trên production; chưa đa trình duyệt/thiết bị/trình đọc màn hình/hiệu năng.
- Chưa đọc các SRS/slide trong `BÀN GIAO/`.
- Frame-buster chưa có test; hai PR Dependabot chưa xem xét.
- Giao diện chưa dùng thư viện Lucian UX/UI (skill đã cài nhưng không dùng).

## 15b. Giới hạn của chat
Chưa có nhắn riêng 1–1, sửa tin, đính kèm, @nhắc tên, thông báo đẩy; không giới hạn tốc độ gửi; chấm chưa đọc chỉ lưu trên từng trình duyệt; chưa thử với bộ gõ Telex/VNI thật — **CX**.

## 16. Việc cần bạn làm
1. Mở trang production, tạo tài khoản **Owner** thật bằng email của bạn, kiểm tra thư xác minh và liên kết có quay về đúng trang không; tạo Workspace đầu tiên.
2. Xác nhận với khách hàng các mục "Cần xác nhận" (danh sách Ban, ai duyệt cuối cùng, phạm vi xem giữa các Ban, quy chế chi, email đầu mối).
3. Đọc/đối chiếu các SRS trong `BÀN GIAO/` nếu chúng thuộc dự án này, rồi báo tôi để bổ sung.
4. Xem hai PR Dependabot; cân nhắc thêm người review thứ hai và bỏ quyền bypass của ruleset nếu có nhiều quản trị.
5. (Tuỳ chọn) Cài `uv` để dùng Agent-Reach (hướng dẫn trong SKILLS-INVENTORY).

## 17. Giới hạn vận hành
- Spark: Firestore 50.000 lượt đọc / 20.000 ghi / 20.000 xóa mỗi ngày, 1 GiB (số công bố tại thời điểm viết prompt; **chưa kiểm tra lại** trang giá hiện hành). Vượt hạn mức dịch vụ có thể bị hạn chế — ứng dụng hiển thị thông báo và **không** tự nâng gói.
- Mỗi người dùng đang mở Workspace giữ khoảng 10 listener dữ liệu + 1 listener mỗi kênh chat được tham gia (Owner: 7 với 6 Ban) + 1 listener kênh đang mở; mỗi tin nhắn mới tính 1 lượt đọc cho **mỗi** người đang nghe kênh đó; cần theo dõi lượt đọc khi có nhiều người dùng.
- Không tải file lên: tài liệu/minh chứng là link https (vd Google Drive); quyền truy cập file do chủ link quản lý.
- Không sao lưu tự động (cần Billing, bị cấm). Dữ liệu chỉ nằm ở Firestore; nên xuất CSV định kỳ.
- Không offline; mất mạng thì thao tác không được lưu.
