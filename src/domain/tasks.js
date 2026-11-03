// Nghiệp vụ công việc: trạng thái hiệu lực, lọc, sắp xếp, nhóm theo Kanban, tiến độ.
import { TASK_STATUSES, CLOSED_STATUSES, OVERDUE, PRIORITIES } from './constants.js';
import { todayIso, daysBetween } from './dates.js';

/** Công việc quá hạn khi có Deadline < hôm nay và chưa kết thúc. */
export function isOverdue(task, today = todayIso()) {
  if (!task?.dueDate || CLOSED_STATUSES.includes(task.status)) return false;
  return task.dueDate < today;
}

/** Trạng thái hiển thị: "Quá hạn" được suy ra, không lưu trong DB. */
export function effectiveStatus(task, today = todayIso()) {
  return isOverdue(task, today) ? OVERDUE : task?.status;
}

/** Số ngày còn lại đến Deadline (âm nếu đã quá). */
export function daysLeft(task, today = todayIso()) {
  if (!task?.dueDate) return null;
  return daysBetween(today, task.dueDate);
}

/** Sắp đến hạn trong `withinDays` ngày (mặc định 1 ngày = nhắc trước 24 giờ). */
export function isDueSoon(task, withinDays = 1, today = todayIso()) {
  if (!task?.dueDate || CLOSED_STATUSES.includes(task.status)) return false;
  const d = daysBetween(today, task.dueDate);
  return d !== null && d >= 0 && d <= withinDays;
}

/** Mã hiển thị #TK-001 từ số thứ tự. */
export function taskCode(seq) {
  const n = Number(seq);
  return Number.isFinite(n) && n > 0 ? `#TK-${String(n).padStart(3, '0')}` : '#TK-…';
}

/** Tiến độ tính theo checklist nếu có, ngược lại dùng progress nhập tay. */
export function computeProgress(task) {
  const list = task?.checklist || [];
  if (list.length) return Math.round((list.filter((c) => c.done).length / list.length) * 100);
  const p = Number(task?.progress);
  return Number.isFinite(p) ? Math.min(100, Math.max(0, p)) : 0;
}

/**
 * Kiểm tra chuyển trạng thái. Trả về chuỗi lỗi hoặc null.
 * - Hoàn thành cần minh chứng nếu Workspace bật "Yêu cầu minh chứng khi báo hoàn thành".
 * - "Chuẩn bị có điều kiện" chỉ được dùng khi Workspace cho phép.
 */
export function transitionError(task, nextStatus, settings = {}) {
  if (!TASK_STATUSES.includes(nextStatus)) return 'Trạng thái không hợp lệ.';
  if (nextStatus === 'Hoàn thành' && settings.requireEvidenceOnComplete && !(task?.evidence || []).length) {
    return 'Cần đính kèm ít nhất một minh chứng trước khi báo hoàn thành.';
  }
  if (nextStatus === 'Chuẩn bị có điều kiện' && settings.allowConditionalPrep === false) {
    return 'Workspace chưa cho phép chuẩn bị khi đang chờ phê duyệt.';
  }
  return null;
}

/**
 * Lọc công việc.
 * @param {object[]} tasks
 * @param {{status?:string, unitId?:string, assigneeUid?:string, search?:string, priority?:string, type?:string}} f
 */
export function filterTasks(tasks, f = {}, today = todayIso()) {
  const q = (f.search || '').trim().toLowerCase();
  return tasks.filter((t) => {
    if (f.status && f.status !== 'Tất cả' && effectiveStatus(t, today) !== f.status) return false;
    if (f.unitId && t.unitId !== f.unitId) return false;
    if (f.assigneeUid && t.assigneeUid !== f.assigneeUid) return false;
    if (f.priority && t.priority !== f.priority) return false;
    if (f.type && t.type !== f.type) return false;
    if (q) {
      const hay = `${t.title} ${t.description || ''} ${t.assigneeName || ''} ${t.unitName || ''} ${taskCode(t.seq)}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

const PRIORITY_RANK = Object.fromEntries(PRIORITIES.map((p, i) => [p, i]));

/** Sắp xếp: chưa đóng trước; Deadline gần trước (không có Deadline xuống cuối); ưu tiên cao trước. */
export function sortTasks(tasks) {
  return [...tasks].sort((a, b) => {
    const ca = CLOSED_STATUSES.includes(a.status) ? 1 : 0;
    const cb = CLOSED_STATUSES.includes(b.status) ? 1 : 0;
    if (ca !== cb) return ca - cb;
    const da = a.dueDate || '9999-12-31';
    const db = b.dueDate || '9999-12-31';
    if (da !== db) return da < db ? -1 : 1;
    const pa = PRIORITY_RANK[a.priority] ?? 9;
    const pb = PRIORITY_RANK[b.priority] ?? 9;
    if (pa !== pb) return pa - pb;
    return (a.seq || 0) - (b.seq || 0);
  });
}

/** Nhóm theo trạng thái lưu trữ cho Board (Kanban). */
export function groupByStatus(tasks) {
  const out = Object.fromEntries(TASK_STATUSES.map((s) => [s, []]));
  for (const t of tasks) (out[t.status] ||= []).push(t);
  return out;
}

/** Công việc cần chú ý: quá hạn hoặc sắp hạn hoặc chờ phê duyệt. */
export function needsAttention(tasks, today = todayIso()) {
  return sortTasks(tasks.filter((t) => isOverdue(t, today) || isDueSoon(t, 3, today) || t.status === 'Chờ phê duyệt'));
}

/**
 * Tiến độ theo bộ phận = trung bình tiến độ các công việc chưa hủy.
 * @returns {{unitId:string, count:number, done:number, percent:number}[]}
 */
export function progressByUnit(tasks, units) {
  return units.map((u) => {
    const list = tasks.filter((t) => t.unitId === u.id && t.status !== 'Tạm hoãn/Hủy');
    const percent = list.length ? Math.round(list.reduce((s, t) => s + computeProgress(t), 0) / list.length) : 0;
    return { unitId: u.id, name: u.name, count: list.length, done: list.filter((t) => t.status === 'Hoàn thành').length, percent };
  });
}

/** Trường được phép đổi bởi người được giao (khớp hasOnly trong firestore.rules). */
export const PROGRESS_FIELDS = Object.freeze(['status', 'progress', 'checklist', 'evidence']);

/** Tính các trường thay đổi giữa hai bản ghi để chỉ ghi phần cần thiết. */
export function diffFields(before, after, keys) {
  const changed = {};
  for (const k of keys) {
    if (JSON.stringify(before?.[k] ?? null) !== JSON.stringify(after?.[k] ?? null)) changed[k] = after[k] ?? null;
  }
  return changed;
}
