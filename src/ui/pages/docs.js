import { html, pill, run, confirmBox } from '../kit.js';
import { header, gate } from './common.js';
import { S, me, wsId, actor } from '../ctx.js';
import { tracked } from '../../state/store.js';
import { can } from '../../domain/permissions.js';
import { DOC_GROUPS } from '../../domain/constants.js';
import { safeHref } from '../../lib/html.js';
import { openForm } from '../formModal.js';
import * as repo from '../../services/repo.js';
import { relativeTime } from '../../domain/dates.js';

const fields = [
  { name: 'title', label: 'Tên tài liệu', required: true, full: true, max: 200 },
  { name: 'group', label: 'Nhóm', type: 'select', options: DOC_GROUPS },
  { name: 'academicYear', label: 'Năm học', placeholder: '2026 – 2027…', max: 20 },
  {
    name: 'url',
    label: 'Link tài liệu (https)',
    type: 'url',
    required: true,
    full: true,
    max: 2000,
    hint: 'Dán link Google Drive / OneDrive. Hệ thống lưu link, không lưu file.',
  },
  { name: 'appliesTo', label: 'Áp dụng cho', full: true },
  { name: 'status', label: 'Trạng thái', type: 'select', options: ['Đang sử dụng', 'Lưu trữ'] },
];

let q = '';
let group = '';

export const docsPage = {
  render() {
    const s = S();
    const g = gate('docs');
    const manage = can.manageDocs(me());
    const head = header(
      'Tài liệu & biểu mẫu',
      'Kho liên kết kế hoạch, công văn, biên bản và minh chứng dùng chung.',
      manage ? html`<button class="btn primary" id="newDoc">＋ Thêm tài liệu</button>` : '',
    );
    if (g) return html`${head}${g}`;
    const list = s.docs.filter((d) => (!group || d.group === group) && (!q || `${d.title} ${d.appliesTo || ''}`.toLowerCase().includes(q.toLowerCase())));
    return html`${head}
    <section class="panel"><div class="panelhead"><div><h2 style="font-size:14.5px;margin:0">Thư viện tài liệu</h2><p>Lưu theo năm học để tái sử dụng kế hoạch của các năm trước</p></div>
      <div style="display:flex;gap:8px"><select class="filter" id="dg" aria-label="Lọc theo nhóm"><option value="">Mọi nhóm</option>${DOC_GROUPS.map((x) => html`<option ${x === group ? 'selected' : ''}>${x}</option>`)}</select><input class="filter" id="dq" type="search" placeholder="Tìm tài liệu…" aria-label="Tìm tài liệu" value="${q}" style="width:190px" /></div></div>
    ${
      list.length
        ? html`<div class="tablewrap"><table class="table"><caption class="sr-only">Tài liệu</caption><thead><tr><th scope="col">Tên tài liệu</th><th scope="col">Nhóm</th><th scope="col">Áp dụng</th><th scope="col">Năm học</th><th scope="col">Cập nhật</th><th scope="col">Trạng thái</th>${manage ? html`<th scope="col">Thao tác</th>` : ''}</tr></thead><tbody>
      ${list.map(
        (
          d,
        ) => html`<tr><td><a class="tasktitle" href="${safeHref(d.url)}" target="_blank" rel="noopener noreferrer">${d.title} ↗</a></td><td>${d.group}</td><td>${d.appliesTo || '—'}</td><td>${d.academicYear || '—'}</td><td>${relativeTime(d.updatedAt)}</td><td>${pill(d.status)}</td>
        ${manage ? html`<td><button class="textlink" data-edit="${d.id}">Sửa</button>${me().role === 'owner' || d.createdBy === s.user.uid ? html` <button class="textlink danger" data-del="${d.id}">Xóa</button>` : ''}</td>` : ''}</tr>`,
      )}</tbody></table></div>`
        : html`<div class="empty"><b>${s.docs.length ? 'Không có tài liệu khớp bộ lọc' : 'Chưa có tài liệu nào'}</b>${manage && !s.docs.length ? 'Thêm mẫu kế hoạch, quy trình mượn phòng, mẫu báo cáo tổng kết…' : ''}</div>`
    }</section>
    <div class="notice sectiongap">Kế hoạch và khung chương trình thường được tái sử dụng: hãy lưu theo năm học và dùng nút "Nhân bản" ở mục Dự án & Sự kiện để sao chép chương trình năm trước.</div>`;
  },
  bind(root, { rerender }) {
    const get = (id) => S().docs.find((d) => d.id === id);
    root.querySelector('#dg')?.addEventListener('change', (e) => {
      group = e.target.value;
      rerender();
    });
    root.querySelector('#dq')?.addEventListener('input', (e) => {
      q = e.target.value;
      clearTimeout(docsPage._t);
      docsPage._t = setTimeout(() => {
        rerender();
        const i = document.querySelector('#dq');
        i?.focus();
        i?.setSelectionRange(q.length, q.length);
      }, 250);
    });
    root.querySelector('#newDoc')?.addEventListener('click', () =>
      openForm({
        title: 'Thêm tài liệu',
        fields,
        values: { group: DOC_GROUPS[0], status: 'Đang sử dụng' },
        ok: 'Đã thêm tài liệu.',
        onSubmit: async (d) => {
          await tracked(repo.saveDoc(wsId(), actor(), d));
        },
      }),
    );
    root.querySelectorAll('[data-edit]').forEach((b) =>
      b.addEventListener('click', () => {
        const d = get(b.dataset.edit);
        openForm({
          title: 'Sửa tài liệu',
          fields,
          values: d,
          ok: 'Đã cập nhật.',
          onSubmit: async (v) => {
            await tracked(repo.saveDoc(wsId(), actor(), v, d.id));
          },
        });
      }),
    );
    root.querySelectorAll('[data-del]').forEach((b) =>
      b.addEventListener('click', async () => {
        const d = get(b.dataset.del);
        if (
          await confirmBox({
            title: 'Xóa tài liệu',
            message: `Xóa liên kết "${d.title}" khỏi thư viện? (File gốc trên Drive không bị ảnh hưởng.)`,
            confirmLabel: 'Xóa',
            danger: true,
          })
        )
          await run(b, () => tracked(repo.deleteDocument(wsId(), d.id)), { ok: 'Đã xóa tài liệu.' });
      }),
    );
  },
};
