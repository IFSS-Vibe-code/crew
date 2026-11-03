import { html, raw, taskPill, avatar, emptyState } from '../kit.js';
import { fmtDate } from '../../domain/dates.js';
import { effectiveStatus, taskCode, computeProgress, isOverdue } from '../../domain/tasks.js';
import { S, unitName, firstError, isLoaded } from '../ctx.js';

export function header(title, desc, buttons = '') {
  const s = S();
  return html`<div class="pagehead"><div><div class="eyebrow">CREW · ${(s.workspace?.name || '').toUpperCase()}</div><h1>${title}</h1><p>${desc}</p></div><div class="actions">${buttons}</div></div>`;
}

export function stat(label, val, icon, bg, color, sub) {
  return html`<div class="stat"><div class="stathead"><span>${label}</span><span class="staticon" style="background:${bg};color:${color}" aria-hidden="true">${icon}</span></div><strong>${val}</strong><small>${sub}</small></div>`;
}

/** Hiển thị trạng thái tải / lỗi cho các collection cần thiết; trả về null nếu sẵn sàng. */
export function gate(...keys) {
  const err = firstError(...keys);
  if (err) return html`<div class="notice error" role="alert"><b>Không tải được dữ liệu.</b> ${err}</div>`;
  if (!isLoaded(...keys)) return html`<div class="loading" role="status">Đang tải dữ liệu…</div>`;
  return null;
}

export function taskTable(arr, { showUnit = true } = {}) {
  if (!arr.length) return emptyState('Chưa có công việc phù hợp', 'Hãy đổi bộ lọc hoặc tạo công việc mới.');
  return html`<table class="table"><caption class="sr-only">Danh sách công việc</caption><thead><tr><th scope="col">Công việc</th>${showUnit ? html`<th scope="col">Bộ phận</th>` : ''}<th scope="col">Phụ trách</th><th scope="col">Deadline</th><th scope="col">Tiến độ</th><th scope="col">Trạng thái</th></tr></thead><tbody>
    ${arr.map(
      (
        t,
      ) => html`<tr class="clickable" data-task="${t.id}"><td><button class="tasktitle" data-open-task="${t.id}">${t.title}</button><span class="sub">${t.type} · ${taskCode(t.seq)}${t.priority === 'Cao' ? html` · <span class="prio-Cao">Ưu tiên cao</span>` : ''}</span></td>
      ${showUnit ? html`<td>${unitName(t.unitId)}</td>` : ''}
      <td>${t.assigneeName ? html`<span class="assignee">${avatar(t.assigneeName)}${t.assigneeName}</span>` : html`<span class="muted">Chưa phân công</span>`}</td>
      <td class="${isOverdue(t) ? 'late' : ''}">${fmtDate(t.dueDate)}</td>
      <td>${computeProgress(t)}%</td>
      <td>${taskPill(t)}</td></tr>`,
    )}</tbody></table>`;
}

/** Gắn sự kiện mở chi tiết công việc cho mọi phần tử [data-open-task] và hàng [data-task]. */
export function bindTaskOpeners(root, openTask) {
  root.querySelectorAll('[data-open-task]').forEach((b) =>
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      openTask(b.dataset.openTask);
    }),
  );
  root.querySelectorAll('tr[data-task]').forEach((r) => r.addEventListener('click', () => openTask(r.dataset.task)));
}

export { raw, effectiveStatus };
