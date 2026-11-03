# Chính sách bảo mật

## Báo cáo lỗ hổng
Vui lòng **không** mở issue công khai cho lỗ hổng bảo mật. Hãy dùng **GitHub → Security → "Report a vulnerability"** (private vulnerability reporting) của repository này, hoặc liên hệ chủ sở hữu repository. Hãy nêu: mô tả, các bước tái hiện (dùng dữ liệu giả), tác động, và phiên bản/commit.

Chúng tôi cố gắng phản hồi trong vòng 7 ngày làm việc. Đây là dự án phi thương mại, không có chương trình thưởng lỗi.

## Phạm vi
Mã nguồn trong repository, `firestore.rules`, workflow GitHub Actions và bản triển khai GitHub Pages. Vui lòng **không** thử nghiệm phá hoại trên dữ liệu thật hoặc tấn công từ chối dịch vụ.

## Lưu ý thiết kế
- Cấu hình Web của Firebase (`apiKey`...) là công khai theo thiết kế; quyền truy cập dữ liệu được kiểm soát bằng Authentication và Firestore Security Rules.
- Không bao giờ commit `.env`, khóa riêng, service-account.
