// Gộp các mốc thời gian vào lịch: Deadline công việc, ngày tổ chức chương trình, hạn đăng ký thông báo, hạn duyệt.
import { isIsoDate } from './dates.js';
import { CLOSED_STATUSES } from './constants.js';

/**
 * @returns {{date:string, kind:'task'|'event'|'notice', title:string, refId:string}[]}
 */
export function calendarItems({ tasks = [], events = [], notices = [] }, filters = { task: true, event: true, notice: true }) {
  const out = [];
  if (filters.task) {
    for (const t of tasks)
      if (isIsoDate(t.dueDate) && !CLOSED_STATUSES.includes(t.status)) out.push({ date: t.dueDate, kind: 'task', title: `Hạn: ${t.title}`, refId: t.id });
  }
  if (filters.event) {
    for (const e of events) if (isIsoDate(e.date)) out.push({ date: e.date, kind: 'event', title: e.title, refId: e.id });
  }
  if (filters.notice) {
    for (const n of notices)
      if (isIsoDate(n.deadline) && n.status !== 'Đã hoàn tất') out.push({ date: n.deadline, kind: 'notice', title: `Hạn ĐK: ${n.title}`, refId: n.id });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.title.localeCompare(b.title, 'vi')));
}

export function itemsByDate(items) {
  const map = new Map();
  for (const it of items) {
    if (!map.has(it.date)) map.set(it.date, []);
    map.get(it.date).push(it);
  }
  return map;
}

export function upcoming(items, fromIso, limit = 6) {
  return items.filter((i) => i.date >= fromIso).slice(0, limit);
}
