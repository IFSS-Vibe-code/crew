// Quyền ở tầng giao diện. Đây CHỈ là để ẩn/hiện nút cho dễ dùng;
// ranh giới bảo mật thật nằm ở firestore.rules (được test trong tests/rules).

/** @typedef {{uid:string, role:string, unitIds:string[]}} Member */

const isPrivileged = (m) => m?.role === 'owner' || m?.role === 'approver';
const inUnit = (m, unitId) => !!m && Array.isArray(m.unitIds) && m.unitIds.includes(unitId);

export const can = {
  manageWorkspace: (m) => m?.role === 'owner',
  manageMembers: (m) => m?.role === 'owner',
  manageUnits: (m) => m?.role === 'owner',

  /** Trưởng Ban tạo việc trong Ban được gán; Owner tạo mọi nơi. */
  createTask: (m, unitId) => m?.role === 'owner' || (m?.role === 'manager' && (unitId ? inUnit(m, unitId) : (m.unitIds || []).length > 0)),
  /** Sửa toàn bộ thông tin công việc (tên, Ban, người phụ trách, Deadline...). */
  editTask: (m, t) => m?.role === 'owner' || (m?.role === 'manager' && inUnit(m, t?.unitId)),
  /** Cập nhật tiến độ / trạng thái / checklist / minh chứng: người được giao hoặc người phối hợp. */
  updateTaskProgress: (m, t) => can.editTask(m, t) || (!!m && !!t && (t.assigneeUid === m.uid || (t.collaboratorUids || []).includes(m.uid))),
  deleteTask: (m, t) => can.editTask(m, t),
  readTask: (m, t) => isPrivileged(m) || inUnit(m, t?.unitId) || t?.assigneeUid === m?.uid || (t?.collaboratorUids || []).includes(m?.uid),

  manageEvent: (m, unitId) => m?.role === 'owner' || (m?.role === 'manager' && inUnit(m, unitId)),

  /** Lập / gửi hồ sơ duyệt kế hoạch. */
  submitApproval: (m, unitId) => m?.role === 'owner' || (m?.role === 'manager' && inUnit(m, unitId)),
  /** Duyệt / trả lại / từ chối. */
  decideApproval: (m) => isPrivileged(m),

  manageNotices: (m) => m?.role === 'owner' || m?.role === 'manager',

  readBudget: (m) => ['owner', 'approver', 'manager'].includes(m?.role),
  proposeBudget: (m) => m?.role === 'owner' || m?.role === 'manager',
  decideBudget: (m) => isPrivileged(m),

  manageDocs: (m) => m?.role === 'owner' || m?.role === 'manager',
};

/** Phạm vi dữ liệu mặc định của từng vai trò (mockup: "Xem với vai trò"). */
export function scopeLabel(m) {
  switch (m?.role) {
    case 'owner':
      return 'Toàn Khoa';
    case 'approver':
      return 'Toàn Khoa · hồ sơ chờ duyệt';
    case 'manager':
      return 'Ban được phân công';
    case 'lecturer':
      return 'Công việc chuyên môn';
    default:
      return 'Công việc cá nhân';
  }
}
