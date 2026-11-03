// Màn hình chọn / tạo Workspace và nhận lời mời (mockup: hộp thoại "Không gian làm việc").
import { html, run, toast, options, showFieldErrors, errSlot, formData } from './kit.js';
import { getState } from '../state/store.js';
import * as repo from '../services/repo.js';
import * as authSvc from '../services/firebase/auth.js';
import { WORKSPACE_TYPES } from '../domain/constants.js';
import { ValidationError } from '../domain/validation.js';
import { openWorkspace, refreshInvites } from '../services/sync.js';
import { ROLES } from '../domain/constants.js';

export function pickerScreen() {
  const { memberships, myInvites, user, errors, membershipsReady } = getState();
  return html`<div class="authwrap"><main class="authcard" style="width:min(560px,100%)">
    <div class="brand" style="padding:0"><div class="brandmark">K</div><div><strong translate="no">KhoaFlow</strong><small>WORKSPACE MANAGEMENT</small></div></div>
    <h1>Không gian làm việc</h1>
    <p class="lead">Xin chào <b>${user.displayName || user.email}</b>. Một tài khoản có thể tham gia nhiều Khoa, CLB hoặc tổ chức; mỗi Workspace có dữ liệu và phân quyền riêng.</p>
    ${errors.workspace ? html`<div class="notice error" role="alert">${errors.workspace}</div>` : ''}
    ${
      myInvites.length
        ? html`<div class="notice info"><b>Bạn có ${myInvites.length} lời mời:</b>
      ${myInvites.map(
        (
          i,
        ) => html`<div class="feeditem" style="padding:8px 0"><div style="flex:1"><strong>${i.workspaceName}</strong><p>Vai trò: ${ROLES[i.role]?.short || i.role}</p></div>
        <button class="btn small primary" data-accept="${i.workspaceId}">Tham gia</button> <button class="btn small" data-decline="${i.workspaceId}">Từ chối</button></div>`,
      )}</div>`
        : ''
    }
    <div class="sectiontitle" style="margin-top:6px">Workspace của bạn</div>
    ${
      !membershipsReady
        ? html`<div class="loading">Đang tải…</div>`
        : memberships.length
          ? html`<div style="display:grid;gap:8px">${memberships.map((m) => html`<button class="btn" style="justify-content:flex-start" data-open="${m.workspaceId}">▣ &nbsp; ${m.workspaceName}</button>`)}</div>`
          : html`<p class="muted" style="font-size:13px">Bạn chưa thuộc Workspace nào. Hãy tạo Workspace mới hoặc nhờ quản trị viên mời bằng email <b>${user.email}</b>.</p>`
    }
    <div style="border-top:1px solid var(--line);margin:18px 0 14px"></div>
    <b style="font-size:14px">Tạo Workspace mới</b>
    <form id="newWs" style="margin-top:12px" novalidate>
      <div class="field"><label for="w_name">Tên Khoa / CLB / tổ chức</label><input class="input" id="w_name" name="name" maxlength="100" placeholder="Ví dụ: Khoa FinTech…" />${errSlot('name')}</div>
      <div class="field"><label for="w_type">Loại tổ chức</label><select class="input" id="w_type" name="type">${options(WORKSPACE_TYPES, WORKSPACE_TYPES[0])}</select>${errSlot('type')}</div>
      <div class="field"><label for="w_year">Năm học</label><input class="input" id="w_year" name="academicYear" placeholder="2026 – 2027…" maxlength="20" />${errSlot('academicYear')}</div>
      <label class="checkline"><input type="checkbox" name="withDefaultUnits" checked /> Tạo sẵn các Ban/bộ phận theo mô hình Khoa (có thể sửa sau)</label>
      <button class="btn primary" type="submit">＋ Tạo Workspace</button>
    </form>
    <div class="authswitch"><button class="textlink" id="pOut">Đăng xuất</button></div>
  </main></div>`;
}

export function bindPicker(root) {
  const { user, myInvites } = getState();
  root.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => openWorkspace(b.dataset.open)));
  root.querySelectorAll('[data-accept]').forEach((b) =>
    b.addEventListener('click', () => {
      const inv = myInvites.find((i) => i.workspaceId === b.dataset.accept);
      run(
        b,
        async () => {
          await repo.acceptInvite(user, inv);
          openWorkspace(inv.workspaceId);
        },
        { ok: 'Đã tham gia Workspace.' },
      );
    }),
  );
  root.querySelectorAll('[data-decline]').forEach((b) =>
    b.addEventListener('click', () => {
      const inv = myInvites.find((i) => i.workspaceId === b.dataset.decline);
      run(
        b,
        async () => {
          await repo.declineInvite(inv);
          await refreshInvites();
        },
        { ok: 'Đã từ chối lời mời.' },
      );
    }),
  );
  root.querySelector('#pOut').addEventListener('click', () => authSvc.signOut());
  const form = root.querySelector('#newWs');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = formData(form);
    run(
      form.querySelector('button[type=submit]'),
      async () => {
        const id = await repo.createWorkspace(user, f, { withDefaultUnits: f.withDefaultUnits });
        openWorkspace(id);
      },
      {
        ok: 'Đã tạo Workspace.',
        onError: (ex) => {
          const fields = ex instanceof ValidationError ? ex.fields : ex.cause instanceof ValidationError ? ex.cause.fields : null;
          if (fields) {
            showFieldErrors(form, fields);
            return true;
          }
          return false;
        },
      },
    );
  });
}

export { toast };
