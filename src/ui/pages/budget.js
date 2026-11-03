import { html, pill, run, confirmBox } from '../kit.js';
import { header, gate, stat } from './common.js';
import { S, me, wsId, actor } from '../ctx.js';
import { tracked } from '../../state/store.js';
import { can } from '../../domain/permissions.js';
import { BUDGET_SOURCES, BUDGET_KINDS } from '../../domain/constants.js';
import { summarizeBudget, formatVnd, budgetByEvent } from '../../domain/budget.js';
import { fmtDate, todayIso } from '../../domain/dates.js';
import { safeHref } from '../../lib/html.js';
import { openForm } from '../formModal.js';
import * as repo from '../../services/repo.js';

function fields() {
  return [
    { name: 'kind', label: 'Loại khoản', type: 'select', options: Object.entries(BUDGET_KINDS).map(([v, l]) => ({ v, l })) },
    { name: 'source', label: 'Nguồn kinh phí', type: 'select', options: BUDGET_SOURCES },
    { name: 'amount', label: 'Số tiền (VNĐ)', inputmode: 'numeric', placeholder: '1.500.000…', required: true },
    { name: 'date', label: 'Ngày ghi nhận', type: 'date', required: true },
    {
      name: 'eventId',
      label: 'Chương trình liên quan',
      type: 'select',
      options: S().events.map((e) => ({ v: e.id, l: e.title })),
      empty: '— Không —',
      full: true,
    },
    { name: 'note', label: 'Nội dung khoản', required: true, full: true, max: 300 },
    { name: 'evidenceUrl', label: 'Link chứng từ (https)', type: 'url', full: true, max: 2000, hint: 'Link hóa đơn / phiếu chi trên Google Drive…' },
  ];
}

export const budgetPage = {
  render() {
    const s = S();
    const g = gate('budget', 'events');
    const head = header(
      'Quản lý kinh phí',
      'Theo dõi nguồn quỹ, kinh phí hỗ trợ, dự toán và quyết toán theo chương trình.',
      can.proposeBudget(me()) ? html`<button class="btn primary" id="newEntry">＋ Ghi nhận khoản thu / chi</button>` : '',
    );
    if (g) return html`${head}${g}`;
    const sum = summarizeBudget(s.budget);
    const byEv = budgetByEvent(s.budget, s.events);
    const max = Math.max(1, ...sum.bySource.map((x) => x.income));
    return html`${head}
    <div class="grid stats">
      ${stat('Tổng thu (đã duyệt)', formatVnd(sum.income), '＋', '#e9f8f5', '#159582', 'Quỹ ĐK/LC, Khoa, Trường')}
      ${stat('Đã chi (đã duyệt)', formatVnd(sum.expense), '↗', '#fff5e5', '#bf811c', 'Các chương trình')}
      ${stat('Số dư', formatVnd(sum.balance), '◇', '#edf2ff', '#4568ce', 'Thu − chi đã duyệt')}
      ${stat('Dự kiến còn', formatVnd(sum.projected), '≈', '#f3efff', '#8062c7', `Sau ${formatVnd(sum.pendingExpense)} chi đang chờ duyệt`)}
    </div>
    <div class="grid two"><section class="panel"><div class="panelhead"><h2 style="font-size:14.5px;margin:0">Cơ cấu nguồn kinh phí</h2></div><div class="panelbody">
      ${sum.bySource.map((x) => html`<div style="margin-bottom:16px"><div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px"><span>${x.source}</span><b>${formatVnd(x.balance)}</b></div><div class="bar"><i style="width:${Math.round((x.income / max) * 100)}%;background:#15a18f"></i></div><span class="muted" style="font-size:12px">Thu ${formatVnd(x.income)} · Chi ${formatVnd(x.expense)}</span></div>`)}</div></section>
    <section class="panel"><div class="panelhead"><h2 style="font-size:14.5px;margin:0">Chi theo chương trình</h2></div><div class="panelbody">
      ${byEv.length ? byEv.map((r) => html`<div class="feeditem"><div class="feedicon" aria-hidden="true">◇</div><div><strong>${r.title}</strong><p>Chi ${formatVnd(r.expense)} · Thu ${formatVnd(r.income)}</p></div></div>`) : html`<p class="muted">Chưa có khoản nào gắn với chương trình.</p>`}</div></section></div>
    <section class="panel sectiongap"><div class="panelhead"><h2 style="font-size:14.5px;margin:0">Sổ thu chi</h2><span class="tag">${s.budget.length} khoản</span></div>
    ${
      s.budget.length
        ? html`<div class="tablewrap"><table class="table"><caption class="sr-only">Sổ thu chi</caption><thead><tr><th scope="col">Ngày</th><th scope="col">Nội dung</th><th scope="col">Nguồn</th><th scope="col">Số tiền</th><th scope="col">Trạng thái</th><th scope="col">Thao tác</th></tr></thead><tbody>
      ${s.budget.map(
        (
          e,
        ) => html`<tr><td>${fmtDate(e.date)}</td><td><b>${e.note}</b>${e.evidenceUrl ? html`<span class="sub"><a href="${safeHref(e.evidenceUrl)}" target="_blank" rel="noopener noreferrer">Chứng từ</a></span>` : ''}</td><td>${e.source}</td>
        <td style="color:${e.kind === 'thu' ? 'var(--green)' : 'var(--ink)'};font-weight:650">${e.kind === 'thu' ? '+' : '−'}${formatVnd(e.amount)}</td><td>${pill(e.status)}</td>
        <td>${can.decideBudget(me()) && e.status === 'Đề xuất' ? html`<button class="textlink" data-ok="${e.id}">Duyệt</button> · <button class="textlink danger" data-no="${e.id}">Từ chối</button>` : ''}
          ${e.status === 'Đề xuất' && (me().role === 'owner' || e.createdBy === s.user.uid) && can.proposeBudget(me()) ? html` <button class="textlink" data-edit="${e.id}">Sửa</button> <button class="textlink danger" data-del="${e.id}">Xóa</button>` : ''}
          ${me().role === 'owner' && e.status !== 'Đề xuất' ? html`<button class="textlink danger" data-del="${e.id}">Xóa</button>` : ''}</td></tr>`,
      )}</tbody></table></div>`
        : html`<div class="empty"><b>Chưa có khoản thu chi nào</b>Ghi nhận khoản thu đầu tiên (ví dụ quỹ ĐK/LC đầu năm) để theo dõi số dư.</div>`
    }</section>
    <div class="notice sectiongap">Chỉ khoản <b>đã duyệt</b> được tính vào số dư. Quy chế chi, hạn mức duyệt và quy trình tạm ứng/quyết toán cần khách hàng xác nhận; hệ thống hiện ghi nhận đề xuất → duyệt/từ chối.</div>`;
  },
  bind(root) {
    const get = (id) => S().budget.find((e) => e.id === id);
    root.querySelector('#newEntry')?.addEventListener('click', () =>
      openForm({
        title: 'Ghi nhận khoản thu / chi',
        fields: fields(),
        values: { kind: 'chi', source: BUDGET_SOURCES[0], date: todayIso() },
        submitLabel: 'Gửi đề xuất',
        ok: 'Đã ghi nhận khoản (chờ duyệt).',
        onSubmit: async (d) => {
          await tracked(repo.proposeBudget(wsId(), actor(), d));
        },
      }),
    );
    root.querySelectorAll('[data-edit]').forEach((b) =>
      b.addEventListener('click', () => {
        const e = get(b.dataset.edit);
        openForm({
          title: 'Sửa khoản',
          fields: fields(),
          values: { ...e, amount: e.amount },
          ok: 'Đã cập nhật.',
          onSubmit: async (d) => {
            await tracked(repo.proposeBudget(wsId(), actor(), d, e.id));
          },
        });
      }),
    );
    root
      .querySelectorAll('[data-ok]')
      .forEach((b) =>
        b.addEventListener('click', () => run(b, () => tracked(repo.decideBudget(wsId(), actor(), b.dataset.ok, 'Đã duyệt')), { ok: 'Đã duyệt khoản.' })),
      );
    root
      .querySelectorAll('[data-no]')
      .forEach((b) =>
        b.addEventListener('click', () => run(b, () => tracked(repo.decideBudget(wsId(), actor(), b.dataset.no, 'Từ chối')), { ok: 'Đã từ chối khoản.' })),
      );
    root.querySelectorAll('[data-del]').forEach((b) =>
      b.addEventListener('click', async () => {
        const e = get(b.dataset.del);
        if (await confirmBox({ title: 'Xóa khoản', message: `Xóa khoản "${e.note}"?`, confirmLabel: 'Xóa', danger: true }))
          await run(b, () => tracked(repo.deleteBudget(wsId(), e.id)), { ok: 'Đã xóa khoản.' });
      }),
    );
  },
};
