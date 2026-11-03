# Mô hình dữ liệu (Firestore)

Tên/kiểu trường được cưỡng chế bởi `firestore.rules` (`hasOnly`, kiểu, độ dài, enum). Trường `createdAt/updatedAt` = `serverTimestamp()`; `updatedBy` = uid người ghi (Rules kiểm).

```
users/{uid}/memberships/{wsId}        {workspaceId, workspaceName, joinedAt}                    # chỉ chủ tài khoản
workspaces/{wsId}                     {name, type, academicYear, contactEmail, ownerUid, settings{remindBeforeDeadlineHours,
                                       approvalWaitWarnDays, requireEvidenceOnComplete, allowConditionalPrep}, createdAt, updatedAt, updatedBy}
  members/{uid}                       {uid, email, displayName, role, unitIds[], joinedAt, updatedAt}   # role: owner|approver|manager|member|lecturer
  invites/{email}                     {workspaceId, workspaceName, email, role, unitIds[], displayName, invitedBy, createdAt}
  units/{unitId}                      {name, description, managerLabel, icon, createdAt, updatedAt, updatedBy}
  counters/tasks                      {next}                                                    # mã #TK
  tasks/{taskId}                      {title, description, unitId, type, status, priority, assigneeUid, assigneeName, collaboratorUids[],
                                       startDate, dueDate, eventId, progress, checklist[], evidence[], seq, completedOn, created*/updated*}
    comments/{id}                     {text, authorUid, authorName, createdAt}                  # chỉ tạo/xóa, không sửa
    activity/{id}                     {action, detail, actorUid, actorName, createdAt}          # chỉ tạo
  events/{id}                         {title, description, type, status, unitId, date, location, created*/updated*}
  approvals/{id}                      {title, unitId, eventId, note, requireSchoolLevel, steps[], currentStep, status, submittedAt, history[], ...}
  notices/{id}                        {title, category, summary, deadline, source, contact, status, taskIds[], ...}
  budget/{id}                         {kind thu|chi, amount(int>0), source, eventId, note, date, evidenceUrl, status, decidedBy, ...}
  docs/{id}                           {title, group, url(https), appliesTo, academicYear, status, ...}
```

## Quyền (tóm tắt)
| Dữ liệu | Đọc | Ghi |
|---|---|---|
| Workspace, members, units, events, approvals, notices, docs | Mọi thành viên | Theo vai trò (Owner mọi nơi; Manager trong Ban của mình; Approver duyệt) |
| tasks | Owner/Approver: tất cả; người khác: việc thuộc Ban của mình, được giao hoặc phối hợp | Owner/Manager sửa đủ; người được giao chỉ `status, progress, checklist, evidence, completedOn` |
| budget | Owner, Approver, Manager | Manager/Owner đề xuất; Owner/Approver duyệt |
| members.role/unitIds | Thành viên | **Chỉ Owner** (không tự nâng quyền); không hạ chủ gốc |

## Truy vấn và chỉ mục
Truy vấn một trường + `orderBy(createdAt)` cùng collection dùng chỉ mục tự động; truy vấn công việc theo phạm vi (`assigneeUid ==`, `collaboratorUids array-contains`, `unitId in`) là một trường nên không cần chỉ mục tổ hợp. Lời mời: `collectionGroup('invites').where('email'==)` dùng chỉ mục collection-group đã khai báo trong `firestore.indexes.json` và đã triển khai.

## Giới hạn
Mỗi truy vấn tối đa 500 (công việc Owner 1000). Checklist ≤ 50, minh chứng ≤ 20, phối hợp ≤ 20, lịch sử duyệt ≤ 50 → document không tăng không kiểm soát. Không có migration vì chưa có dữ liệu cũ; đổi schema sau này cần chiến lược migration trước.
