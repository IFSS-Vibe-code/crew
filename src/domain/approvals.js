// Máy trạng thái duyệt kế hoạch (PHAN_TICH_YEU_CAU §5, mockup "Phê duyệt kế hoạch").
// Quy trình: BCH ĐK/LC lập → Chi ủy duyệt → (tùy chương trình) Đoàn trường / Hội SV duyệt → được tổ chức.
// Có thể trả hồ sơ để bổ sung và gửi lại; gửi lại sẽ tiếp tục từ bước đã trả về.
import { APPROVAL_STEP_DEFS, LIMITS } from './constants.js';
import { daysBetween, todayIso } from './dates.js';

export class ApprovalError extends Error {
  constructor(msg) {
    super(msg);
    this.name = 'ApprovalError';
  }
}

/** Tạo hồ sơ nháp. requireSchoolLevel: chương trình có cần Đoàn trường / Hội SV duyệt không (Cần xác nhận theo từng loại). */
export function newApproval({ title, unitId, eventId = null, note = '', requireSchoolLevel = true }) {
  const keys = requireSchoolLevel ? ['chiuy', 'truong'] : ['chiuy'];
  return {
    title,
    unitId,
    eventId,
    note,
    requireSchoolLevel: !!requireSchoolLevel,
    steps: keys.map((key) => ({ key, label: APPROVAL_STEP_DEFS[key], status: 'waiting', by: null, byName: null, at: null, comment: '' })),
    currentStep: 0,
    status: 'Nháp',
    submittedAt: null,
    history: [],
  };
}

function clone(a) {
  return structuredClone(a);
}
function pushHistory(a, entry) {
  a.history = [...(a.history || []), entry].slice(-LIMITS.history);
}
function requireComment(comment, action) {
  if (!comment || !String(comment).trim()) throw new ApprovalError(`Vui lòng ghi lý do khi ${action}.`);
}

/** Gửi duyệt (lần đầu hoặc gửi lại sau khi bổ sung). */
export function submit(a, actor, now = new Date()) {
  if (!['Nháp', 'Cần bổ sung'].includes(a.status)) throw new ApprovalError('Chỉ gửi được hồ sơ nháp hoặc hồ sơ cần bổ sung.');
  const n = clone(a);
  const step = n.steps[n.currentStep];
  if (!step) throw new ApprovalError('Hồ sơ không có bước duyệt.');
  step.status = 'pending';
  n.status = 'Chờ xử lý';
  n.submittedAt = todayIso(now);
  pushHistory(n, {
    action: a.status === 'Nháp' ? 'Gửi duyệt' : 'Gửi lại sau bổ sung',
    by: actor.uid,
    byName: actor.name,
    at: now.toISOString(),
    step: step.key,
    comment: '',
  });
  return n;
}

export function approve(a, actor, comment = '', now = new Date()) {
  if (a.status !== 'Chờ xử lý') throw new ApprovalError('Hồ sơ không ở trạng thái chờ xử lý.');
  const n = clone(a);
  const step = n.steps[n.currentStep];
  Object.assign(step, { status: 'approved', by: actor.uid, byName: actor.name, at: now.toISOString(), comment: String(comment || '').trim() });
  pushHistory(n, { action: `Duyệt: ${step.label}`, by: actor.uid, byName: actor.name, at: now.toISOString(), step: step.key, comment: step.comment });
  if (n.currentStep >= n.steps.length - 1) {
    n.status = 'Đã duyệt';
  } else {
    n.currentStep += 1;
    n.steps[n.currentStep].status = 'pending';
    // Thời gian chờ được tính lại cho cấp tiếp theo.
    n.submittedAt = todayIso(now);
  }
  return n;
}

export function returnForRevision(a, actor, comment, now = new Date()) {
  if (a.status !== 'Chờ xử lý') throw new ApprovalError('Hồ sơ không ở trạng thái chờ xử lý.');
  requireComment(comment, 'yêu cầu bổ sung');
  const n = clone(a);
  const step = n.steps[n.currentStep];
  Object.assign(step, { status: 'returned', by: actor.uid, byName: actor.name, at: now.toISOString(), comment: String(comment).trim() });
  n.status = 'Cần bổ sung';
  pushHistory(n, { action: `Yêu cầu bổ sung: ${step.label}`, by: actor.uid, byName: actor.name, at: now.toISOString(), step: step.key, comment: step.comment });
  return n;
}

export function reject(a, actor, comment, now = new Date()) {
  if (a.status !== 'Chờ xử lý') throw new ApprovalError('Hồ sơ không ở trạng thái chờ xử lý.');
  requireComment(comment, 'từ chối');
  const n = clone(a);
  const step = n.steps[n.currentStep];
  Object.assign(step, { status: 'rejected', by: actor.uid, byName: actor.name, at: now.toISOString(), comment: String(comment).trim() });
  n.status = 'Từ chối';
  pushHistory(n, { action: `Từ chối: ${step.label}`, by: actor.uid, byName: actor.name, at: now.toISOString(), step: step.key, comment: step.comment });
  return n;
}

/** Nhãn "Cấp xử lý" như cột trong mockup. */
export function stageLabel(a) {
  switch (a.status) {
    case 'Nháp':
      return 'Đang soạn';
    case 'Đã duyệt':
      return 'Đã hoàn tất';
    case 'Cần bổ sung':
      return 'Trả về đơn vị lập kế hoạch';
    case 'Từ chối':
      return `Bị từ chối tại: ${a.steps[a.currentStep]?.label || ''}`;
    default:
      return `Chờ ${a.steps[a.currentStep]?.label?.replace(/ (xem xét và )?duyệt$/, '') || ''} duyệt`;
  }
}

/** Số ngày hồ sơ đang chờ ở cấp hiện tại. */
export function waitingDays(a, today = todayIso()) {
  if (a.status !== 'Chờ xử lý' || !a.submittedAt) return 0;
  return Math.max(0, daysBetween(a.submittedAt, today) ?? 0);
}

export function isWaitingTooLong(a, warnDays = 14, today = todayIso()) {
  return a.status === 'Chờ xử lý' && waitingDays(a, today) >= warnDays;
}

/** Các trường quy trình duyệt — người duyệt chỉ được đổi các trường này (khớp firestore.rules). */
export const DECISION_FIELDS = Object.freeze(['steps', 'currentStep', 'status', 'submittedAt', 'history']);
