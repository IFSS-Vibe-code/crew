// Báo cáo tính từ dữ liệu thật (mockup: trang "Báo cáo"; PHAN_TICH_YEU_CAU §9).
import { CLOSED_STATUSES } from './constants.js';
import { isOverdue } from './tasks.js';
import { daysBetween, todayIso } from './dates.js';

const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

export function taskStatusBreakdown(tasks, today = todayIso()) {
  const active = tasks.filter((t) => t.status !== 'Tạm hoãn/Hủy');
  const done = active.filter((t) => t.status === 'Hoàn thành').length;
  const overdue = active.filter((t) => isOverdue(t, today)).length;
  const waiting = active.filter((t) => ['Chờ phê duyệt', 'Chờ nghiệm thu'].includes(t.status) && !isOverdue(t, today)).length;
  const doing = active.length - done - overdue - waiting;
  return {
    total: active.length,
    rows: [
      { label: 'Hoàn thành', count: done, percent: pct(done, active.length), color: 'var(--green)' },
      { label: 'Đang thực hiện / chưa bắt đầu', count: doing, percent: pct(doing, active.length), color: 'var(--blue)' },
      { label: 'Chờ phê duyệt / nghiệm thu', count: waiting, percent: pct(waiting, active.length), color: 'var(--amber)' },
      { label: 'Quá hạn', count: overdue, percent: pct(overdue, active.length), color: 'var(--red)' },
    ],
  };
}

/** Tỷ lệ công việc đã hoàn thành đúng hạn (completedOn <= dueDate) trên số việc hoàn thành có Deadline. */
export function onTimeRate(tasks) {
  const done = tasks.filter((t) => t.status === 'Hoàn thành' && t.dueDate && t.completedOn);
  return { count: done.length, percent: pct(done.filter((t) => t.completedOn <= t.dueDate).length, done.length) };
}

/** Thời gian duyệt trung bình (ngày) từ lần gửi đầu đến khi "Đã duyệt". */
export function avgApprovalDays(approvals) {
  const durations = approvals
    .filter((a) => a.status === 'Đã duyệt')
    .map((a) => {
      const first = (a.history || []).find((h) => h.action === 'Gửi duyệt');
      const last = [...(a.history || [])].reverse().find((h) => h.action.startsWith('Duyệt'));
      if (!first || !last) return null;
      return daysBetween(new Date(first.at), new Date(last.at));
    })
    .filter((d) => d !== null && d >= 0);
  if (!durations.length) return null;
  return Math.round((durations.reduce((s, d) => s + d, 0) / durations.length) * 10) / 10;
}

export function workloadByAssignee(tasks, members) {
  return members
    .map((m) => {
      const mine = tasks.filter((t) => t.assigneeUid === m.uid && !CLOSED_STATUSES.includes(t.status));
      return { uid: m.uid, name: m.displayName || m.email, open: mine.length, overdue: mine.filter((t) => isOverdue(t)).length };
    })
    .filter((r) => r.open > 0)
    .sort((a, b) => b.open - a.open);
}

/** Xuất CSV (UTF-8 BOM để Excel đọc đúng tiếng Việt). Chống CSV injection bằng cách vô hiệu hóa ký tự đầu = + - @. */
export function toCsv(rows) {
  const esc = (v) => {
    let s = v === null || v === undefined ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + rows.map((r) => r.map(esc).join(',')).join('\r\n');
}
