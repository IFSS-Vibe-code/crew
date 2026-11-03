# Yêu cầu – KhoaFlow

Nguồn: `design/mockup-index.html` (mockup, chỉ là **gợi ý**), `docs/PHAN_TICH_YEU_CAU.md` (khảo sát khách hàng) và tham khảo cách tổ chức công việc của ClickUp/Asana. Mọi nội dung nghiệp vụ chưa có căn cứ được ghi **Cần xác nhận**; hệ thống không tự bịa công thức hay quy chế.

## 1. Mục tiêu

Quản lý tập trung công việc, chương trình, phê duyệt, kinh phí và tài liệu của Khoa: giảm bỏ sót thông báo, theo dõi tiến độ duyệt 2–4 tuần, tái sử dụng kế hoạch năm trước.

## 2. Mô hình tổ chức (học từ ClickUp/Asana)

| ClickUp / Asana | KhoaFlow | Ghi chú |
|---|---|---|
| Workspace | Workspace (Khoa/CLB) | Dữ liệu tách theo Workspace; một tài khoản tham gia nhiều Workspace |
| Space / Team | Ban / CLB / Bộ phận (`units`) | Quyền theo Ban |
| Folder / Project | Dự án & Sự kiện (`events`) | Gom công việc của một chương trình |
| List / Section | Danh sách + bộ lọc | |
| Task / Subtask | Công việc + checklist | Checklist thay cho subtask (đơn giản, tính % tiến độ) |
| Views: List, Board | Danh sách, Bảng Kanban (kéo thả) | Kiểu xem được nhớ trên máy |
| Calendar view | Lịch hoạt động | Gộp Deadline, chương trình, hạn đăng ký |
| Approvals | Phê duyệt kế hoạch hai cấp | Có trả hồ sơ, lịch sử, cảnh báo chờ lâu |
| Dashboards | Tổng quan + Báo cáo | Số liệu tính từ dữ liệu thật |
| Comments / Activity | Bình luận + Lịch sử hoạt động | Theo từng công việc |
| Templates | Nhân bản chương trình + Thư viện tài liệu | |
| Inbox / Notifications | Thông báo trong ứng dụng + Hộp "Chương trình từ Trường" | |

## 3. Yêu cầu chức năng

| Mã | Yêu cầu | Trạng thái |
|---|---|---|
| FR-01 | Đăng ký/đăng nhập bằng email + mật khẩu; bắt buộc xác minh email; quên mật khẩu | Đã xây dựng |
| FR-02 | Tạo Workspace; nhận lời mời; chuyển Workspace | Đã xây dựng |
| FR-03 | 5 vai trò: Owner, Approver, Manager, Member, Lecturer; phân quyền theo Ban; kiêm nhiệm = một vai trò chính | Đã xây dựng (kiêm nhiệm: **Cần xác nhận**) |
| FR-04 | Quản lý Ban/CLB/bộ phận (tạo, sửa, xóa khi không còn việc) | Đã xây dựng |
| FR-05 | Công việc: mã #TK, mô tả, loại, ưu tiên, người phụ trách + phối hợp, ngày bắt đầu/Deadline, trạng thái, checklist, minh chứng (link https), bình luận, lịch sử | Đã xây dựng |
| FR-06 | 10 trạng thái theo khảo sát; "Quá hạn" **suy ra** từ Deadline; "Chuẩn bị có điều kiện" có thể bật/tắt | Đã xây dựng |
| FR-07 | Xem Danh sách / Bảng Kanban kéo thả; lọc theo trạng thái, Ban, ưu tiên, loại, người phụ trách; tìm kiếm; xuất CSV | Đã xây dựng |
| FR-08 | Chương trình/sự kiện; nhân bản chương trình năm trước kèm công việc | Đã xây dựng |
| FR-09 | Hộp thông báo từ Trường: ghi nhận, hạn đăng ký, tạo nhiệm vụ liên kết | Đã xây dựng (ghi nhận thủ công); tự đọc Gmail/Outlook: **Cần xác nhận** |
| FR-10 | Phê duyệt: Nháp → Chi ủy → (tùy chọn) Đoàn trường/Hội SV → Đã duyệt; trả để bổ sung và gửi lại; từ chối (bắt buộc lý do); lịch sử; cảnh báo chờ quá N ngày | Đã xây dựng |
| FR-11 | Kinh phí: đề xuất thu/chi theo nguồn (Quỹ ĐK/LC, Khoa, Trường), duyệt/từ chối, chứng từ link, tổng hợp theo nguồn/chương trình | Đã xây dựng; quy chế chi, hạn mức: **Cần xác nhận** |
| FR-12 | Tài liệu & biểu mẫu: lưu **link** theo nhóm, năm học | Đã xây dựng (không lưu file – xem NFR-05) |
| FR-13 | Lịch tháng gộp Deadline/chương trình/hạn đăng ký, có bộ lọc | Đã xây dựng |
| FR-14 | Báo cáo: phân bổ trạng thái, đúng hạn, thời gian duyệt TB, khối lượng theo người, tiến độ theo Ban; xuất CSV | Đã xây dựng |
| FR-15 | Thông báo trong ứng dụng (quá hạn, sắp hạn, hồ sơ chờ lâu) | Đã xây dựng; email/đẩy: ngoài phạm vi Spark |
| FR-16 | Đồng bộ realtime nhiều người; tự lưu tiêu đề/mô tả; báo xung đột thay vì ghi đè | Đã xây dựng |

## 4. Yêu cầu phi chức năng

- **NFR-01 Chi phí 0 đồng:** Firebase Spark, không Blaze/Billing, không Hosting, không Cloud Functions; web tĩnh trên GitHub Pages.
- **NFR-02 Bảo mật:** quyền kiểm tra ở Firestore Security Rules (mặc định từ chối), có test; CSP; escape toàn bộ nội dung người dùng.
- **NFR-03 Hạn mức Spark:** giới hạn truy vấn ≤500–1000 bản ghi, không polling, hủy listener khi đổi Workspace/đăng xuất.
- **NFR-04 Giao diện:** responsive (điện thoại/máy tính bảng/desktop), bàn phím, `prefers-reduced-motion`, tiếng Việt.
- **NFR-05 Không lưu file:** Cloud Storage cần Blaze; vì vậy tài liệu/minh chứng là **link https** (Google Drive…). Đây là giới hạn có chủ đích do ràng buộc 0 đồng.
- **NFR-06 Không email tự động:** gửi email cần backend/billing; lời mời được tạo trong hệ thống và người được mời đăng nhập bằng đúng email.

## 5. Điểm cần khách hàng xác nhận

1. Chương trình nào bắt buộc qua Đoàn trường/Hội SV; Chi ủy có là bước bắt buộc cho mọi loại không (hiện: cấu hình theo từng hồ sơ).
2. Ai có quyền duyệt chính thức; người kiêm nhiều vai trò.
3. Đăng nhập: email trường hay cá nhân; có hạn chế miền email (ví dụ chỉ `@ifss.edu.vn`) để chống đăng ký tràn lan không.
4. Quy chế chi, hạn mức duyệt, quy trình tạm ứng/quyết toán.
5. Biểu mẫu chính thức, thời hạn lưu trữ, danh sách Ban/CLB thực tế.
6. Tích hợp Gmail/Outlook/Google Drive/Calendar.
