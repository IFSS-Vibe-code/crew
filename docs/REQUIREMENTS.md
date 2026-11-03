# Yêu cầu

Nguồn: `design/mockup-index.html` (mockup – chỉ là gợi ý bố cục/luồng), `docs/PHAN_TICH_YEU_CAU.md` (khảo sát khách hàng), Master prompt, và tham chiếu thực hành ClickUp/Asana theo yêu cầu người dùng. Mục **[Cần xác nhận]** lấy từ khảo sát, chưa được khách hàng chốt.

## Chức năng (đã triển khai)
| Mã | Chức năng | Ghi chú |
|---|---|---|
| F1 | Đăng ký/đăng nhập Email+Mật khẩu, xác minh email, quên mật khẩu | Firebase Auth |
| F2 | Nhiều Workspace; tạo Workspace; lời mời theo email; chuyển Workspace | Mockup: hộp thoại Workspace |
| F3 | 5 vai trò: Owner, Approver, Manager, Member, Lecturer; phạm vi theo Ban | Khảo sát §2; Rules cưỡng chế |
| F4 | Ban/CLB/Bộ phận (CRUD, thành viên, tiến độ) | Khảo sát §3 |
| F5 | Công việc: tạo/sửa/xóa, người phụ trách + phối hợp, Deadline, ưu tiên, loại, checklist, minh chứng (link https), bình luận, lịch sử, Danh sách + Kanban, lọc, CSV, mã #TK | Khảo sát §6; ClickUp/Asana |
| F6 | Dự án & Sự kiện; nhân bản chương trình năm trước | Khảo sát §9 |
| F7 | Hộp thông báo từ Trường (hạn đăng ký, đầu mối, "Tạo nhiệm vụ") | Khảo sát §7; email chưa tích hợp **[Cần xác nhận]** |
| F8 | Phê duyệt 1–2 cấp: gửi, duyệt, yêu cầu sửa, gửi lại, từ chối, lịch sử, đếm ngày chờ, cảnh báo chờ lâu | Khảo sát §5 |
| F9 | "Chuẩn bị có điều kiện" khi chờ duyệt (bật/tắt theo Workspace) | Khảo sát §5 |
| F10 | Kinh phí: thu/chi, 3 nguồn, đề xuất → duyệt, số dư | Khảo sát §8; quy chế chi **[Cần xác nhận]** |
| F11 | Tài liệu & biểu mẫu (lưu link https, theo năm học) | Khảo sát §9 |
| F12 | Lịch tháng (Deadline, chương trình, hạn đăng ký) | Khảo sát §9 |
| F13 | Báo cáo: tiến độ, theo Ban, đúng hạn, thời gian duyệt TB, kinh phí; xuất CSV | Khảo sát §9 |
| F14 | Thông báo trong ứng dụng (quá hạn/sắp hạn/hồ sơ chờ lâu) | Khảo sát MVP #6 |
| F16 | **Trao đổi (chat)**: kênh "Toàn Workspace" + kênh riêng mỗi Ban; realtime, chấm chưa đọc, gửi Enter / Shift+Enter, link https, xóa tin (tác giả/Owner), tải tin cũ | Yêu cầu bổ sung của người dùng (03/11/2026) |
| F15 | Tự lưu tiêu đề/mô tả, đồng bộ realtime, chỉ báo đồng bộ, phát hiện xung đột | Master prompt §14 |

## Không triển khai (ghi rõ)
- Chat: chưa có nhắn riêng 1–1, sửa tin, đính kèm file, gõ @nhắc tên, thông báo đẩy/email khi có tin mới, tìm kiếm tin nhắn.
- Tải file lên (cần Cloud Storage/Billing) → thay bằng link https (vd Google Drive).
- Tự đọc Gmail/Outlook, gửi email nhắc, app mobile native, SSO trường, sao lưu/khôi phục tự động, AI trích xuất nhiệm vụ → ngoài phạm vi Spark/MVP; **[Cần xác nhận]** nếu khách hàng muốn.
- Phân công giảng dạy theo khối lượng/định mức: khảo sát không có công thức → chưa làm, tránh bịa.
- Phân quyền xem giữa các Ban và quyền duyệt cuối cùng: dùng mặc định an toàn (Manager chỉ thấy Ban mình; Owner/Approver thấy tất cả) **[Cần xác nhận]**.

## Phi chức năng
- Chi phí 0 đ (Spark, GitHub Pages); không Firebase Hosting/Functions.
- Bảo mật: Rules mặc định từ chối, xác minh email, CSP, không secret trong frontend.
- Dùng được trên máy tính/điện thoại (responsive), bàn phím, tương phản, `prefers-reduced-motion`.
- Hạn mức Spark: truy vấn có `limit`, listener hủy khi không dùng, không polling.

## Tiêu chí nghiệm thu
Mọi cổng ở `docs/TEST-REPORT.md` đạt; các mục "Chưa xác minh/Bị chặn" ở `docs/FINAL-REPORT.md` được nêu rõ.
