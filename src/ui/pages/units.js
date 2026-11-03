import { html, run, confirmBox, toast } from '../kit.js';
import { header, gate } from './common.js';
import { S, me, wsId, actor } from '../ctx.js';
import { tracked, setUi } from '../../state/store.js';
import { can } from '../../domain/permissions.js';
import { openForm } from '../formModal.js';
import * as repo from '../../services/repo.js';
import { progressByUnit } from '../../domain/tasks.js';

const fields = [
  { name: 'name', label: 'Tên Ban / CLB / bộ phận', required: true, full: true, max: 100 },
  { name: 'description', label: 'Mô tả nhiệm vụ', type: 'textarea', full: true, max: 300, rows: 2 },
  { name: 'managerLabel', label: 'Chức danh quản lý', placeholder: 'Trưởng Ban…', max: 100 },
  { name: 'icon', label: 'Biểu tượng (1–2 ký tự)', max: 4 },
];

export const unitsPage = {
  render() {
    const s = S();
    const g = gate('units', 'members', 'tasks');
    const owner = can.manageUnits(me());
    const head = header(
      'Ban / CLB / Bộ phận',
      'Không gian phụ trách và cơ cấu thực hiện công việc trong Khoa.',
      owner ? html`<button class="btn primary" id="newUnit">＋ Tạo bộ phận</button>` : '',
    );
    if (g) return html`${head}${g}`;
    const prog = Object.fromEntries(progressByUnit(s.tasks, s.units).map((p) => [p.unitId, p]));
    return html`${head}
    ${
      s.units.length
        ? html`<div class="grid cards">${s.units.map((u) => {
            const members = s.members.filter((m) => (m.unitIds || []).includes(u.id));
            const p = prog[u.id];
            return html`<article class="card"><div class="cardtop"><div class="unitico" aria-hidden="true">${u.icon || '▤'}</div><span class="tag">${members.length} thành viên</span></div><h3>${u.name}</h3><p>${u.description || ''}</p>
        <div class="meta"><span>Quản lý: ${u.managerLabel || '—'}</span><span>${p?.count || 0} việc · ${p?.percent || 0}%</span></div>
        <div class="cardfoot"><button class="textlink" data-open-unit="${u.id}">Xem công việc →</button>${owner ? html`<span><button class="textlink" data-edit="${u.id}">Sửa</button> <button class="textlink danger" data-del="${u.id}">Xóa</button></span>` : ''}</div></article>`;
          })}</div>`
        : html`<div class="panel"><div class="empty"><b>Chưa có bộ phận nào</b>${owner ? 'Tạo Ban/CLB đầu tiên để bắt đầu giao việc.' : ''}</div></div>`
    }
    <div class="notice sectiongap">Mỗi Ban/CLB có công việc, chương trình và thành viên riêng. Trưởng Ban chỉ xem và điều phối trong phạm vi được cấp; lãnh đạo Khoa xem tổng quan toàn Workspace.</div>`;
  },
  bind(root, { navigate }) {
    const get = (id) => S().units.find((u) => u.id === id);
    root.querySelector('#newUnit')?.addEventListener('click', () =>
      openForm({
        title: 'Tạo bộ phận',
        fields,
        ok: 'Đã tạo bộ phận.',
        onSubmit: async (d) => {
          await tracked(repo.saveUnit(wsId(), actor(), d));
        },
      }),
    );
    root.querySelectorAll('[data-edit]').forEach((b) =>
      b.addEventListener('click', () => {
        const u = get(b.dataset.edit);
        openForm({
          title: 'Sửa bộ phận',
          fields,
          values: u,
          ok: 'Đã cập nhật.',
          onSubmit: async (d) => {
            await tracked(repo.saveUnit(wsId(), actor(), d, u.id));
          },
        });
      }),
    );
    root.querySelectorAll('[data-del]').forEach((b) =>
      b.addEventListener('click', async () => {
        const u = get(b.dataset.del);
        const used = S().tasks.filter((t) => t.unitId === u.id).length + S().events.filter((e) => e.unitId === u.id).length;
        if (used) {
          toast(`Không thể xóa: còn ${used} công việc/chương trình thuộc bộ phận này. Hãy chuyển chúng sang bộ phận khác trước.`, 'error');
          return;
        }
        if (
          await confirmBox({
            title: 'Xóa bộ phận',
            message: `Xóa "${u.name}"? Các thành viên được gán vào bộ phận này cần được gán lại.`,
            confirmLabel: 'Xóa',
            danger: true,
          })
        )
          await run(b, () => tracked(repo.deleteUnit(wsId(), u.id)), { ok: 'Đã xóa bộ phận.' });
      }),
    );
    root.querySelectorAll('[data-open-unit]').forEach((b) =>
      b.addEventListener('click', () => {
        setUi({ taskFilters: { ...S().ui.taskFilters, status: 'Tất cả', unitId: b.dataset.openUnit } });
        navigate('tasks');
      }),
    );
  },
};
