import { html, pill, run, confirmBox } from '../kit.js';
import { header, gate } from './common.js';
import { S, me, wsId, actor } from '../ctx.js';
import { tracked } from '../../state/store.js';
import { can } from '../../domain/permissions.js';
import { NOTICE_STATUSES } from '../../domain/constants.js';
import { fmtDate, todayIso, daysBetween } from '../../domain/dates.js';
import { openForm } from '../formModal.js';
import { openCreateTask } from '../taskDrawer.js';
import * as repo from '../../services/repo.js';

const fields = [
  { name: 'title', label: 'Tên chương trình / thông báo', required: true, full: true, max: 200 },
  { name: 'category', label: 'Lĩnh vực', placeholder: 'Thể thao, văn nghệ, tuyển sinh…', max: 100 },
  { name: 'deadline', label: 'Hạn đăng ký', type: 'date' },
  { name: 'source', label: 'Nguồn', placeholder: 'Email Nhà trường, công văn số…' },
  { name: 'contact', label: 'Đầu mối liên hệ' },
  { name: 'status', label: 'Trạng thái', type: 'select', options: NOTICE_STATUSES },
  { name: 'summary', label: 'Nội dung / hướng dẫn đăng ký', type: 'textarea', full: true },
];

export const inboxPage = {
  render() {
    const s = S();
    const g = gate('notices');
    const canManage = can.manageNotices(me());
    const head = header(
      'Chương trình từ Trường',
      'Hộp tiếp nhận các thông báo, hoạt động và yêu cầu phối hợp từ cấp Trường.',
      canManage ? html`<button class="btn primary" id="newNotice">＋ Ghi nhận thông báo</button>` : '',
    );
    if (g) return html`${head}${g}`;
    const today = todayIso();
    return html`${head}
    <div class="notice info"><b>Cách dùng:</b> khi nhận email/công văn của Trường, ghi nhận vào đây (hạn đăng ký, đầu mối), rồi bấm "Tạo nhiệm vụ" để giao việc đăng ký lực lượng. Hệ thống chưa tự đọc email; việc tích hợp Gmail/Outlook cần khách hàng xác nhận email đầu mối.</div>
    ${
      s.notices.length
        ? html`<div class="grid cards">${s.notices.map((n) => {
            const left = n.deadline ? daysBetween(today, n.deadline) : null;
            return html`<article class="card"><div class="cardtop"><span class="tag">THÔNG BÁO CẤP TRƯỜNG</span>${pill(n.status)}</div><h3>${n.title}</h3><p>${n.summary || 'Chưa có nội dung.'}</p>
        <div class="meta">${n.deadline ? html`<span class="${left !== null && left < 0 && n.status !== 'Đã hoàn tất' ? 'late' : ''}">◷ Hạn ĐK: ${fmtDate(n.deadline)}${left !== null && left >= 0 && left <= 3 ? ` (còn ${left} ngày)` : ''}</span>` : ''}${n.category ? html`<span>⌑ ${n.category}</span>` : ''}${n.contact ? html`<span>☎ ${n.contact}</span>` : ''}</div>
        <div class="cardfoot"><span class="muted" style="font-size:12.5px">Nguồn: ${n.source || '—'}${(n.taskIds || []).length ? ` · ${n.taskIds.length} nhiệm vụ` : ''}</span>
          <span>${canManage ? html`<button class="textlink" data-task="${n.id}">Tạo nhiệm vụ →</button> <button class="textlink" data-edit="${n.id}">Sửa</button>` : ''}${me().role === 'owner' ? html` <button class="textlink danger" data-del="${n.id}">Xóa</button>` : ''}</span></div></article>`;
          })}</div>`
        : html`<div class="panel"><div class="empty"><b>Chưa có thông báo nào</b>Khi Trường gửi thông báo, hãy ghi nhận tại đây để không bỏ sót hạn đăng ký.</div></div>`
    }
    <section class="panel sectiongap"><div class="panelhead"><h2 style="font-size:14.5px;margin:0">Nguyên tắc xử lý thông báo</h2></div><div class="panelbody"><div class="steps4">
      ${[
        ['01', 'Tiếp nhận', 'Lưu thông báo, hạn đăng ký và đầu mối liên hệ.'],
        ['02', 'Xác định đơn vị', 'Chọn CLB/Ban phù hợp hoặc phân bổ lực lượng.'],
        ['03', 'Đăng ký / phân công', 'Giao nhiệm vụ và ghi nhận danh sách tham gia.'],
        ['04', 'Xác nhận kết quả', 'Lưu minh chứng, tổng hợp và báo cáo.'],
      ].map((x) => html`<div class="stepbox"><span class="k">${x[0]}</span><b>${x[1]}</b>${x[2]}</div>`)}</div></div></section>`;
  },
  bind(root, { openTask }) {
    const get = (id) => S().notices.find((n) => n.id === id);
    root.querySelector('#newNotice')?.addEventListener('click', () =>
      openForm({
        title: 'Ghi nhận thông báo',
        fields,
        values: { status: 'Mới tiếp nhận' },
        ok: 'Đã ghi nhận thông báo.',
        onSubmit: async (d) => {
          await tracked(repo.saveNotice(wsId(), actor(), d));
        },
      }),
    );
    root.querySelectorAll('[data-edit]').forEach((b) =>
      b.addEventListener('click', () => {
        const n = get(b.dataset.edit);
        openForm({
          title: 'Sửa thông báo',
          fields,
          values: n,
          ok: 'Đã cập nhật.',
          onSubmit: async (d) => {
            await tracked(repo.saveNotice(wsId(), actor(), d, n.id));
          },
        });
      }),
    );
    root.querySelectorAll('[data-del]').forEach((b) =>
      b.addEventListener('click', async () => {
        const n = get(b.dataset.del);
        if (await confirmBox({ title: 'Xóa thông báo', message: `Xóa "${n.title}"?`, confirmLabel: 'Xóa', danger: true }))
          await run(b, () => tracked(repo.deleteNotice(wsId(), n.id)), { ok: 'Đã xóa.' });
      }),
    );
    root.querySelectorAll('[data-task]').forEach((b) =>
      b.addEventListener('click', () => {
        const n = get(b.dataset.task);
        openCreateTask(
          { title: `Đăng ký: ${n.title}`, type: 'Đoàn - Hội', dueDate: n.deadline || '', description: n.summary || '' },
          {
            onCreated: async (id) => {
              await run(null, () => tracked(repo.linkNoticeTask(wsId(), actor(), n.id, id)));
              openTask(id);
            },
          },
        );
      }),
    );
  },
};
