// Công việc: danh sách + Kanban (tham khảo ClickUp/Asana: nhiều chế độ xem, lọc, kéo thả đổi trạng thái).
import { html, raw, options, taskPill, avatar, run, toast, emptyState } from '../kit.js';
import { header, gate, taskTable, bindTaskOpeners } from './common.js';
import { S, me, wsId, actor, unitName } from '../ctx.js';
import { setUi, tracked } from '../../state/store.js';
import { can } from '../../domain/permissions.js';
import { TASK_STATUSES, PRIORITIES, TASK_TYPES, OVERDUE } from '../../domain/constants.js';
import { filterTasks, sortTasks, groupByStatus, isOverdue, computeProgress, taskCode, transitionError } from '../../domain/tasks.js';
import { fmtDate } from '../../domain/dates.js';
import { openCreateTask } from '../taskDrawer.js';
import * as repo from '../../services/repo.js';
import { toCsv } from '../../domain/reports.js';
import { downloadText } from '../download.js';

function visibleTasks() {
  const s = S();
  const f = s.ui.taskFilters;
  return sortTasks(
    filterTasks(s.tasks, {
      status: f.status,
      unitId: f.unitId,
      priority: f.priority,
      type: f.type,
      assigneeUid: f.assignee === 'me' ? s.user.uid : f.assignee,
      search: s.ui.search,
    }),
  );
}

function board(list) {
  const groups = groupByStatus(list);
  const canDrag = (t) => can.updateTaskProgress(me(), t);
  return html`<div class="board" role="list" aria-label="Bảng Kanban theo trạng thái">${TASK_STATUSES.filter(
    (st) => groups[st].length || ['Chưa bắt đầu', 'Đang thực hiện', 'Chờ phê duyệt', 'Hoàn thành'].includes(st),
  ).map(
    (st) => html`
    <section class="column" role="listitem" data-col="${st}" aria-label="${st}"><div class="columnhead"><span>${st}</span><span class="tag">${groups[st].length}</span></div>
      ${groups[st].map(
        (
          t,
        ) => html`<div class="kcard" ${canDrag(t) ? raw('draggable="true"') : ''} data-card="${t.id}"><button class="tasktitle" data-open-task="${t.id}">${t.title}</button>
        <div class="kmeta"><span>${unitName(t.unitId)}</span>${isOverdue(t) ? html`<span class="late">Quá hạn</span>` : html`<span>${fmtDate(t.dueDate)}</span>`}</div>
        <div class="kmeta" style="margin-top:6px"><span class="assignee">${t.assigneeName ? html`${avatar(t.assigneeName)}${t.assigneeName}` : 'Chưa phân công'}</span><span>${computeProgress(t)}%</span></div></div>`,
      )}
      ${groups[st].length ? '' : html`<p class="muted" style="font-size:12.5px;text-align:center;margin:10px 0">Trống</p>`}</section>`,
  )}</div>
    <p class="muted" style="font-size:12.5px">Kéo thả thẻ sang cột khác để đổi trạng thái (nếu bạn có quyền cập nhật công việc đó).</p>`;
}

export const tasksPage = {
  render() {
    const s = S();
    const g = gate('tasks', 'units');
    const canCreate = can.createTask(me());
    const head = header(
      'Quản lý công việc',
      'Tạo nhiệm vụ, giao người phụ trách và theo dõi tiến độ theo từng Ban.',
      html`<button class="btn" id="exportCsv">⇩ Xuất CSV</button>${canCreate ? html`<button class="btn primary" id="newTask">＋ Tạo công việc</button>` : ''}`,
    );
    if (g) return html`${head}${g}`;
    const f = s.ui.taskFilters;
    const all = visibleTasks();
    const limit = s.ui.taskLimit || 100;
    const list = s.ui.taskView === 'board' ? all : all.slice(0, limit);
    return html`${head}
    <div class="toolbar" role="search">
      <div class="segmented" role="group" aria-label="Kiểu hiển thị"><button aria-pressed="${s.ui.taskView === 'list'}" data-view="list">☰ Danh sách</button><button aria-pressed="${s.ui.taskView === 'board'}" data-view="board">▥ Bảng</button></div>
      <select class="filter" data-f="status" aria-label="Lọc theo trạng thái">${options(['Tất cả', ...TASK_STATUSES, OVERDUE], f.status)}</select>
      <select class="filter" data-f="unitId" aria-label="Lọc theo bộ phận">${options(
        s.units.map((u) => ({ v: u.id, l: u.name })),
        f.unitId,
        { empty: 'Tất cả bộ phận' },
      )}</select>
      <select class="filter" data-f="priority" aria-label="Lọc theo ưu tiên">${options(PRIORITIES, f.priority, { empty: 'Mọi mức ưu tiên' })}</select>
      <select class="filter" data-f="type" aria-label="Lọc theo loại">${options(TASK_TYPES, f.type, { empty: 'Mọi loại' })}</select>
      <select class="filter" data-f="assignee" aria-label="Lọc theo người phụ trách">${options([{ v: 'me', l: 'Việc của tôi' }, ...s.members.map((m) => ({ v: m.uid, l: m.displayName }))], f.assignee, { empty: 'Mọi người phụ trách' })}</select>
      ${s.ui.search ? html`<span class="tag">Từ khóa: ${s.ui.search}</span>` : ''}
      <span class="muted" style="font-size:12.5px" role="status">${all.length} công việc</span>
    </div>
    ${s.ui.taskView === 'board' ? board(list) : html`<section class="panel"><div class="tablewrap">${taskTable(list)}</div>${all.length > list.length ? html`<div style="padding:12px;text-align:center"><button class="btn" id="moreTasks">Hiển thị thêm (còn ${all.length - list.length})</button></div>` : ''}</section>`}`;
  },
  bind(root, { openTask }) {
    root.querySelector('#newTask')?.addEventListener('click', () => openCreateTask({}, { onCreated: openTask }));
    root.querySelector('#moreTasks')?.addEventListener('click', () => setUi({ taskLimit: (S().ui.taskLimit || 100) + 100 }));
    root.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => setUi({ taskView: b.dataset.view })));
    root
      .querySelectorAll('[data-f]')
      .forEach((el) => el.addEventListener('change', () => setUi({ taskFilters: { ...S().ui.taskFilters, [el.dataset.f]: el.value } })));
    root.querySelector('#exportCsv')?.addEventListener('click', () => {
      const rows = [['Mã', 'Tên công việc', 'Bộ phận', 'Phụ trách', 'Loại', 'Ưu tiên', 'Trạng thái', 'Bắt đầu', 'Deadline', 'Tiến độ %']];
      for (const t of visibleTasks())
        rows.push([
          taskCode(t.seq),
          t.title,
          unitName(t.unitId),
          t.assigneeName || '',
          t.type,
          t.priority,
          isOverdue(t) ? OVERDUE : t.status,
          t.startDate || '',
          t.dueDate || '',
          computeProgress(t),
        ]);
      downloadText('cong-viec.csv', toCsv(rows), 'text/csv;charset=utf-8');
    });
    bindTaskOpeners(root, openTask);
    // Kéo thả đổi trạng thái
    root.querySelectorAll('[data-card]').forEach((c) =>
      c.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', c.dataset.card);
        e.dataTransfer.effectAllowed = 'move';
      }),
    );
    root.querySelectorAll('[data-col]').forEach((col) => {
      col.addEventListener('dragover', (e) => {
        e.preventDefault();
        col.classList.add('dragover');
      });
      col.addEventListener('dragleave', () => col.classList.remove('dragover'));
      col.addEventListener('drop', async (e) => {
        e.preventDefault();
        col.classList.remove('dragover');
        const id = e.dataTransfer.getData('text/plain');
        const t = S().tasks.find((x) => x.id === id);
        const next = col.dataset.col;
        if (!t || t.status === next) return;
        if (next === 'Đã duyệt' && !can.editTask(me(), t)) {
          toast('Chỉ Owner hoặc Trưởng Ban được đặt trạng thái "Đã duyệt".', 'error');
          return;
        }
        const msg = transitionError(t, next, S().workspace?.settings);
        if (msg) {
          toast(msg, 'error');
          return;
        }
        await run(null, () => tracked(repo.updateTaskProgress(wsId(), actor(), t, { status: next }, 'Đổi trạng thái (kéo thả)')));
      });
    });
  },
};
export { taskPill, emptyState };
