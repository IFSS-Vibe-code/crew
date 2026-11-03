// Khung ứng dụng: sidebar, topbar (mockup). Dựng một lần cho mỗi phiên Workspace, sau đó chỉ cập nhật phần động.
import { html, toString, initials, toast, openModal, run } from './kit.js';
import { getState, setUi } from '../state/store.js';
import { ROLES } from '../domain/constants.js';
import { scopeLabel, can } from '../domain/permissions.js';
import { isOverdue, isDueSoon } from '../domain/tasks.js';
import { isWaitingTooLong } from '../domain/approvals.js';
import * as authSvc from '../services/firebase/auth.js';
import { openWorkspace, stopWorkspace } from '../services/sync.js';
import { resetWorkspaceData } from '../state/store.js';

export const PAGES = [
  { id: 'overview', label: 'Tổng quan', ico: '◫', group: 'Không gian làm việc' },
  { id: 'inbox', label: 'Chương trình từ Trường', ico: '✉', group: 'Không gian làm việc', count: 'inbox' },
  { id: 'tasks', label: 'Công việc', ico: '☷', group: 'Không gian làm việc' },
  { id: 'events', label: 'Dự án & Sự kiện', ico: '▦', group: 'Không gian làm việc' },
  { id: 'approvals', label: 'Phê duyệt kế hoạch', ico: '✓', group: 'Không gian làm việc', count: 'approvals' },
  { id: 'calendar', label: 'Lịch hoạt động', ico: '▣', group: 'Không gian làm việc' },
  { id: 'units', label: 'Ban / CLB / Bộ phận', ico: '▤', group: 'Tổ chức & nguồn lực' },
  { id: 'budget', label: 'Kinh phí', ico: '◇', group: 'Tổ chức & nguồn lực', need: 'readBudget' },
  { id: 'docs', label: 'Tài liệu & biểu mẫu', ico: '▧', group: 'Tổ chức & nguồn lực' },
  { id: 'reports', label: 'Báo cáo', ico: '▥', group: 'Tổ chức & nguồn lực' },
  { id: 'members', label: 'Thành viên & phân quyền', ico: '♙', group: 'Hệ thống', need: 'manageMembers' },
  { id: 'settings', label: 'Cài đặt Workspace', ico: '⚙', group: 'Hệ thống', need: 'manageWorkspace' },
];

export function pageAllowed(id, me) {
  const p = PAGES.find((x) => x.id === id);
  return !!p && (!p.need || can[p.need](me));
}

function counts(s) {
  const inbox = s.notices.filter((n) => ['Mới tiếp nhận', 'Cần đăng ký', 'Chờ phân công'].includes(n.status)).length;
  const approvals = s.approvals.filter((a) => a.status === 'Chờ xử lý').length;
  return { inbox, approvals };
}

export function shellHtml() {
  const s = getState();
  const wsName = s.workspace?.name || 'Workspace';
  const groups = [...new Set(PAGES.map((p) => p.group))];
  return html`<div class="app">
    <aside class="sidebar" id="sidebar" aria-label="Điều hướng chính">
      <div class="brand"><div class="brandmark">K</div><div><strong translate="no">KhoaFlow</strong><small>WORKSPACE MANAGEMENT</small></div></div>
      <button class="workspace" id="wsSwitch" title="Chuyển Workspace / tạo tổ chức"><span class="wsicon" id="wsIcon">${initials(wsName)}</span><span class="wstxt"><strong id="wsName">${wsName}</strong><span id="wsType">${s.workspace?.type || ''}</span></span><span aria-hidden="true">⌄</span></button>
      ${groups.map(
        (g) => html`<div class="navlabel">${g}</div><nav class="nav" aria-label="${g}">
        ${PAGES.filter((p) => p.group === g).map((p) => html`<a href="#/${p.id}" data-page="${p.id}" ${pageAllowed(p.id, s.me) ? '' : 'hidden'}><span class="ico" aria-hidden="true">${p.ico}</span><span>${p.label}</span>${p.count ? html`<span class="count" data-count="${p.count}" hidden></span>` : ''}</a>`)}</nav>`,
      )}
      <div class="sidebottom"><div class="profile"><div class="avatar" id="userAvatar"></div><div class="pinfo"><strong id="userName"></strong><span id="userRole"></span></div>
        <button class="iconbtn" id="logout" title="Đăng xuất" aria-label="Đăng xuất">⏻</button></div></div>
    </aside>
    <main class="main">
      <header class="topbar">
        <button class="iconbtn menubtn" id="menuBtn" aria-label="Mở menu" aria-controls="sidebar" aria-expanded="false">☰</button>
        <div class="crumb"><span id="crumbWs"></span><span style="color:#c3cad5"> / </span><b id="crumb"></b></div>
        <div class="topright">
          <span class="syncpill" id="syncpill" role="status"><i></i><span id="syncText"></span></span>
          <div class="search"><span aria-hidden="true">⌕</span><input id="globalSearch" type="search" placeholder="Tìm công việc…" aria-label="Tìm công việc" /></div>
          <div style="position:relative"><button class="iconbtn" id="bell" aria-label="Thông báo" aria-haspopup="true" aria-expanded="false">♧<i class="dot" id="bellDot" hidden></i></button><div class="popover" id="bellPop" hidden></div></div>
        </div>
      </header>
      <div class="content" id="content" tabindex="-1"></div>
    </main>
  </div>`;
}

export function bindShell(root, { onSearch, navigate }) {
  const sidebar = root.querySelector('#sidebar');
  const menuBtn = root.querySelector('#menuBtn');
  const setMenu = (open) => {
    sidebar.classList.toggle('open', open);
    menuBtn.setAttribute('aria-expanded', String(open));
  };
  menuBtn.addEventListener('click', () => setMenu(!sidebar.classList.contains('open')));
  sidebar.addEventListener('click', (e) => {
    if (e.target.closest('a')) setMenu(false);
  });
  root.querySelector('#logout').addEventListener('click', (e) =>
    run(e.currentTarget, async () => {
      stopWorkspace();
      resetWorkspaceData({ wsId: null });
      await authSvc.signOut();
    }),
  );
  root.querySelector('#wsSwitch').addEventListener('click', openSwitcher);
  const input = root.querySelector('#globalSearch');
  let t;
  input.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(() => onSearch(input.value), 200);
  });
  const bell = root.querySelector('#bell');
  const pop = root.querySelector('#bellPop');
  bell.addEventListener('click', () => {
    const open = pop.hidden;
    pop.hidden = !open;
    bell.setAttribute('aria-expanded', String(open));
  });
  document.addEventListener('click', (e) => {
    if (!pop.hidden && !e.target.closest('#bell') && !e.target.closest('#bellPop')) {
      pop.hidden = true;
      bell.setAttribute('aria-expanded', 'false');
    }
  });
  pop.addEventListener('click', (e) => {
    const a = e.target.closest('[data-go]');
    if (a) {
      pop.hidden = true;
      navigate(a.dataset.go);
    }
  });
}

/** Cập nhật phần động của khung (đếm, đồng bộ, hồ sơ cá nhân, thông báo). */
export function updateShell(root, pageId) {
  const s = getState();
  if (!s.me) return;
  const $ = (id) => root.querySelector(id);
  const wsName = s.workspace?.name || '';
  $('#wsName').textContent = wsName;
  $('#wsIcon').textContent = initials(wsName);
  $('#wsType').textContent = `${s.workspace?.type || ''}`;
  $('#crumbWs').textContent = wsName;
  $('#crumb').textContent = PAGES.find((p) => p.id === pageId)?.label || '';
  $('#userAvatar').textContent = initials(s.me.displayName);
  $('#userName').textContent = s.me.displayName;
  $('#userRole').textContent = `${ROLES[s.me.role]?.short || s.me.role} · ${scopeLabel(s.me)}`;
  root.querySelectorAll('[data-page]').forEach((a) => {
    a.hidden = !pageAllowed(a.dataset.page, s.me);
    if (a.dataset.page === pageId) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  const c = counts(s);
  root.querySelectorAll('[data-count]').forEach((el) => {
    const n = c[el.dataset.count];
    el.textContent = n;
    el.hidden = !n;
  });

  const sync = s.sync;
  const pill = $('#syncpill');
  const saving = s.savingCount > 0 || sync.pendingWrites;
  pill.className = `syncpill ${!sync.online ? 'offline' : saving ? 'saving' : ''}`;
  $('#syncText').textContent = !sync.online
    ? 'Mất kết nối – thay đổi chưa được lưu'
    : saving
      ? 'Đang lưu…'
      : sync.fromCache
        ? 'Đang kết nối máy chủ…'
        : 'Đã đồng bộ';

  // Thông báo trong ứng dụng (PHAN_TICH_YEU_CAU MVP #6): việc quá hạn / sắp hạn của tôi, hồ sơ chờ lâu.
  const warn = s.workspace?.settings?.approvalWaitWarnDays ?? 14;
  const hours = s.workspace?.settings?.remindBeforeDeadlineHours ?? 24;
  const mine = s.tasks.filter((t) => t.assigneeUid === s.user.uid || (t.collaboratorUids || []).includes(s.user.uid));
  const items = [
    ...mine.filter((t) => isOverdue(t)).map((t) => ({ go: 'tasks', text: `Quá hạn: ${t.title}`, kind: 'red' })),
    ...mine.filter((t) => isDueSoon(t, Math.max(1, Math.ceil(hours / 24)))).map((t) => ({ go: 'tasks', text: `Sắp đến hạn: ${t.title}`, kind: 'amber' })),
    ...(['owner', 'approver'].includes(s.me.role)
      ? s.approvals.filter((a) => isWaitingTooLong(a, warn)).map((a) => ({ go: 'approvals', text: `Hồ sơ chờ quá ${warn} ngày: ${a.title}`, kind: 'amber' }))
      : []),
    ...(['owner', 'approver'].includes(s.me.role)
      ? s.approvals
          .filter((a) => a.status === 'Chờ xử lý' && !isWaitingTooLong(a, warn))
          .map((a) => ({ go: 'approvals', text: `Chờ duyệt: ${a.title}`, kind: 'blue' }))
      : []),
  ];
  $('#bellDot').hidden = !items.length;
  $('#bellDot').textContent = items.length > 9 ? '9+' : items.length;
  $('#bellPop').innerHTML = toString(
    items.length
      ? html`<div class="panelbody">${items.slice(0, 12).map((i) => html`<button class="feeditem" style="width:100%;border:0;background:none;text-align:left" data-go="${i.go}"><div class="feedicon">${i.kind === 'red' ? '!' : '◷'}</div><div><strong>${i.text}</strong></div></button>`)}</div>`
      : html`<div class="empty"><b>Không có thông báo mới</b>Bạn đã xử lý hết các việc cần chú ý.</div>`,
  );
}

function openSwitcher() {
  const s = getState();
  const m = openModal({
    title: 'Không gian làm việc',
    body: html`<p class="muted" style="font-size:13px;margin-top:0">Mỗi Workspace có dữ liệu và phân quyền riêng.</p>
      <div style="display:grid;gap:8px">${s.memberships.map((x) => html`<button class="btn" style="justify-content:space-between" data-ws="${x.workspaceId}"><span>▣ &nbsp; ${x.workspaceName}</span>${x.workspaceId === s.wsId ? html`<span class="tag">Đang mở</span>` : ''}</button>`)}</div>`,
    footer: html`<button class="btn" data-new>＋ Tạo / tham gia Workspace khác</button>`,
  });
  m.el.querySelectorAll('[data-ws]').forEach((b) =>
    b.addEventListener('click', () => {
      m.close();
      if (b.dataset.ws !== s.wsId) {
        openWorkspace(b.dataset.ws);
        location.hash = '#/overview';
      }
    }),
  );
  m.el.querySelector('[data-new]').addEventListener('click', () => {
    m.close();
    stopWorkspace();
    resetWorkspaceData({ wsId: null });
  });
}

export { toast, setUi };
