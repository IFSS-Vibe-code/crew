import { html, pill, run, confirmBox, toast } from '../kit.js';
import { header, gate } from './common.js';
import { S, me, wsId, actor, vctx, unitName, myManageableUnits } from '../ctx.js';
import { tracked } from '../../state/store.js';
import { can } from '../../domain/permissions.js';
import { EVENT_TYPES, EVENT_STATUSES } from '../../domain/constants.js';
import { fmtDate } from '../../domain/dates.js';
import { openForm } from '../formModal.js';
import * as repo from '../../services/repo.js';
import { openCreateTask } from '../taskDrawer.js';
import { effectiveStatus, computeProgress } from '../../domain/tasks.js';

function eventFields() {
  const units = myManageableUnits().map((u) => ({ v: u.id, l: u.name }));
  return [
    { name: 'title', label: 'Tên chương trình', required: true, full: true, max: 200 },
    { name: 'type', label: 'Loại', type: 'select', options: EVENT_TYPES },
    { name: 'status', label: 'Trạng thái', type: 'select', options: EVENT_STATUSES },
    { name: 'unitId', label: 'Đơn vị phụ trách', type: 'select', options: units, required: true },
    { name: 'date', label: 'Ngày tổ chức', type: 'date' },
    { name: 'location', label: 'Địa điểm', full: true },
    { name: 'description', label: 'Mô tả', type: 'textarea', full: true },
  ];
}

export const eventsPage = {
  render() {
    const s = S();
    const g = gate('events', 'units');
    const canCreate = myManageableUnits().length > 0;
    const head = header(
      'Dự án & Sự kiện',
      'Quản lý chương trình từ khởi tạo, phê duyệt đến triển khai và tổng kết.',
      canCreate ? html`<button class="btn primary" id="newEvent">＋ Tạo chương trình</button>` : '',
    );
    if (g) return html`${head}${g}`;
    const events = s.events;
    return html`${head}
    ${
      events.length
        ? html`<div class="grid cards">${events.map((e) => {
            const tasks = s.tasks.filter((t) => t.eventId === e.id);
            const done = tasks.filter((t) => t.status === 'Hoàn thành').length;
            return html`<article class="card"><div class="cardtop"><span class="tag">${e.type}</span>${pill(e.status)}</div><h3>${e.title}</h3><p>${e.description || 'Chưa có mô tả.'}</p>
        <div class="meta"><span>▣ ${fmtDate(e.date)}</span><span>♙ ${unitName(e.unitId)}</span>${e.location ? html`<span>⌖ ${e.location}</span>` : ''}</div>
        ${tasks.length ? html`<div style="margin-top:10px"><div class="bar"><i style="width:${Math.round(tasks.reduce((a, t) => a + computeProgress(t), 0) / tasks.length)}%"></i></div><span class="muted" style="font-size:12px">${done}/${tasks.length} công việc hoàn thành</span></div>` : ''}
        <div class="cardfoot"><span class="muted" style="font-size:12.5px">${s.approvals.some((a) => a.eventId === e.id && a.status === 'Chờ xử lý') ? 'Đang chờ duyệt kế hoạch' : ''}</span>
          <span>${can.manageEvent(me(), e.unitId) ? html`<button class="textlink" data-add-task="${e.id}">＋ Việc</button> <button class="textlink" data-clone="${e.id}">Nhân bản</button> <button class="textlink" data-edit="${e.id}">Sửa</button> <button class="textlink danger" data-del="${e.id}">Xóa</button>` : ''}</span></div></article>`;
          })}</div>`
        : html`<div class="panel"><div class="empty"><b>Chưa có chương trình nào</b>${canCreate ? 'Bấm "Tạo chương trình" hoặc tạo từ mục "Chương trình từ Trường".' : 'Quản trị viên hoặc Trưởng Ban sẽ tạo chương trình.'}</div></div>`
    }
    <section class="panel sectiongap"><div class="panelhead"><div><h2 style="font-size:14.5px;margin:0">Luồng triển khai một chương trình của Khoa</h2><p>Quy trình theo ghi chú khảo sát</p></div></div><div class="panelbody"><div class="steps5">
      ${[
        ['1', 'Đề xuất', 'BCH ĐK/LC lập kế hoạch'],
        ['2', 'Chi ủy duyệt', 'Xem xét, góp ý, duyệt'],
        ['3', 'Cấp Trường duyệt', 'Đoàn trường / Hội SV'],
        ['4', 'Tổ chức', 'Mượn phòng, phân công, thực hiện'],
        ['5', 'Tổng kết', 'Minh chứng và quyết toán'],
      ].map((x) => html`<div class="stepbox"><span class="k">BƯỚC ${x[0]}</span><b>${x[1]}</b>${x[2]}</div>`)}</div>
      <p class="muted" style="font-size:12.5px;margin:12px 0 0">Thời gian duyệt 2–4 tuần là thông tin khảo sát, không phải cam kết của hệ thống.</p></div></section>`;
  },
  bind(root) {
    const ev = (id) => S().events.find((e) => e.id === id);
    const form = (title, values, save, ok) => openForm({ title, values, fields: eventFields(), ok, onSubmit: save });
    root.querySelector('#newEvent')?.addEventListener('click', () =>
      form(
        'Tạo chương trình',
        { type: EVENT_TYPES[0], status: 'Mới tiếp nhận' },
        async (d) => {
          await tracked(repo.saveEvent(wsId(), actor(), d, vctx()));
        },
        'Đã tạo chương trình.',
      ),
    );
    root.querySelectorAll('[data-edit]').forEach((b) =>
      b.addEventListener('click', () => {
        const e = ev(b.dataset.edit);
        form(
          'Sửa chương trình',
          e,
          async (d) => {
            await tracked(repo.saveEvent(wsId(), actor(), d, vctx(), e.id));
          },
          'Đã cập nhật chương trình.',
        );
      }),
    );
    root.querySelectorAll('[data-del]').forEach((b) =>
      b.addEventListener('click', async () => {
        const e = ev(b.dataset.del);
        if (
          await confirmBox({
            title: 'Xóa chương trình',
            message: `Xóa "${e.title}"? Các công việc thuộc chương trình vẫn được giữ lại.`,
            confirmLabel: 'Xóa',
            danger: true,
          })
        )
          await run(b, () => tracked(repo.deleteEvent(wsId(), e.id)), { ok: 'Đã xóa chương trình.' });
      }),
    );
    root.querySelectorAll('[data-add-task]').forEach((b) =>
      b.addEventListener('click', () => {
        const e = ev(b.dataset.addTask);
        openCreateTask({ eventId: e.id, unitId: e.unitId, dueDate: e.date || '' });
      }),
    );
    root.querySelectorAll('[data-clone]').forEach((b) =>
      b.addEventListener('click', () => {
        const e = ev(b.dataset.clone);
        const tasks = S().tasks.filter((t) => t.eventId === e.id);
        openForm({
          title: 'Nhân bản chương trình',
          submitLabel: 'Nhân bản',
          ok: 'Đã nhân bản chương trình.',
          intro: html`<p class="muted" style="margin-top:0;font-size:13px">Sao chép "${e.title}" và ${tasks.length} công việc thuộc chương trình. Trạng thái được đặt lại, ngày để trống để bạn lập lịch cho năm học mới.</p>`,
          fields: [{ name: 'title', label: 'Tên chương trình mới', required: true, full: true, max: 200 }],
          values: { title: e.title.replace(/20\d\d/, (y) => String(Number(y) + 1)) },
          onSubmit: async (d) => {
            const r = await tracked(repo.cloneEvent(wsId(), actor(), e, tasks, vctx(), d.title));
            toast(`Đã tạo chương trình mới và ${r.count} công việc.`);
          },
        });
      }),
    );
  },
};
export { effectiveStatus };
