import { html, pill, run, confirmBox, promptBox, toast, openModal } from '../kit.js';
import { ValidationError } from '../../domain/validation.js';
import { header, gate } from './common.js';
import { S, me, wsId, actor, unitName, myManageableUnits } from '../ctx.js';
import { tracked } from '../../state/store.js';
import { can } from '../../domain/permissions.js';
import { fmtDate } from '../../domain/dates.js';
import { newApproval, submit, approve, returnForRevision, reject, stageLabel, waitingDays, isWaitingTooLong } from '../../domain/approvals.js';
import { avgApprovalDays } from '../../domain/reports.js';
import { openForm } from '../formModal.js';
import * as repo from '../../services/repo.js';

const stepIcon = (st) => ({ approved: '✓', pending: '◷', returned: '↩', rejected: '✕' })[st] || '○';

export const approvalsPage = {
  render() {
    const s = S();
    const g = gate('approvals', 'units');
    const canSubmit = myManageableUnits().length > 0;
    const head = header(
      'Phê duyệt kế hoạch',
      'Theo dõi từng cấp duyệt, người xử lý, thời gian chờ và phản hồi.',
      canSubmit ? html`<button class="btn primary" id="newAppr">＋ Lập hồ sơ duyệt</button>` : '',
    );
    if (g) return html`${head}${g}`;
    const warn = s.workspace?.settings?.approvalWaitWarnDays ?? 14;
    const avg = avgApprovalDays(s.approvals);
    return html`${head}
    <div class="notice"><b>Quy tắc:</b> có thể tạo công việc chuẩn bị nội bộ trong lúc chờ duyệt với trạng thái "Chuẩn bị có điều kiện" (nếu Workspace cho phép); điều đó <b>không</b> có nghĩa là đã được phép tổ chức chính thức.</div>
    <section class="panel"><div class="panelhead"><div><h2 style="font-size:14.5px;margin:0">Hồ sơ đang theo dõi</h2><p>Người có quyền duyệt xử lý theo từng cấp; mọi quyết định được ghi lịch sử.</p></div><span class="tag">${s.approvals.length} hồ sơ</span></div>
    ${
      s.approvals.length
        ? html`<div class="tablewrap"><table class="table"><caption class="sr-only">Hồ sơ phê duyệt</caption><thead><tr><th scope="col">Chương trình</th><th scope="col">Đơn vị</th><th scope="col">Cấp xử lý</th><th scope="col">Ngày gửi</th><th scope="col">Chờ</th><th scope="col">Trạng thái</th><th scope="col">Thao tác</th></tr></thead><tbody>
      ${s.approvals.map((a) => {
        const canDecide = can.decideApproval(me()) && a.status === 'Chờ xử lý';
        const canEditIt = can.submitApproval(me(), a.unitId) && ['Nháp', 'Cần bổ sung'].includes(a.status);
        const wait = waitingDays(a);
        const last = (a.history || [])[(a.history || []).length - 1];
        return html`<tr><td><button class="tasktitle" data-detail="${a.id}">${a.title}</button>${a.note ? html`<span class="sub">${a.note}</span>` : ''}${last?.comment ? html`<span class="sub">Phản hồi: “${last.comment}”</span>` : ''}</td>
          <td>${unitName(a.unitId)}</td><td>${stageLabel(a)}</td><td>${fmtDate(a.submittedAt)}</td>
          <td>${a.status === 'Chờ xử lý' ? html`<span class="${isWaitingTooLong(a, warn) ? 'late' : ''}">${wait} ngày${isWaitingTooLong(a, warn) ? ' ⚠' : ''}</span>` : '—'}</td>
          <td>${pill(a.status)}</td>
          <td>${canDecide ? html`<button class="textlink" data-approve="${a.id}">Duyệt</button> · <button class="textlink" data-return="${a.id}">Yêu cầu sửa</button> · <button class="textlink danger" data-reject="${a.id}">Từ chối</button>` : ''}
            ${canEditIt ? html`<button class="textlink" data-submit="${a.id}">${a.status === 'Nháp' ? 'Gửi duyệt' : 'Gửi lại'}</button>` : ''}
            ${me().role === 'owner' || (a.status === 'Nháp' && can.submitApproval(me(), a.unitId)) ? html` <button class="textlink danger" data-del="${a.id}">Xóa</button>` : ''}</td></tr>`;
      })}</tbody></table></div>`
        : html`<div class="empty"><b>Chưa có hồ sơ nào</b>${canSubmit ? 'Bấm "Lập hồ sơ duyệt" để gửi kế hoạch chương trình lên Chi ủy.' : ''}</div>`
    }</section>
    <div class="grid two sectiongap"><section class="panel"><div class="panelhead"><h2 style="font-size:14.5px;margin:0">Các bước phê duyệt</h2></div><div class="panelbody">
      ${['BCH ĐK/LC lập và gửi kế hoạch', 'Chi ủy xem xét, góp ý và duyệt kế hoạch', 'Đoàn trường / Hội Sinh viên duyệt (nếu thuộc quy trình)', 'Xác nhận được phép tổ chức và triển khai'].map((t) => html`<div class="approvalstep"><i class="stepdot"></i>${t}</div>`)}</div></section>
    <section class="panel"><div class="panelhead"><h2 style="font-size:14.5px;margin:0">Thời gian xử lý</h2></div><div class="panelbody"><div style="font-size:27px;font-weight:750">${avg === null ? '—' : `${avg} ngày`}</div>
      <p class="muted" style="font-size:13px;line-height:1.5">Thời gian trung bình các hồ sơ đã duyệt (từ lần gửi đầu đến khi được duyệt). Khách hàng ghi nhận quy trình cấp Trường thường 2–4 tuần. Cảnh báo khi chờ từ ${warn} ngày.</p></div></section></div>`;
  },
  bind(root) {
    const get = (id) => S().approvals.find((a) => a.id === id);
    const apply = (a, next, asDecider, ok) => run(null, () => tracked(repo.commitApprovalTransition(wsId(), actor(), a, next, { asDecider })), { ok });
    root.querySelector('#newAppr')?.addEventListener('click', () => {
      const units = myManageableUnits().map((u) => ({ v: u.id, l: u.name }));
      openForm({
        title: 'Lập hồ sơ duyệt kế hoạch',
        submitLabel: 'Lưu hồ sơ',
        ok: 'Đã lưu hồ sơ (chưa gửi duyệt).',
        fields: [
          { name: 'title', label: 'Tên chương trình', required: true, full: true, max: 200 },
          { name: 'unitId', label: 'Đơn vị lập kế hoạch', type: 'select', options: units, required: true },
          { name: 'eventId', label: 'Chương trình liên quan', type: 'select', options: S().events.map((e) => ({ v: e.id, l: e.title })), empty: '— Không —' },
          { name: 'note', label: 'Nội dung đề nghị', type: 'textarea', full: true, max: 2000 },
          { name: 'requireSchoolLevel', label: 'Cần Đoàn trường / Hội Sinh viên duyệt sau Chi ủy', type: 'checkbox' },
        ],
        values: { requireSchoolLevel: true },
        onSubmit: async (d) => {
          if (!d.title.trim()) throw new ValidationError({ title: 'Tên chương trình là bắt buộc.' });
          if (!d.unitId) throw new ValidationError({ unitId: 'Vui lòng chọn đơn vị.' });
          await tracked(
            repo.createApproval(
              wsId(),
              actor(),
              newApproval({
                title: d.title.trim(),
                unitId: d.unitId,
                eventId: d.eventId || null,
                note: d.note.trim(),
                requireSchoolLevel: d.requireSchoolLevel,
              }),
            ),
          );
        },
      });
    });
    root.querySelectorAll('[data-submit]').forEach((b) =>
      b.addEventListener('click', () => {
        const a = get(b.dataset.submit);
        apply(a, submit(a, actor()), false, 'Đã gửi hồ sơ lên cấp duyệt.');
      }),
    );
    root.querySelectorAll('[data-approve]').forEach((b) =>
      b.addEventListener('click', async () => {
        const a = get(b.dataset.approve);
        const note = await promptBox({ title: `Duyệt: ${a.title}`, label: 'Góp ý (không bắt buộc)', required: false, confirmLabel: 'Duyệt' });
        if (note === null) return;
        apply(a, approve(a, actor(), note), true, 'Đã ghi nhận bước duyệt.');
      }),
    );
    root.querySelectorAll('[data-return]').forEach((b) =>
      b.addEventListener('click', async () => {
        const a = get(b.dataset.return);
        const note = await promptBox({ title: `Yêu cầu bổ sung: ${a.title}`, label: 'Nội dung cần sửa / bổ sung', confirmLabel: 'Trả hồ sơ' });
        if (note === null) return;
        apply(a, returnForRevision(a, actor(), note), true, 'Đã trả hồ sơ về đơn vị bổ sung.');
      }),
    );
    root.querySelectorAll('[data-reject]').forEach((b) =>
      b.addEventListener('click', async () => {
        const a = get(b.dataset.reject);
        const note = await promptBox({ title: `Từ chối: ${a.title}`, label: 'Lý do từ chối', confirmLabel: 'Từ chối' });
        if (note === null) return;
        apply(a, reject(a, actor(), note), true, 'Đã từ chối hồ sơ.');
      }),
    );
    root.querySelectorAll('[data-del]').forEach((b) =>
      b.addEventListener('click', async () => {
        const a = get(b.dataset.del);
        if (await confirmBox({ title: 'Xóa hồ sơ', message: `Xóa hồ sơ "${a.title}" cùng lịch sử duyệt?`, confirmLabel: 'Xóa', danger: true }))
          await run(b, () => tracked(repo.deleteApproval(wsId(), a.id)), { ok: 'Đã xóa hồ sơ.' });
      }),
    );
    root.querySelectorAll('[data-detail]').forEach((b) =>
      b.addEventListener('click', () => {
        const a = get(b.dataset.detail);
        openModal({
          title: a.title,
          wide: true,
          body: html`<p class="muted" style="margin-top:0">${unitName(a.unitId)} · ${pill(a.status)} · ${stageLabel(a)}</p>${a.note ? html`<p>${a.note}</p>` : ''}
          <div class="sectiontitle">Các bước</div>${a.steps.map((st) => html`<div class="approvalstep"><i class="stepdot ${st.status}"></i><span>${stepIcon(st.status)} <b>${st.label}</b>${st.byName ? ` — ${st.byName}` : ''}${st.comment ? ` · “${st.comment}”` : ''}</span></div>`)}
          <div class="sectiontitle">Lịch sử</div>${(a.history || []).length ? [...a.history].reverse().map((h) => html`<div class="feeditem"><div class="feedicon" aria-hidden="true">•</div><div><strong>${h.action}</strong><p>${h.byName || ''} · ${fmtDate(String(h.at).slice(0, 10))}${h.comment ? ` · “${h.comment}”` : ''}</p></div></div>`) : html`<p class="muted">Chưa có lịch sử.</p>`}`,
        });
      }),
    );
  },
};
export { toast };
