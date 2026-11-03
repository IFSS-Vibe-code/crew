# Đặc tả thuật toán và quy tắc dữ liệu

Cài đặt trong `src/domain/*` (thuần, không phụ thuộc UI/Firebase) và được test trong `tests/unit/domain.test.js`. Mockup/khảo sát **không** cung cấp công thức tính toán phức tạp; các quy tắc dưới đây là quy tắc nghiệp vụ tối thiểu rút ra từ khảo sát. Những gì chưa rõ để ở mục "Cần xác nhận".

## 1. Ngày
- Ngày nghiệp vụ (Deadline…) lưu chuỗi `YYYY-MM-DD` theo giờ địa phương → không lệch múi giờ. `isIsoDate` kiểm tra cả năm nhuận (29/02/2026 không hợp lệ).
- Thời điểm hệ thống (`createdAt`, `updatedAt`) dùng `serverTimestamp()` (giờ máy chủ).
- Lưới lịch tháng bắt đầu Thứ Hai, 35 hoặc 42 ô.

## 2. Công việc
- **Quá hạn** = có Deadline **<** hôm nay **và** trạng thái ∉ {Hoàn thành, Tạm hoãn/Hủy}. Không lưu vào DB (tránh dữ liệu cũ); luôn suy ra khi hiển thị/lọc.
- **Sắp đến hạn** = 0 ≤ (Deadline − hôm nay) ≤ N ngày (mặc định 1 ngày ≈ 24 giờ theo cài đặt).
- **Tiến độ** = nếu có checklist: `round(mục xong / tổng × 100)`; ngược lại dùng `progress` nhập tay, chặn vào [0,100]; giá trị không phải số = 0.
- **Chuyển trạng thái**: sang "Hoàn thành" cần ≥ 1 minh chứng nếu `requireEvidenceOnComplete`; "Chuẩn bị có điều kiện" chỉ khi `allowConditionalPrep`. Người được giao không đặt "Đã duyệt" (Rules + UI).
- **Sắp xếp**: việc chưa đóng trước; Deadline gần trước (không Deadline xuống cuối); ưu tiên Cao > Trung bình > Thấp; rồi theo mã.
- **Mã #TK-nnn**: bộ đếm `counters/tasks.next`; tạo việc chạy trong **transaction** tăng bộ đếm và ghi việc; Rules ép `seq == next+1` nên không thể trùng mã.
- **Tiến độ theo Ban** = trung bình tiến độ các việc chưa hủy của Ban (0 nếu không có việc).

## 3. Phê duyệt (máy trạng thái)
```
Nháp ──gửi──▶ Chờ xử lý[cấp k] ──duyệt──▶ (k < cuối) Chờ xử lý[cấp k+1]
                                         └─(k = cuối) Đã duyệt
Chờ xử lý ──yêu cầu sửa(lý do)──▶ Cần bổ sung ──gửi lại──▶ Chờ xử lý[cùng cấp]
Chờ xử lý ──từ chối(lý do)──▶ Từ chối (kết thúc)
```
- Số cấp = 1 (chỉ Chi ủy) hoặc 2 (+ Đoàn trường/Hội SV) theo `requireSchoolLevel`.
- Mọi chuyển trạng thái trả bản **mới** (bất biến), ghi 1 mục lịch sử (người, thời điểm, cấp, ghi chú); lịch sử giữ tối đa 50 mục.
- **Ngày chờ** = số ngày từ `submittedAt` (gửi hoặc chuyển cấp gần nhất) đến hôm nay; cảnh báo khi ≥ `approvalWaitWarnDays`.
- **Thời gian duyệt TB** = trung bình (ngày) từ mục "Gửi duyệt" đầu tiên đến mục "Duyệt" cuối của hồ sơ **đã duyệt**.
- Ghi bằng transaction có kiểm tra `status/currentStep` còn như lúc đọc; nếu khác → báo xung đột.

## 4. Kinh phí
- Số tiền: số nguyên dương VND ≤ 10¹¹; chấp nhận nhập `1.500.000`/`1 500 000 đ`; số âm/số thực/chuỗi → từ chối.
- **Thu/Chi/Số dư** chỉ tính khoản **Đã duyệt**; "Dự kiến còn" = số dư − tổng chi **Đề xuất**.
- Tổng theo nguồn: thu, chi, số dư từng nguồn (Quỹ ĐK/LC, Khoa hỗ trợ, Trường hỗ trợ).
- **Cần xác nhận**: hạn mức duyệt theo vai trò, quy trình tạm ứng/quyết toán.

## 5. Báo cáo
- Phân bổ: Hoàn thành / Đang thực hiện + chưa bắt đầu / Chờ phê duyệt + nghiệm thu / Quá hạn (loại việc đã hủy khỏi mẫu số).
- **Đúng hạn** = `completedOn ≤ dueDate` trên số việc đã hoàn thành có Deadline.
- **CSV**: UTF-8 BOM; ô bắt đầu bằng `= + - @` được thêm `'` phía trước (chống CSV/formula injection).

## 6. Đồng bộ
- Tự lưu tiêu đề/mô tả: debounce 900 ms hoặc khi mất focus; chỉ ghi nếu khác bản đã lưu; transaction so sánh với giá trị gốc lúc bắt đầu sửa → **xung đột** nếu server đã khác (không ghi đè); trùng giá trị → không ghi.
- Mọi thao tác ghi chỉ báo thành công **sau** khi server xác nhận (`await` batch/transaction).

## 7. Chưa xác định (không tự bịa)
Quy chế chi, định mức, công thức khối lượng giảng dạy/hướng dẫn (khảo sát nhắc phân công nhưng không có công thức), thời hạn lưu trữ.
