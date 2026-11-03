# Mô hình dữ liệu Firestore

Database `(default)`, vùng `asia-southeast1`, project `khoaflow-ifss-2026`. Mọi trường được kiểm tra kiểu/độ dài ở **Security Rules** (`firestore.rules`) và ở `src/domain/validation.js`.

```
users/{uid}/memberships/{wsId}          Danh sách Workspace của tôi
workspaces/{wsId}                       Workspace
  ├─ members/{uid}                      Thành viên + vai trò + Ban
  ├─ invites/{email}                    Lời mời (id = email viết thường)
  ├─ units/{unitId}                     Ban / CLB / Bộ phận
  ├─ counters/tasks                     Bộ đếm mã #TK
  ├─ tasks/{taskId}                     Công việc
  │    ├─ comments/{id}                 Bình luận
  │    └─ activity/{id}                 Lịch sử hoạt động
  ├─ events/{eventId}                   Dự án & Sự kiện
  ├─ approvals/{id}                     Hồ sơ phê duyệt
  ├─ notices/{id}                       Thông báo từ Trường
  ├─ budget/{id}                        Khoản thu/chi
  └─ docs/{id}                          Tài liệu (link)
```

## Trường chính

| Collection | Trường | Ghi chú |
|---|---|---|
| `workspaces` | `name`, `type`, `academicYear?`, `contactEmail?`, `ownerUid`, `settings{remindBeforeDeadlineHours, approvalWaitWarnDays, requireEvidenceOnComplete, allowConditionalPrep}` | `ownerUid` bất biến |
| `members` | `uid`, `email`, `displayName`, `role ∈ owner/approver/manager/member/lecturer`, `unitIds[≤10]` | **Chỉ Owner** đổi `role/unitIds` (Rules) |
| `invites` | `workspaceId`, `workspaceName`, `email`, `role` (không có owner), `unitIds`, `displayName?`, `invitedBy` | đọc được bởi Owner và đúng email đã xác minh |
| `units` | `name`, `description`, `managerLabel`, `icon` | |
| `tasks` | `title`, `description?`, `unitId`, `type`, `status`, `priority`, `assigneeUid?`, `assigneeName?`, `collaboratorUids[≤20]`, `startDate?`, `dueDate?`, `eventId?`, `progress 0–100`, `checklist[≤50]`, `evidence[≤20]`, `seq`, `completedOn?`, audit | "Quá hạn" **không lưu** |
| `events` | `title`, `description?`, `type`, `status`, `unitId`, `date?`, `location?`, audit | |
| `approvals` | `title`, `unitId`, `eventId?`, `note?`, `requireSchoolLevel`, `steps[1–2]{key,label,status,by,byName,at,comment}`, `currentStep`, `status`, `submittedAt?`, `history[≤50]`, audit | lịch sử chỉ nối thêm |
| `notices` | `title`, `category?`, `summary?`, `deadline?`, `source?`, `contact?`, `status`, `taskIds[≤50]`, audit | |
| `budget` | `kind thu/chi`, `amount int>0`, `source`, `eventId?`, `note`, `date`, `evidenceUrl? (https)`, `status`, `decidedBy?`, audit | |
| `docs` | `title`, `group`, `url (https)`, `appliesTo?`, `academicYear?`, `status`, audit | |

"audit" = `createdBy, createdAt, updatedAt, updatedBy` do client ghi nhưng Rules ép `createdAt/updatedAt == request.time`, `updatedBy == uid`.

## Quy ước
- **Null** biểu diễn "chưa có giá trị" (không dùng `undefined`).
- **ID** do Firestore sinh (trừ `invites` = email, `counters/tasks`).
- **Giới hạn** mảng để tránh vượt 1 MiB/document (xem `LIMITS` trong `constants.js`).
- **Quyền đọc công việc**: Owner/Approver đọc tất cả; người khác đọc việc thuộc Ban của mình, hoặc mình là người được giao/phối hợp. Truy vấn phải khớp đúng điều kiện này (`repo.refs.tasksFor`), vì Rules không phải bộ lọc.
- **Kinh phí** chỉ Owner/Approver/Manager đọc được.
- **Chỉ mục**: các truy vấn dùng một trường + `orderBy` cùng trường nên dùng chỉ mục tự động; riêng truy vấn collection-group `invites.email` cần field override (đã khai báo trong `firestore.indexes.json` và triển khai).

## Quota Spark (ước tính, xác minh lại tại https://firebase.google.com/docs/firestore/pricing)
Miễn phí/ngày: 50.000 đọc, 20.000 ghi, 20.000 xóa; 1 GiB lưu trữ. Mỗi truy vấn Rules `get()/exists()` tính 1 lượt đọc (được cache trong một yêu cầu). Với một Khoa vài chục người dùng, mức này dư dả; xem rủi ro đăng ký mở ở `docs/SECURITY-REVIEW.md`.

## Migration
Chưa có dữ liệu production, nên chưa cần migration. Khi đổi cấu trúc về sau: thêm trường tùy chọn trước, cập nhật Rules cho phép cả hai dạng, viết script migrate có chế độ `--dry-run`, rồi mới siết Rules.
