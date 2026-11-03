# Đối chiếu mockup

Mockup (`design/mockup-index.html`) là giao diện tĩnh dữ liệu giả; theo yêu cầu, nó chỉ là **gợi ý**. Bản triển khai giữ bố cục, tên trang, màu sắc và các khối nghiệp vụ của mockup, và nâng cấp theo ClickUp/Asana.

## 1. Trang và thành phần

| Mockup | KhoaFlow | Trạng thái |
|---|---|---|
| Sidebar + chuyển Workspace + tạo Workspace | Có; chuyển/tạo Workspace thật, lời mời | Đáp ứng, mở rộng |
| Chọn "Xem với vai trò" (mô phỏng) | **Bỏ**; vai trò thật theo tài khoản, kiểm tra ở Rules | Thay thế có chủ đích (mô phỏng không an toàn) |
| Tổng quan (4 thẻ số, tiến độ theo Ban, hoạt động gần đây, việc cần chú ý, Ban) | Có, số liệu thật | Đáp ứng |
| Chương trình từ Trường (3 thẻ + 4 bước xử lý) | Có; ghi nhận thủ công, tạo nhiệm vụ liên kết | Đáp ứng; nút "Đồng bộ email" **không** có (cần backend, xem NFR-06) |
| Công việc (bảng, lọc trạng thái/bộ phận) | Danh sách + Kanban + lọc đa tiêu chí + chi tiết + tự lưu | Đáp ứng, mở rộng |
| Dự án & Sự kiện (thẻ + luồng 5 bước) | Có; thêm nhân bản năm trước | Đáp ứng, mở rộng |
| Phê duyệt kế hoạch (bảng, Duyệt/Yêu cầu sửa, các bước, 2–4 tuần) | Có; thêm Từ chối, lịch sử, đếm ngày chờ, cảnh báo | Đáp ứng, mở rộng |
| Lịch hoạt động (lưới tháng, sắp diễn ra, bộ lọc) | Có; chuyển tháng thật | Đáp ứng |
| Ban/CLB/Bộ phận | Có; tạo/sửa/xóa | Đáp ứng |
| Kinh phí (4 thẻ, cơ cấu nguồn, nguyên tắc) | Có; sổ thu chi thật, duyệt | Đáp ứng |
| Tài liệu & biểu mẫu | Có; **link** thay vì tải file | Đáp ứng một phần (giới hạn Spark) |
| Báo cáo | Có; tính từ dữ liệu thật; xuất CSV | Đáp ứng |
| Thành viên & phân quyền (ma trận vai trò) | Có; mời, đổi quyền, thu hồi | Đáp ứng |
| Cài đặt Workspace | Có; lưu thật | Đáp ứng |
| Trung tâm hỗ trợ (liên kết minh họa) | Không có (không có nội dung thật) | Không áp dụng |
| Chuông thông báo (mô phỏng) | Thông báo trong ứng dụng thật | Đáp ứng |

## 2. Có tương tác nhưng chưa xác định hành vi → cách xử lý

- "Đồng bộ email": cần Gmail/Outlook + backend → **không làm giả**; ghi nhận thủ công.
- "Xuất báo cáo": triển khai xuất CSV (UTF-8, chống CSV injection).
- "Tải tài liệu lên": cần Storage → thay bằng lưu link https.

## 3. Dữ liệu/công thức chưa rõ

Số liệu kinh phí, danh sách Ban/CLB, số thành viên, lãnh đạo trong mockup là dữ liệu minh họa → **không** đưa vào sản phẩm. Workspace mới chỉ khởi tạo cơ cấu Ban đã nêu trong khảo sát (có thể sửa/xóa), không có công việc/số liệu giả.

## 4. Rủi ro khi triển khai

Xem `docs/SECURITY-REVIEW.md` (đăng ký mở, hạn mức Spark) và `docs/FINAL-REPORT.md` (hạng mục chưa xác minh).
