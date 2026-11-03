// Số liệu cho biểu đồ (thuần, không phụ thuộc DOM) – Tổng quan, Báo cáo.
import { CLOSED_STATUSES } from './constants.js';
import { isOverdue } from './tasks.js';
import { addDays, fmtDate, toDate, toIso, todayIso } from './dates.js';

/** Màu trạng thái cố định (đã kiểm tra tách biệt cho người mù màu, xem docs/ARCHITECTURE.md §Biểu đồ). */
export const STATUS_COLORS = Object.freeze({
  done: '#0ca30c',
  doing: '#2a78d6',
  todo: '#a3a7b0',
  waiting: '#eda100',
  overdue: '#d03b3b',
});

/** Làm tròn phần trăm theo phần dư lớn nhất để tổng luôn đúng 100. */
export function sharePercents(counts) {
  const total = counts.reduce((s, c) => s + c, 0);
  if (!total) return counts.map(() => 0);
  const raw = counts.map((c) => (c / total) * 100);
  const out = raw.map(Math.floor);
  let left = 100 - out.reduce((s, v) => s + v, 0);
  const order = raw.map((v, i) => [v - Math.floor(v), i]).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) {
    if (left <= 0) break;
    if (counts[i] > 0) {
      out[i] += 1;
      left -= 1;
    }
  }
  return out;
}

/**
 * Chia công việc (trừ việc đã hủy) thành 5 nhóm trạng thái loại trừ nhau.
 * "Quá hạn" được suy ra và ưu tiên hơn trạng thái lưu trong DB.
 */
export function statusSegments(tasks, today = todayIso()) {
  const active = tasks.filter((t) => t.status !== 'Tạm hoãn/Hủy');
  const groupOf = (t) => {
    if (t.status === 'Hoàn thành') return 'done';
    if (isOverdue(t, today)) return 'overdue';
    if (['Chờ phê duyệt', 'Chờ nghiệm thu'].includes(t.status)) return 'waiting';
    if (['Nháp', 'Chưa bắt đầu'].includes(t.status)) return 'todo';
    return 'doing';
  };
  const defs = [
    ['done', 'Hoàn thành'],
    ['doing', 'Đang thực hiện'],
    ['todo', 'Chưa bắt đầu'],
    ['waiting', 'Chờ duyệt / nghiệm thu'],
    ['overdue', 'Quá hạn'],
  ];
  const counts = defs.map(([k]) => active.filter((t) => groupOf(t) === k).length);
  const pcts = sharePercents(counts);
  return {
    total: active.length,
    parts: defs.map(([key, label], i) => ({ key, label, count: counts[i], percent: pcts[i], color: STATUS_COLORS[key] })),
  };
}

/**
 * Công việc đang mở theo hạn chót: quá hạn, từng khoảng 7 ngày kể từ hôm nay, sau đó.
 * @returns {{buckets:{key:string,label:string,range:string,count:number}[], noDue:number}}
 */
export function dueBuckets(tasks, today = todayIso(), weeks = 6) {
  const open = tasks.filter((t) => !CLOSED_STATUSES.includes(t.status));
  const dated = open.filter((t) => t.dueDate);
  const buckets = [{ key: 'overdue', label: 'Quá hạn', range: `Trước ${fmtDate(today)}`, count: dated.filter((t) => t.dueDate < today).length }];
  for (let w = 0; w < weeks; w++) {
    const from = addDays(today, w * 7);
    const to = addDays(today, w * 7 + 6);
    buckets.push({
      key: `w${w}`,
      label: w === 0 ? '7 ngày tới' : from.slice(8, 10) + '/' + from.slice(5, 7),
      range: `${fmtDate(from)} – ${fmtDate(to)}`,
      count: dated.filter((t) => t.dueDate >= from && t.dueDate <= to).length,
    });
  }
  const after = addDays(today, weeks * 7);
  buckets.push({ key: 'later', label: 'Sau đó', range: `Từ ${fmtDate(after)}`, count: dated.filter((t) => t.dueDate >= after).length });
  return { buckets, noDue: open.length - dated.length };
}

/**
 * Nhịp công việc theo tuần (tuần cuối kết thúc hôm nay): số việc tạo mới và số việc hoàn thành.
 * createdAt là Timestamp; completedOn là 'YYYY-MM-DD'.
 */
export function weeklyFlow(tasks, today = todayIso(), weeks = 8) {
  const rows = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const to = addDays(today, -7 * i);
    const from = addDays(to, -6);
    rows.push({ from, to, label: to.slice(8, 10) + '/' + to.slice(5, 7), range: `${fmtDate(from)} – ${fmtDate(to)}`, created: 0, completed: 0 });
  }
  const find = (iso) => rows.find((r) => iso >= r.from && iso <= r.to);
  for (const t of tasks) {
    const c = toDate(t.createdAt);
    const r1 = c && find(toIso(c));
    if (r1) r1.created += 1;
    const r2 = t.status === 'Hoàn thành' && t.completedOn && find(t.completedOn);
    if (r2) r2.completed += 1;
  }
  return rows;
}

/** Thang trục tung "tròn" cho số đếm / số tiền: trả về max và các vạch chia (bắt đầu từ 0). */
export function niceScale(max, ticks = 4) {
  if (!(max > 0)) return { max: ticks, ticks: Array.from({ length: ticks + 1 }, (_, i) => i) };
  const rough = max / ticks;
  const mag = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= rough && (mag >= 1 ? Number.isInteger(s) : true)) ?? 10 * mag;
  const step2 = Math.max(step, max < ticks ? 1 : step);
  const top = Math.ceil(max / step2) * step2;
  const out = [];
  for (let v = 0; v <= top + 1e-9; v += step2) out.push(Math.round(v * 1e6) / 1e6);
  return { max: top, ticks: out };
}

/** Rút gọn số lớn cho trục / nhãn: 1.500.000 → "1,5 tr", 12.000 → "12 N". */
export function compactVnd(n) {
  const a = Math.abs(n);
  const f = (v) => (Math.round(v * 10) / 10).toLocaleString('vi-VN');
  if (a >= 1e9) return `${f(n / 1e9)} tỷ`;
  if (a >= 1e6) return `${f(n / 1e6)} tr`;
  if (a >= 1e3) return `${f(n / 1e3)} N`;
  return String(Math.round(n));
}
