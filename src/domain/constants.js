// Danh mục nghiệp vụ lấy từ mockup (design/mockup-index.html) và docs/PHAN_TICH_YEU_CAU.md.

/** Vai trò trong Workspace (PHAN_TICH_YEU_CAU §2). */
export const ROLES = Object.freeze({
  owner: { label: 'Lãnh đạo Khoa · Workspace Owner', short: 'Trưởng khoa / Owner' },
  approver: { label: 'Người duyệt (Approver)', short: 'Người duyệt' },
  manager: { label: 'Trưởng Ban / Đầu mối (Manager)', short: 'Trưởng Ban' },
  member: { label: 'Thành viên (Member)', short: 'Thành viên' },
  lecturer: { label: 'Giảng viên (Lecturer)', short: 'Giảng viên' },
});
export const ROLE_KEYS = Object.freeze(Object.keys(ROLES));

/**
 * Trạng thái công việc (PHAN_TICH_YEU_CAU §6).
 * "Quá hạn" KHÔNG lưu vào DB – được suy ra từ Deadline (xem tasks.effectiveStatus).
 */
export const TASK_STATUSES = Object.freeze([
  'Nháp',
  'Chưa bắt đầu',
  'Đang thực hiện',
  'Chờ phê duyệt',
  'Chuẩn bị có điều kiện',
  'Đã duyệt',
  'Chờ nghiệm thu',
  'Hoàn thành',
  'Tạm hoãn/Hủy',
]);
export const OVERDUE = 'Quá hạn';
/** Trạng thái được coi là đã kết thúc – không tính quá hạn. */
export const CLOSED_STATUSES = Object.freeze(['Hoàn thành', 'Tạm hoãn/Hủy']);

export const PRIORITIES = Object.freeze(['Cao', 'Trung bình', 'Thấp']);

/** Loại công việc theo nhóm nghiệp vụ (PHAN_TICH_YEU_CAU §4). */
export const TASK_TYPES = Object.freeze(['Sự kiện', 'Đoàn - Hội', 'Học thuật', 'Giảng dạy & cố vấn', 'Hành chính', 'Đối ngoại']);

export const EVENT_TYPES = Object.freeze(['Phong trào', 'Sự kiện', 'Học thuật', 'Cấp Trường', 'Hành chính', 'Đối ngoại']);
export const EVENT_STATUSES = Object.freeze([
  'Mới tiếp nhận',
  'Đang chuẩn bị',
  'Chờ duyệt',
  'Chuẩn bị có điều kiện',
  'Đã duyệt',
  'Đang tổ chức',
  'Tổng kết',
  'Hoàn thành',
  'Tạm hoãn/Hủy',
]);

/** Trạng thái thông báo từ Trường (mockup: trang "Chương trình từ Trường"). */
export const NOTICE_STATUSES = Object.freeze(['Mới tiếp nhận', 'Cần đăng ký', 'Chờ phân công', 'Đã phân công', 'Đã hoàn tất']);

/** Bước duyệt kế hoạch (PHAN_TICH_YEU_CAU §5; mockup "Các bước phê duyệt"). */
export const APPROVAL_STEP_DEFS = Object.freeze({
  chiuy: 'Chi ủy xem xét và duyệt',
  truong: 'Đoàn trường / Hội Sinh viên duyệt',
});
export const APPROVAL_STATUSES = Object.freeze(['Nháp', 'Chờ xử lý', 'Cần bổ sung', 'Đã duyệt', 'Từ chối']);

export const BUDGET_SOURCES = Object.freeze(['Quỹ ĐK/LC', 'Khoa hỗ trợ', 'Trường hỗ trợ']);
export const BUDGET_KINDS = Object.freeze({ thu: 'Khoản thu', chi: 'Khoản chi' });
export const BUDGET_STATUSES = Object.freeze(['Đề xuất', 'Đã duyệt', 'Từ chối']);

export const DOC_GROUPS = Object.freeze(['Biểu mẫu', 'Hướng dẫn', 'Kế hoạch', 'Công văn', 'Biên bản', 'Minh chứng', 'Báo cáo', 'Lưu trữ năm trước']);

/**
 * Đơn vị khởi tạo mặc định – chính là các đơn vị minh họa khách hàng nêu trong
 * PHAN_TICH_YEU_CAU §3. Owner có thể sửa/xóa sau khi khởi tạo.
 */
export const DEFAULT_UNITS = Object.freeze([
  { name: 'Đoàn Khoa / Liên chi', description: 'Tiếp nhận phong trào, lập kế hoạch và điều phối hoạt động', managerLabel: 'BCH ĐK/LC', icon: '⚑' },
  { name: 'Ban Sự kiện', description: 'Tổ chức chương trình, hậu cần và điều phối nhân sự', managerLabel: 'Trưởng Ban', icon: '▦' },
  { name: 'Ban Truyền thông', description: 'Nội dung, thiết kế và truyền thông chương trình', managerLabel: 'Trưởng Ban', icon: '✧' },
  { name: 'Ban Học thuật', description: 'Cuộc thi, tọa đàm, nghiên cứu khoa học', managerLabel: 'Trưởng Ban', icon: '⌘' },
  { name: 'Văn phòng Khoa', description: 'Hồ sơ, biểu mẫu, lịch và công tác hành chính', managerLabel: 'Điều phối', icon: '▤' },
  { name: 'Giảng viên', description: 'Giảng dạy, hướng dẫn và hội đồng chuyên môn', managerLabel: 'Trưởng bộ môn', icon: '♙' },
]);

export const WORKSPACE_TYPES = Object.freeze(['Khoa / đơn vị đào tạo', 'CLB / tổ chức sinh viên', 'Đội / nhóm / tổ chức khác']);

export const DEFAULT_SETTINGS = Object.freeze({
  remindBeforeDeadlineHours: 24,
  approvalWaitWarnDays: 14,
  requireEvidenceOnComplete: true,
  allowConditionalPrep: true,
});

/** Giới hạn để tránh document vượt 1 MiB và mảng tăng không kiểm soát. */
export const LIMITS = Object.freeze({
  title: 200,
  text: 5000,
  shortText: 300,
  checklist: 50,
  collaborators: 20,
  unitsPerMember: 10,
  evidence: 20,
  history: 50,
  amount: 100_000_000_000,
});
