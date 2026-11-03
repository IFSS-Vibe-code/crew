# Đối chiếu mockup

Mockup `design/mockup-index.html` (demo frontend tĩnh, dữ liệu giả). Theo yêu cầu người dùng, mockup chỉ là **gợi ý**; ứng dụng được thiết kế lại theo thực hành của ClickUp/Asana và khảo sát.

| Mockup | Trạng thái | Ghi chú |
|---|---|---|
| Sidebar + 12 mục, Workspace switcher, vai trò | **Đã đáp ứng** | Vai trò nay là dữ liệu thật + Rules, không phải ô chọn demo |
| Tổng quan (4 chỉ số, tiến độ theo Ban, hoạt động, việc cần chú ý) | Đã đáp ứng | Số liệu từ Firestore |
| Chương trình từ Trường (3 thẻ, "Tạo nhiệm vụ") | Đã đáp ứng | Nhập tay; **chưa đọc email tự động** |
| Công việc (bảng, lọc, tạo) | Đã đáp ứng + mở rộng | Thêm Kanban, chi tiết, checklist, minh chứng, bình luận, CSV |
| Dự án & Sự kiện + luồng 5 bước | Đã đáp ứng | Thêm nhân bản năm trước |
| Phê duyệt (Duyệt/Yêu cầu sửa, 2–4 tuần) | Đã đáp ứng | Đếm ngày chờ thật; "2–4 tuần" là khảo sát, không phải cam kết |
| Lịch tháng | Đã đáp ứng | Tháng/hôm nay động, bộ lọc hoạt động |
| Ban/CLB | Đã đáp ứng | CRUD, tiến độ |
| Kinh phí | Đã đáp ứng | Đề xuất → duyệt; **số liệu mockup chỉ minh hoạ**, bản thật bắt đầu từ 0 |
| Tài liệu & biểu mẫu | Đã đáp ứng (link) | Không tải file (Spark) |
| Báo cáo | Đã đáp ứng | + CSV |
| Thành viên & phân quyền | Đã đáp ứng | Mời qua email, đổi vai trò |
| Cài đặt (5 công tắc) | Đã đáp ứng | 4 công tắc có tác dụng thật; "tách dữ liệu theo Ban" là hành vi mặc định của Rules |
| Thông báo (chuông) | Đã đáp ứng | Thông báo trong ứng dụng |
| Tạo Workspace mới | Đã đáp ứng | Thật, có tạo Ban mặc định |

## Chưa rõ / rủi ro
Danh sách Ban thực tế, ai duyệt cuối cùng, phạm vi xem giữa các Ban, quy chế chi, email đầu mối — xem `docs/PHAN_TICH_YEU_CAU.md` mục **Cần xác nhận**.
