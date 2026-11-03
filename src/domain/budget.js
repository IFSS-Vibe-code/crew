// Kinh phí: tổng hợp theo nguồn, theo chương trình. Chỉ khoản "Đã duyệt" được tính vào số dư.
import { BUDGET_SOURCES } from './constants.js';

export function formatVnd(n) {
  if (!Number.isFinite(n)) return '—';
  return `${Math.round(n).toLocaleString('vi-VN')} đ`;
}

/**
 * @param {{kind:'thu'|'chi', amount:number, source:string, status:string, eventId?:string}[]} entries
 */
export function summarizeBudget(entries) {
  const approved = entries.filter((e) => e.status === 'Đã duyệt');
  const sum = (arr) => arr.reduce((s, e) => s + (Number.isSafeInteger(e.amount) ? e.amount : 0), 0);
  const income = sum(approved.filter((e) => e.kind === 'thu'));
  const expense = sum(approved.filter((e) => e.kind === 'chi'));
  const pendingExpense = sum(entries.filter((e) => e.status === 'Đề xuất' && e.kind === 'chi'));
  const bySource = BUDGET_SOURCES.map((source) => {
    const inS = sum(approved.filter((e) => e.source === source && e.kind === 'thu'));
    const outS = sum(approved.filter((e) => e.source === source && e.kind === 'chi'));
    return { source, income: inS, expense: outS, balance: inS - outS };
  });
  return { income, expense, balance: income - expense, pendingExpense, projected: income - expense - pendingExpense, bySource };
}

export function budgetByEvent(entries, events) {
  return events
    .map((ev) => {
      const list = entries.filter((e) => e.eventId === ev.id && e.status === 'Đã duyệt');
      const expense = list.filter((e) => e.kind === 'chi').reduce((s, e) => s + e.amount, 0);
      const income = list.filter((e) => e.kind === 'thu').reduce((s, e) => s + e.amount, 0);
      return { eventId: ev.id, title: ev.title, income, expense };
    })
    .filter((r) => r.income || r.expense);
}
