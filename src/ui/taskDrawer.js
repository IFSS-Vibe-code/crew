// Tạo công việc (modal) và chi tiết công việc (drawer): tự lưu tiêu đề/mô tả, checklist, minh chứng, bình luận, lịch sử.
import { html, raw, toString, options, openModal, confirmBox, run, toast, showFieldErrors, errSlot, formData, taskPill, avatar } from './kit.js';
import { getState, setUi, tracked } from '../state/store.js';
import { S, wsId, me, actor, vctx, unitName, myManageableUnits } from './ctx.js';
import * as repo from '../services/repo.js';
import { listenTaskDetail } from '../services/sync.js';
import { can } from '../domain/permissions.js';
import { TASK_STATUSES, PRIORITIES, TASK_TYPES } from '../domain/constants.js';
import { taskCode, computeProgress, transitionError, isOverdue } from '../domain/tasks.js';
import { fmtDate, relativeTime } from '../domain/dates.js';
import { ValidationError, cryptoId, isSafeUrl } from '../domain/validation.js';
import { safeHref } from '../lib/html.js';

const fieldErrorsOf = (e) => (e instanceof ValidationError ? e.fields : e?.cause instanceof ValidationError ? e.cause.fields : null);

function memberOptions(selected, { empty = 'Chưa phân công' } = {}) {
  const list = getState().members.map((m) => ({ v: m.uid, l: m.displayName }));
  return options(list, selected, { empty });
}

/** Modal tạo công việc; prefill: {title,type,unitId,eventId,dueDate,description} */
export function openCreateTask(prefill = {}, { onCreated } = {}) {
  const units = myManageableUnits();
  if (!units.length) {
    toast('Bạn chưa được gán Ban nào để tạo công việc.', 'error');
    return;
  }
  const m = openModal({
    title: 'Tạo công việc mới',
    wide: true,
    body: html`<form id="taskForm" novalidate><div class="formgrid">
      <div class="field full"><label for="f_title">Tên công việc *</label><input class="input" id="f_title" name="title" maxlength="200" required value="${prefill.title || ''}" placeholder="Ví dụ: Hoàn thiện kế hoạch hội thảo…" />${errSlot('title')}</div>
      <div class="field"><label for="f_unit">Ban / Bộ phận *</label><select class="input" id="f_unit" name="unitId">${options(
        units.map((u) => ({ v: u.id, l: u.name })),
        prefill.unitId || units[0].id,
      )}</select>${errSlot('unitId')}</div>
      <div class="field"><label for="f_assignee">Người phụ trách</label><select class="input" id="f_assignee" name="assigneeUid">${memberOptions(prefill.assigneeUid || '')}</select>${errSlot('assigneeUid')}</div>
      <div class="field"><label for="f_start">Ngày bắt đầu</label><input class="input" id="f_start" name="startDate" type="date" />${errSlot('startDate')}</div>
      <div class="field"><label for="f_due">Deadline</label><input class="input" id="f_due" name="dueDate" type="date" value="${prefill.dueDate || ''}" />${errSlot('dueDate')}</div>
      <div class="field"><label for="f_prio">Mức ưu tiên</label><select class="input" id="f_prio" name="priority">${options(PRIORITIES, 'Trung bình')}</select></div>
      <div class="field"><label for="f_type">Loại công việc</label><select class="input" id="f_type" name="type">${options(TASK_TYPES, prefill.type || TASK_TYPES[0])}</select>${errSlot('type')}</div>
      <div class="field"><label for="f_status">Trạng thái ban đầu</label><select class="input" id="f_status" name="status">${options(['Nháp', 'Chưa bắt đầu', 'Đang thực hiện', 'Chờ phê duyệt', ...(S().workspace?.settings?.allowConditionalPrep ? ['Chuẩn bị có điều kiện'] : [])], 'Chưa bắt đầu')}</select></div>
      <div class="field"><label for="f_event">Thuộc chương trình</label><select class="input" id="f_event" name="eventId">${options(
        S().events.map((e) => ({ v: e.id, l: e.title })),
        prefill.eventId || '',
        { empty: '— Không —' },
      )}</select></div>
      <div class="field full"><label for="f_desc">Mô tả</label><textarea class="input" id="f_desc" name="description" rows="3" maxlength="5000" placeholder="Mô tả yêu cầu, đầu ra và ghi chú...…">${prefill.description || ''}</textarea>${errSlot('description')}</div>
    </div></form>`,
    footer: html`<button class="btn" data-no>Hủy</button><button class="btn primary" data-yes>Tạo công việc</button>`,
  });
  const form = m.el.querySelector('#taskForm');
  const submit = (btn) =>
    run(
      btn,
      async () => {
        const id = await tracked(repo.createTask(wsId(), actor(), formData(form), vctx()));
        m.close();
        onCreated?.(id);
      },
      {
        ok: 'Đã tạo công việc.',
        onError: (e) => {
          const f = fieldErrorsOf(e);
          if (f) {
            showFieldErrors(form, f);
            return true;
          }
          return false;
        },
      },
    );
  m.el.querySelector('[data-no]').addEventListener('click', () => m.close());
  m.el.querySelector('[data-yes]').addEventListener('click', (e) => submit(e.currentTarget));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    submit(m.el.querySelector('[data-yes]'));
  });
}

// ---------------------------------------------------------------------------------------------

let drawer = null; // { back, el, taskId, unsub, saveTimers, base }

export function closeTaskDrawer() {
  if (!drawer) return;
  drawer.unsub?.();
  Object.values(drawer.timers).forEach(clearTimeout);
  drawer.back.remove();
  drawer.el.remove();
  document.removeEventListener('keydown', drawer.onKey, true);
  const opener = drawer.opener;
  drawer = null;
  setUi({ openTaskId: null });
  if (opener && document.contains(opener)) opener.focus();
}

/** Có nội dung tiêu đề/mô tả đang chờ tự lưu không (dùng cho cảnh báo rời trang). */
export function hasUnsavedDrawerChanges() {
  return !!drawer && Object.values(drawer.timers).some((t) => t);
}

export function isDrawerOpen() {
  return !!drawer;
}

export function openTaskDrawer(taskId) {
  if (drawer?.taskId === taskId) return;
  closeTaskDrawer();
  const task = S().tasks.find((t) => t.id === taskId);
  if (!task) {
    toast('Không tìm thấy công việc (có thể đã bị xóa hoặc bạn không có quyền xem).', 'error');
    return;
  }
  const back = document.createElement('div');
  back.className = 'drawerback';
  const el = document.createElement('aside');
  el.className = 'drawer';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', 'Chi tiết công việc');
  document.body.append(back, el);
  const onKey = (e) => {
    if (e.key === 'Escape' && !document.querySelector('.modalback')) {
      e.stopPropagation();
      closeTaskDrawer();
    }
  };
  document.addEventListener('keydown', onKey, true);
  back.addEventListener('mousedown', closeTaskDrawer);
  drawer = {
    back,
    el,
    taskId,
    opener: document.activeElement,
    timers: {},
    onKey,
    comments: [],
    activity: [],
    base: { title: task.title, description: task.description || '' },
  };
  setUi({ openTaskId: taskId });
  buildDrawer(task);
  drawer.unsub = listenTaskDetail(
    wsId(),
    taskId,
    (list) => {
      drawer.comments = list;
      refreshDynamic();
    },
    (list) => {
      drawer.activity = list;
      refreshDynamic();
    },
    () => {
      /* lỗi quyền đọc bình luận: bỏ qua, phần chính vẫn dùng được */
    },
  );
  el.querySelector('input,button')?.focus();
}

/** Gọi khi state thay đổi: cập nhật phần động của drawer mà không phá focus ở ô đang gõ. */
export function syncDrawerWithState() {
  if (!drawer) return;
  const task = S().tasks.find((t) => t.id === drawer.taskId);
  if (!task) {
    toast('Công việc này đã bị xóa.', 'error');
    closeTaskDrawer();
    return;
  }
  refreshDynamic(task);
}

function editable(task) {
  return can.editTask(me(), task);
}
function progressEditable(task) {
  return can.updateTaskProgress(me(), task);
}

function buildDrawer(task) {
  const canEdit = editable(task);
  drawer.el.innerHTML = toString(html`
    <div class="drawerhead"><span class="tag">${taskCode(task.seq)}</span><span class="savestate" id="dSave" role="status"></span><span style="flex:1"></span>
      ${canEdit ? html`<button class="btn small danger" id="dDelete">Xóa</button>` : ''}<button class="iconbtn" id="dClose" aria-label="Đóng">✕</button></div>
    <div class="drawerbody">
      <label class="sr-only" for="dTitle">Tên công việc</label>
      <input class="titleinput" id="dTitle" maxlength="200" value="${task.title}" ${canEdit ? '' : 'readonly'} />
      <div id="dProps"></div>
      <div class="sectiontitle">Mô tả</div>
      <textarea class="input" id="dDesc" rows="4" maxlength="5000" ${canEdit ? '' : 'readonly'} placeholder="${canEdit ? 'Thêm mô tả…' : 'Không có mô tả'}">${task.description || ''}</textarea>
      <div id="dDyn"></div>
    </div>`);
  const $ = (s) => drawer.el.querySelector(s);
  $('#dClose').addEventListener('click', closeTaskDrawer);
  $('#dDelete')?.addEventListener('click', async () => {
    const t = S().tasks.find((x) => x.id === drawer.taskId);
    if (
      !(await confirmBox({
        title: 'Xóa công việc',
        message: `Xóa vĩnh viễn "${t.title}"? Hành động này không thể hoàn tác.`,
        confirmLabel: 'Xóa',
        danger: true,
      }))
    )
      return;
    await run(
      $('#dDelete'),
      async () => {
        await tracked(repo.deleteTask(wsId(), t.id));
        closeTaskDrawer();
      },
      { ok: 'Đã xóa công việc.' },
    );
  });
  if (canEdit) {
    bindAutosave('title', $('#dTitle'));
    bindAutosave('description', $('#dDesc'));
  }
  renderProps(task);
  renderDynamic(task);
}

function setSaveState(msg, err = false) {
  const el = drawer?.el.querySelector('#dSave');
  if (!el) return;
  el.textContent = msg;
  el.className = `savestate ${err ? 'err' : ''}`;
}

/** Tự lưu có debounce; chỉ ghi khi giá trị khác bản đã lưu; báo xung đột thay vì ghi đè. */
function bindAutosave(field, input) {
  const d = drawer;
  const flush = async () => {
    clearTimeout(d.timers[field]);
    d.timers[field] = null;
    const value = input.value.trim();
    if (value === d.base[field]) {
      setSaveState('');
      return;
    }
    if (field === 'title' && !value) {
      setSaveState('Tên công việc không được để trống.', true);
      return;
    }
    setSaveState('Đang lưu…');
    try {
      const r = await tracked(repo.autosaveTaskField(wsId(), actor(), d.taskId, field, d.base[field], value, vctx()));
      d.base[field] = r.value;
      setSaveState('Đã lưu');
      setTimeout(() => drawer === d && setSaveState(''), 1500);
    } catch (e) {
      setSaveState(e.message, true);
      if (e.kind === 'conflict') {
        const t = S().tasks.find((x) => x.id === d.taskId);
        if (t) {
          d.base[field] = t[field] || '';
        }
      }
    }
  };
  input.addEventListener('input', () => {
    setSaveState('Chưa lưu…');
    clearTimeout(d.timers[field]);
    d.timers[field] = setTimeout(flush, 900);
  });
  input.addEventListener('blur', flush);
}

function renderProps(task) {
  const canEdit = editable(task);
  const canProg = progressEditable(task);
  const s = S();
  const row = (label, content) => html`<dt>${label}</dt><dd>${content}</dd>`;
  const sel = (id, list, val, enabled, empty) =>
    html`<select class="input" id="${id}" ${enabled ? '' : 'disabled'}>${options(list, val, empty !== undefined ? { empty } : {})}</select>`;
  const statusList = TASK_STATUSES.filter(
    (x) =>
      (s.workspace?.settings?.allowConditionalPrep !== false || x !== 'Chuẩn bị có điều kiện' || task.status === x) &&
      (canEdit || x !== 'Đã duyệt' || task.status === x), // chỉ Owner/Trưởng Ban được đặt "Đã duyệt" (khớp Rules)
  );
  drawer.el.querySelector('#dProps').innerHTML = toString(html`<dl class="props">
    ${row('Trạng thái', html`${sel('pStatus', statusList, task.status, canProg)} ${isOverdue(task) ? html`<span class="pill p-red" style="margin-top:6px">Quá hạn</span>` : ''}`)}
    ${row(
      'Bộ phận',
      canEdit
        ? sel(
            'pUnit',
            s.units.filter((u) => can.createTask(me(), u.id)).map((u) => ({ v: u.id, l: u.name })),
            task.unitId,
            true,
          )
        : unitName(task.unitId),
    )}
    ${row('Phụ trách', canEdit ? html`<select class="input" id="pAssignee">${memberOptions(task.assigneeUid || '')}</select>` : task.assigneeName || 'Chưa phân công')}
    ${row(
      'Phối hợp',
      canEdit
        ? html`<select class="input" id="pCollab" multiple size="3" aria-label="Người phối hợp">${s.members.map((m) => html`<option value="${m.uid}" ${(task.collaboratorUids || []).includes(m.uid) ? raw('selected') : ''}>${m.displayName}</option>`)}</select><div class="hint" style="font-size:12px;color:var(--muted)">Giữ Ctrl/⌘ để chọn nhiều người.</div>`
        : (task.collaboratorUids || [])
            .map((u) => s.members.find((m) => m.uid === u)?.displayName)
            .filter(Boolean)
            .join(', ') || '—',
    )}
    ${row('Bắt đầu', canEdit ? html`<input class="input" type="date" id="pStart" value="${task.startDate || ''}" />` : fmtDate(task.startDate))}
    ${row('Deadline', canEdit ? html`<input class="input" type="date" id="pDue" value="${task.dueDate || ''}" />` : fmtDate(task.dueDate))}
    ${row('Ưu tiên', canEdit ? sel('pPrio', PRIORITIES, task.priority, true) : task.priority)}
    ${row('Loại', canEdit ? sel('pType', TASK_TYPES, task.type, true) : task.type)}
    ${row(
      'Tiến độ',
      html`<div class="bar" aria-hidden="true"><i style="width:${computeProgress(task)}%"></i></div><span style="font-size:12.5px">${computeProgress(task)}%${(task.checklist || []).length ? ' (theo checklist)' : ''}</span>
      ${canProg && !(task.checklist || []).length ? html`<input type="range" id="pProg" min="0" max="100" step="5" value="${task.progress || 0}" aria-label="Tiến độ" style="width:100%" />` : ''}`,
    )}
  </dl>`);
  bindProps(task);
}

function bindProps(task) {
  const root = drawer.el;
  const patchProgress = (patch, note) =>
    run(null, () => tracked(repo.updateTaskProgress(wsId(), actor(), S().tasks.find((t) => t.id === task.id) || task, patch, note)));
  const patchFull = (patch) =>
    run(null, () => tracked(repo.updateTask(wsId(), actor(), S().tasks.find((t) => t.id === task.id) || task, patch, vctx())), {
      onError: (e) => {
        toast(e.message, 'error');
        renderProps(S().tasks.find((t) => t.id === task.id) || task);
        return true;
      },
    });
  root.querySelector('#pStatus')?.addEventListener('change', async (e) => {
    const t = S().tasks.find((x) => x.id === task.id) || task;
    const msg = transitionError(t, e.target.value, S().workspace?.settings);
    if (msg) {
      toast(msg, 'error');
      e.target.value = t.status;
      return;
    }
    patchProgress({ status: e.target.value }, 'Đổi trạng thái');
  });
  root.querySelector('#pProg')?.addEventListener('change', (e) => patchProgress({ progress: Number(e.target.value) }));
  const map = { pUnit: 'unitId', pPrio: 'priority', pType: 'type', pAssignee: 'assigneeUid', pStart: 'startDate', pDue: 'dueDate' };
  for (const [id, key] of Object.entries(map)) root.querySelector(`#${id}`)?.addEventListener('change', (e) => patchFull({ [key]: e.target.value }));
  root.querySelector('#pCollab')?.addEventListener('change', (e) => patchFull({ collaboratorUids: [...e.target.selectedOptions].map((o) => o.value) }));
}

function renderDynamic(task) {
  const d = drawer;
  const canProg = progressEditable(task);
  const list = task.checklist || [];
  const evidence = task.evidence || [];
  const s = S();
  d.el.querySelector('#dDyn').innerHTML = toString(html`
    <div class="sectiontitle">Checklist ${list.length ? `(${list.filter((c) => c.done).length}/${list.length})` : ''}</div>
    ${list.map((c) => html`<div class="checkitem ${c.done ? 'done' : ''}"><input type="checkbox" id="c_${c.id}" data-check="${c.id}" ${c.done ? raw('checked') : ''} ${canProg ? '' : 'disabled'} /><label for="c_${c.id}" style="flex:1"><span>${c.text}</span></label>${canProg ? html`<button class="textlink danger" data-del-check="${c.id}" aria-label="Xóa mục ${c.text}">✕</button>` : ''}</div>`)}
    ${canProg ? html`<form id="addCheck" style="display:flex;gap:8px;margin-top:6px"><input class="input" name="text" maxlength="300" placeholder="Thêm mục checklist…" aria-label="Mục checklist mới" /><button class="btn" type="submit">Thêm</button></form>` : ''}
    <div class="sectiontitle">Minh chứng</div>
    ${evidence.length ? evidence.map((ev) => html`<div class="checkitem"><a href="${safeHref(ev.url)}" target="_blank" rel="noopener noreferrer" style="flex:1">${ev.label}</a>${canProg ? html`<button class="textlink danger" data-del-ev="${ev.id}" aria-label="Xóa minh chứng ${ev.label}">✕</button>` : ''}</div>`) : html`<p class="muted" style="font-size:13px;margin:0">Chưa có minh chứng. ${s.workspace?.settings?.requireEvidenceOnComplete ? 'Cần ít nhất một minh chứng để báo hoàn thành.' : ''}</p>`}
    ${canProg ? html`<form id="addEv" style="display:grid;grid-template-columns:1fr 1.4fr auto;gap:8px;margin-top:8px"><input class="input" name="label" maxlength="300" placeholder="Tên minh chứng…" aria-label="Tên minh chứng" /><input class="input" name="url" type="url" placeholder="https://drive.google.com/…" aria-label="Link minh chứng" /><button class="btn" type="submit">Thêm</button></form><div class="hint muted" style="font-size:12px">Chỉ nhận link https (ví dụ Google Drive). Hệ thống không lưu file trực tiếp.</div>` : ''}
    <div class="sectiontitle">Bình luận</div>
    ${d.comments.length ? d.comments.map((c) => html`<div class="comment"><header><b>${c.authorName}</b><span>${relativeTime(c.createdAt)} ${c.authorUid === s.user.uid || s.me.role === 'owner' ? html`<button class="textlink danger" data-del-comment="${c.id}">Xóa</button>` : ''}</span></header><p>${c.text}</p></div>`) : html`<p class="muted" style="font-size:13px;margin:0 0 8px">Chưa có bình luận.</p>`}
    <form id="addComment"><label class="sr-only" for="cmt">Bình luận</label><textarea class="input" id="cmt" name="text" rows="2" maxlength="2000" placeholder="Viết bình luận…"></textarea><div style="margin-top:6px"><button class="btn primary small" type="submit">Gửi bình luận</button></div></form>
    <div class="sectiontitle">Lịch sử hoạt động</div>
    ${d.activity.length ? d.activity.map((a) => html`<div class="feeditem"><div class="feedicon" aria-hidden="true">•</div><div><strong>${a.action}</strong><p>${a.actorName}${a.detail ? ` · ${a.detail}` : ''}</p></div><time>${relativeTime(a.createdAt)}</time></div>`) : html`<p class="muted" style="font-size:13px">Chưa có hoạt động.</p>`}
`);
  bindDynamic(task);
}

function bindDynamic(task) {
  const root = drawer.el.querySelector('#dDyn');
  const cur = () => S().tasks.find((t) => t.id === task.id) || task;
  const patch = (p, note) => run(null, () => tracked(repo.updateTaskProgress(wsId(), actor(), cur(), p, note)));
  root
    .querySelectorAll('[data-check]')
    .forEach((c) =>
      c.addEventListener('change', () =>
        patch({ checklist: (cur().checklist || []).map((x) => (x.id === c.dataset.check ? { ...x, done: c.checked } : x)) }, 'Cập nhật checklist'),
      ),
    );
  root
    .querySelectorAll('[data-del-check]')
    .forEach((b) =>
      b.addEventListener('click', () => patch({ checklist: (cur().checklist || []).filter((x) => x.id !== b.dataset.delCheck) }, 'Xóa mục checklist')),
    );
  root.querySelector('#addCheck')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = e.target.text.value.trim();
    if (!text) return;
    patch({ checklist: [...(cur().checklist || []), { id: cryptoId(), text, done: false }] }, 'Thêm mục checklist').then(() => {
      e.target.text.value = '';
    });
  });
  root
    .querySelectorAll('[data-del-ev]')
    .forEach((b) => b.addEventListener('click', () => patch({ evidence: (cur().evidence || []).filter((x) => x.id !== b.dataset.delEv) }, 'Xóa minh chứng')));
  root.querySelector('#addEv')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const label = e.target.label.value.trim();
    const url = e.target.url.value.trim();
    if (!label || !isSafeUrl(url)) {
      toast('Nhập tên và link bắt đầu bằng https://', 'error');
      return;
    }
    patch({ evidence: [...(cur().evidence || []), { id: cryptoId(), label, url }] }, 'Thêm minh chứng').then(() => {
      e.target.reset();
    });
  });
  root.querySelector('#addComment').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    const text = e.target.text.value;
    if (!text.trim()) return;
    const ok = await run(btn, () => tracked(repo.addComment(wsId(), actor(), task.id, text)));
    if (ok) {
      const f = drawer?.el.querySelector('#cmt');
      if (f) f.value = '';
    }
  });
  root
    .querySelectorAll('[data-del-comment]')
    .forEach((b) => b.addEventListener('click', () => run(b, () => tracked(repo.deleteComment(wsId(), task.id, b.dataset.delComment)))));
}

/** Cập nhật phần động: không dựng lại nếu người dùng đang gõ trong ô nhập của phần đó. */
function refreshDynamic(task = S().tasks.find((t) => t.id === drawer?.taskId)) {
  if (!drawer || !task) return;
  const a = document.activeElement;
  const typingInDyn = a && drawer.el.querySelector('#dDyn')?.contains(a) && ['INPUT', 'TEXTAREA'].includes(a.tagName) && a.type !== 'checkbox' && a.value;
  const typingInProps = a && drawer.el.querySelector('#dProps')?.contains(a) && ['INPUT', 'SELECT'].includes(a.tagName);
  if (!typingInProps) renderProps(task);
  if (!typingInDyn) renderDynamic(task);
  // Ô tiêu đề/mô tả: chỉ nhận giá trị mới từ server khi người dùng không đang sửa và không có thay đổi chưa lưu.
  for (const [field, id] of [
    ['title', '#dTitle'],
    ['description', '#dDesc'],
  ]) {
    const input = drawer.el.querySelector(id);
    if (input && document.activeElement !== input && input.value.trim() === drawer.base[field] && (task[field] || '') !== drawer.base[field]) {
      input.value = task[field] || '';
      drawer.base[field] = task[field] || '';
    }
  }
}

export { taskPill, avatar };
