// Kiểm tra và chuẩn hóa dữ liệu trước khi ghi Firestore.
// Security Rules kiểm tra lại các ràng buộc quan trọng ở phía server.
import {
  TASK_STATUSES,
  PRIORITIES,
  TASK_TYPES,
  EVENT_TYPES,
  EVENT_STATUSES,
  NOTICE_STATUSES,
  BUDGET_SOURCES,
  BUDGET_KINDS,
  DOC_GROUPS,
  ROLE_KEYS,
  WORKSPACE_TYPES,
  LIMITS,
} from './constants.js';
import { isIsoDate } from './dates.js';

export class ValidationError extends Error {
  /** @param {Record<string,string>} fields */
  constructor(fields) {
    super(Object.values(fields).join(' '));
    this.name = 'ValidationError';
    this.fields = fields;
  }
}

const str = (v) => (typeof v === 'string' ? v.trim() : '');
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function checkText(errors, key, value, { required = false, max = LIMITS.text, label }) {
  if (required && !value) errors[key] = `${label} là bắt buộc.`;
  else if (value.length > max) errors[key] = `${label} tối đa ${max} ký tự.`;
}
function checkEnum(errors, key, value, list, label, { required = true } = {}) {
  if (!value && !required) return;
  if (!list.includes(value)) errors[key] = `${label} không hợp lệ.`;
}
function checkDate(errors, key, value, label, { required = false } = {}) {
  if (!value) {
    if (required) errors[key] = `${label} là bắt buộc.`;
    return;
  }
  if (!isIsoDate(value)) errors[key] = `${label} không đúng định dạng ngày.`;
}
function finish(errors, value) {
  if (Object.keys(errors).length) throw new ValidationError(errors);
  return value;
}

export function normalizeEmail(e) {
  return str(e).toLowerCase();
}
export function isEmail(e) {
  return EMAIL.test(normalizeEmail(e)) && normalizeEmail(e).length <= 254;
}

/** Link tài liệu: chỉ chấp nhận https để tránh javascript:/data: URL. */
export function isSafeUrl(u) {
  try {
    const url = new URL(str(u));
    return url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Chuẩn hóa dữ liệu công việc từ form.
 * @param {object} input
 * @param {{unitIds:string[]}} ctx danh sách unit hợp lệ trong Workspace
 */
export function validateTask(input, ctx) {
  const e = {};
  const v = {
    title: str(input.title),
    description: str(input.description),
    unitId: str(input.unitId),
    type: str(input.type),
    status: str(input.status) || 'Chưa bắt đầu',
    priority: str(input.priority) || 'Trung bình',
    assigneeUid: str(input.assigneeUid) || null,
    startDate: str(input.startDate) || null,
    dueDate: str(input.dueDate) || null,
    eventId: str(input.eventId) || null,
    progress: Number.isFinite(Number(input.progress)) ? Math.round(Number(input.progress)) : 0,
    collaboratorUids: Array.isArray(input.collaboratorUids) ? [...new Set(input.collaboratorUids.filter((x) => typeof x === 'string' && x))] : [],
  };
  checkText(e, 'title', v.title, { required: true, max: LIMITS.title, label: 'Tên công việc' });
  checkText(e, 'description', v.description, { label: 'Mô tả' });
  if (!v.unitId) e.unitId = 'Vui lòng chọn Ban / bộ phận.';
  else if (ctx?.unitIds && !ctx.unitIds.includes(v.unitId)) e.unitId = 'Ban / bộ phận không tồn tại.';
  checkEnum(e, 'type', v.type, TASK_TYPES, 'Loại công việc');
  checkEnum(e, 'status', v.status, TASK_STATUSES, 'Trạng thái');
  checkEnum(e, 'priority', v.priority, PRIORITIES, 'Mức ưu tiên');
  checkDate(e, 'startDate', v.startDate, 'Ngày bắt đầu');
  checkDate(e, 'dueDate', v.dueDate, 'Deadline');
  if (v.startDate && v.dueDate && isIsoDate(v.startDate) && isIsoDate(v.dueDate) && v.startDate > v.dueDate) {
    e.dueDate = 'Deadline phải sau hoặc bằng ngày bắt đầu.';
  }
  if (v.progress < 0 || v.progress > 100) e.progress = 'Tiến độ phải từ 0 đến 100%.';
  if (v.collaboratorUids.length > LIMITS.collaborators) e.collaboratorUids = `Tối đa ${LIMITS.collaborators} người phối hợp.`;
  return finish(e, v);
}

export function validateChecklist(items) {
  if (!Array.isArray(items)) throw new ValidationError({ checklist: 'Checklist không hợp lệ.' });
  if (items.length > LIMITS.checklist) throw new ValidationError({ checklist: `Checklist tối đa ${LIMITS.checklist} mục.` });
  return items.map((it) => {
    const text = str(it?.text);
    if (!text) throw new ValidationError({ checklist: 'Mục checklist không được để trống.' });
    if (text.length > LIMITS.shortText) throw new ValidationError({ checklist: `Mục checklist tối đa ${LIMITS.shortText} ký tự.` });
    return { id: str(it.id) || cryptoId(), text, done: it.done === true };
  });
}

export function validateEvidence(items) {
  if (!Array.isArray(items) || items.length > LIMITS.evidence) throw new ValidationError({ evidence: `Tối đa ${LIMITS.evidence} minh chứng.` });
  return items.map((it) => {
    const label = str(it?.label);
    const url = str(it?.url);
    if (!label) throw new ValidationError({ evidence: 'Tên minh chứng là bắt buộc.' });
    if (!isSafeUrl(url)) throw new ValidationError({ evidence: 'Link minh chứng phải bắt đầu bằng https://' });
    return { id: str(it.id) || cryptoId(), label: label.slice(0, LIMITS.shortText), url };
  });
}

export function validateEvent(input, ctx) {
  const e = {};
  const v = {
    title: str(input.title),
    description: str(input.description),
    type: str(input.type),
    status: str(input.status) || 'Mới tiếp nhận',
    unitId: str(input.unitId),
    date: str(input.date) || null,
    location: str(input.location),
  };
  checkText(e, 'title', v.title, { required: true, max: LIMITS.title, label: 'Tên chương trình' });
  checkText(e, 'description', v.description, { label: 'Mô tả' });
  checkText(e, 'location', v.location, { max: LIMITS.shortText, label: 'Địa điểm' });
  checkEnum(e, 'type', v.type, EVENT_TYPES, 'Loại chương trình');
  checkEnum(e, 'status', v.status, EVENT_STATUSES, 'Trạng thái');
  if (!v.unitId) e.unitId = 'Vui lòng chọn đơn vị phụ trách.';
  else if (ctx?.unitIds && !ctx.unitIds.includes(v.unitId)) e.unitId = 'Đơn vị không tồn tại.';
  checkDate(e, 'date', v.date, 'Ngày tổ chức');
  return finish(e, v);
}

export function validateNotice(input) {
  const e = {};
  const v = {
    title: str(input.title),
    category: str(input.category),
    summary: str(input.summary),
    deadline: str(input.deadline) || null,
    source: str(input.source),
    contact: str(input.contact),
    status: str(input.status) || 'Mới tiếp nhận',
  };
  checkText(e, 'title', v.title, { required: true, max: LIMITS.title, label: 'Tên thông báo' });
  checkText(e, 'category', v.category, { max: 100, label: 'Lĩnh vực' });
  checkText(e, 'summary', v.summary, { label: 'Nội dung' });
  checkText(e, 'source', v.source, { max: LIMITS.shortText, label: 'Nguồn' });
  checkText(e, 'contact', v.contact, { max: LIMITS.shortText, label: 'Đầu mối' });
  checkDate(e, 'deadline', v.deadline, 'Hạn đăng ký');
  checkEnum(e, 'status', v.status, NOTICE_STATUSES, 'Trạng thái');
  return finish(e, v);
}

/** Số tiền VND: số nguyên dương, chấp nhận chuỗi "1.500.000". */
export function parseVnd(input) {
  if (typeof input === 'number') return Number.isSafeInteger(input) ? input : NaN;
  const s = str(input).replace(/[.\s,đ₫]/gi, '');
  if (!/^\d+$/.test(s)) return NaN;
  return Number(s);
}

export function validateBudgetEntry(input) {
  const e = {};
  const v = {
    kind: str(input.kind),
    amount: parseVnd(input.amount),
    source: str(input.source),
    eventId: str(input.eventId) || null,
    note: str(input.note),
    date: str(input.date),
    evidenceUrl: str(input.evidenceUrl) || null,
  };
  if (!Object.keys(BUDGET_KINDS).includes(v.kind)) e.kind = 'Loại khoản không hợp lệ.';
  if (!Number.isSafeInteger(v.amount) || v.amount <= 0) e.amount = 'Số tiền phải là số nguyên dương.';
  else if (v.amount > LIMITS.amount) e.amount = 'Số tiền vượt giới hạn cho phép.';
  checkEnum(e, 'source', v.source, BUDGET_SOURCES, 'Nguồn kinh phí');
  checkText(e, 'note', v.note, { required: true, max: LIMITS.shortText, label: 'Nội dung khoản' });
  checkDate(e, 'date', v.date, 'Ngày ghi nhận', { required: true });
  if (v.evidenceUrl && !isSafeUrl(v.evidenceUrl)) e.evidenceUrl = 'Link chứng từ phải bắt đầu bằng https://';
  return finish(e, v);
}

export function validateDoc(input) {
  const e = {};
  const v = {
    title: str(input.title),
    group: str(input.group),
    url: str(input.url),
    appliesTo: str(input.appliesTo),
    academicYear: str(input.academicYear),
    status: input.status === 'Lưu trữ' ? 'Lưu trữ' : 'Đang sử dụng',
  };
  checkText(e, 'title', v.title, { required: true, max: LIMITS.title, label: 'Tên tài liệu' });
  checkEnum(e, 'group', v.group, DOC_GROUPS, 'Nhóm tài liệu');
  if (!isSafeUrl(v.url)) e.url = 'Link tài liệu phải bắt đầu bằng https:// (ví dụ link Google Drive).';
  checkText(e, 'appliesTo', v.appliesTo, { max: LIMITS.shortText, label: 'Phạm vi áp dụng' });
  if (v.academicYear && !/^\d{4}\s*[–-]\s*\d{4}$/.test(v.academicYear)) e.academicYear = 'Năm học dạng 2026 – 2027.';
  return finish(e, v);
}

export function validateUnit(input) {
  const e = {};
  const v = {
    name: str(input.name),
    description: str(input.description),
    managerLabel: str(input.managerLabel),
    icon: str(input.icon).slice(0, 4) || '▤',
  };
  checkText(e, 'name', v.name, { required: true, max: 100, label: 'Tên bộ phận' });
  checkText(e, 'description', v.description, { max: LIMITS.shortText, label: 'Mô tả' });
  checkText(e, 'managerLabel', v.managerLabel, { max: 100, label: 'Chức danh quản lý' });
  return finish(e, v);
}

export function validateInvite(input, ctx) {
  const e = {};
  const v = {
    email: normalizeEmail(input.email),
    role: str(input.role),
    unitIds: Array.isArray(input.unitIds) ? [...new Set(input.unitIds)] : [],
    displayName: str(input.displayName),
  };
  if (!isEmail(v.email)) e.email = 'Email không hợp lệ.';
  if (!ROLE_KEYS.includes(v.role) || v.role === 'owner') e.role = 'Vai trò không hợp lệ.';
  if (v.unitIds.length > LIMITS.unitsPerMember) e.unitIds = `Tối đa ${LIMITS.unitsPerMember} bộ phận.`;
  if (ctx?.unitIds && v.unitIds.some((u) => !ctx.unitIds.includes(u))) e.unitIds = 'Có bộ phận không tồn tại.';
  if (v.role === 'manager' && v.unitIds.length === 0) e.unitIds = 'Trưởng Ban cần được gán ít nhất một bộ phận.';
  checkText(e, 'displayName', v.displayName, { max: 100, label: 'Tên hiển thị' });
  return finish(e, v);
}

export function validateWorkspace(input) {
  const e = {};
  const v = {
    name: str(input.name),
    type: str(input.type) || WORKSPACE_TYPES[0],
    academicYear: str(input.academicYear),
    contactEmail: normalizeEmail(input.contactEmail),
  };
  checkText(e, 'name', v.name, { required: true, max: 100, label: 'Tên tổ chức' });
  checkEnum(e, 'type', v.type, WORKSPACE_TYPES, 'Loại tổ chức');
  if (v.academicYear && !/^\d{4}\s*[–-]\s*\d{4}$/.test(v.academicYear)) e.academicYear = 'Năm học dạng 2026 – 2027.';
  if (v.contactEmail && !isEmail(v.contactEmail)) e.contactEmail = 'Email đầu mối không hợp lệ.';
  return finish(e, v);
}

export function validateComment(text) {
  const t = str(text);
  if (!t) throw new ValidationError({ text: 'Nội dung bình luận trống.' });
  if (t.length > 2000) throw new ValidationError({ text: 'Bình luận tối đa 2000 ký tự.' });
  return t;
}

export function cryptoId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID().slice(0, 12);
  return Math.random().toString(36).slice(2, 14);
}
