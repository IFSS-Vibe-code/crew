import './styles/main.css';
import { toString, toast, html } from './ui/kit.js';
import { getState, setState, setUi, subscribe, resetAll } from './state/store.js';
import { onAuth } from './services/firebase/auth.js';
import { startUser, stopUser, openWorkspace, refreshInvites } from './services/sync.js';
import { authScreen, bindAuth, verifyScreen, bindVerify } from './ui/auth.js';
import { pickerScreen, bindPicker } from './ui/workspacePicker.js';
import { shellHtml, bindShell, updateShell, pageAllowed, PAGES } from './ui/shell.js';
import { openTaskDrawer, closeTaskDrawer, syncDrawerWithState, hasUnsavedDrawerChanges } from './ui/taskDrawer.js';
import { overview } from './ui/pages/overview.js';
import { tasksPage } from './ui/pages/tasks.js';
import { eventsPage } from './ui/pages/events.js';
import { inboxPage } from './ui/pages/inbox.js';
import { approvalsPage } from './ui/pages/approvals.js';
import { calendarPage } from './ui/pages/calendar.js';
import { unitsPage } from './ui/pages/units.js';
import { budgetPage } from './ui/pages/budget.js';
import { docsPage } from './ui/pages/docs.js';
import { reportsPage } from './ui/pages/reports.js';
import { membersPage } from './ui/pages/members.js';
import { settingsPage } from './ui/pages/settings.js';
import { chatPage } from './ui/pages/chat.js';

// GitHub Pages không đặt được header frame-ancestors: chặn nhúng trong iframe của trang khác bằng mã.
if (window.top !== window.self) {
  document.documentElement.innerHTML = '';
  try {
    window.top.location = window.self.location.href;
  } catch {
    /* khác origin: không điều hướng được, giao diện đã bị xóa nên không thể thao tác */
  }
}

const root = document.getElementById('root');
const PAGE_MAP = {
  overview,
  chat: chatPage,
  tasks: tasksPage,
  events: eventsPage,
  inbox: inboxPage,
  approvals: approvalsPage,
  calendar: calendarPage,
  units: unitsPage,
  budget: budgetPage,
  docs: docsPage,
  reports: reportsPage,
  members: membersPage,
  settings: settingsPage,
};

let screenKey = '';
let lastContentHtml = '';
let autoOpened = false;

const currentPage = () => {
  const id = location.hash.replace(/^#\/?/, '').split('?')[0] || 'overview';
  return PAGE_MAP[id] ? id : 'overview';
};
export const navigate = (id) => {
  location.hash = `#/${id}`;
};

function screen(key, markup, bind) {
  if (screenKey === key) return false;
  screenKey = key;
  lastContentHtml = '';
  closeTaskDrawer();
  root.innerHTML = toString(markup);
  bind?.(root);
  return true;
}

function render() {
  const s = getState();
  if (!s.authReady) return screen('loading', html`<div class="loading" role="status">Đang tải Crew…</div>`);
  if (!s.user)
    return screen('auth', authScreen(), (r) =>
      bindAuth(r, () => {
        screenKey = '';
        render();
      }),
    );
  if (!s.user.emailVerified) return screen('verify', verifyScreen(), bindVerify);

  if (!s.wsId) {
    if (s.membershipsReady && !autoOpened) {
      autoOpened = true;
      let last = null;
      try {
        last = localStorage.getItem('crew.lastWs');
      } catch {
        /* localStorage bị chặn: bỏ qua */
      }
      if (last && s.memberships.some((m) => m.workspaceId === last)) {
        openWorkspace(last);
        return;
      }
    }
    const key = `picker|${s.membershipsReady}|${s.memberships.map((m) => m.workspaceId + m.workspaceName).join(',')}|${s.myInvites.map((i) => i.workspaceId).join(',')}|${s.errors.workspace || ''}`;
    return screen(key, pickerScreen(), bindPicker);
  }

  if (!s.me) {
    const err = s.errors.me;
    return screen(
      `wsloading|${err || ''}`,
      err
        ? html`<div class="authwrap"><main class="authcard"><div class="notice error" role="alert">${err}</div><button class="btn primary" id="back">Quay lại</button></main></div>`
        : html`<div class="loading" role="status">Đang mở Workspace…</div>`,
      (r) => r.querySelector('#back')?.addEventListener('click', () => location.reload()),
    );
  }

  // Khung chính: dựng một lần cho mỗi Workspace + người dùng.
  screen(`shell|${s.wsId}|${s.user.uid}`, shellHtml(), (r) => {
    bindShell(r, {
      onSearch: (v) => {
        setUi({ search: v.trim().toLowerCase() });
        if (currentPage() !== 'tasks') navigate('tasks');
      },
      navigate,
    });
  });

  let page = currentPage();
  if (!pageAllowed(page, s.me)) {
    page = 'overview';
    if (location.hash !== '#/overview') location.hash = '#/overview';
  }
  updateShell(root, page);
  document.title = `${PAGES.find((p) => p.id === page)?.label || 'Crew'} – Crew`;
  const content = root.querySelector('#content');
  const mod = PAGE_MAP[page];
  const markup = toString(mod.render());
  if (markup !== lastContentHtml || content.dataset.page !== page) {
    const changedPage = content.dataset.page !== page;
    if (changedPage) PAGE_MAP[content.dataset.page]?.leave?.(); // dọn listener của trang vừa rời
    const scroll = content.parentElement.scrollTop;
    content.innerHTML = markup;
    content.dataset.page = page;
    lastContentHtml = markup;
    mod.bind(content, {
      openTask: openTaskDrawer,
      navigate,
      rerender: () => {
        lastContentHtml = '';
        render();
      },
    });
    if (changedPage) {
      content.focus({ preventScroll: true });
      window.scrollTo(0, 0);
    } else content.parentElement.scrollTop = scroll;
  }
  syncDrawerWithState();
}

subscribe(render);
window.addEventListener('hashchange', () => {
  closeTaskDrawer(); // đổi trang thì đóng ngăn chi tiết để không đè lên trang mới
  lastContentHtml = '';
  render();
});

// Đăng nhập / đăng xuất
let lastUid = null;
onAuth((u) => {
  if (!u) {
    lastUid = null;
    autoOpened = false;
    stopUser();
    resetAll();
    return;
  }
  const user = { uid: u.uid, email: (u.email || '').toLowerCase(), displayName: u.displayName || '', emailVerified: u.emailVerified };
  if (lastUid && lastUid !== u.uid) {
    stopUser();
    autoOpened = false;
  }
  setState({ authReady: true, user });
  if (user.emailVerified && lastUid !== u.uid) {
    lastUid = u.uid;
    startUser(u.uid);
    refreshInvites();
  } else if (!user.emailVerified) {
    lastUid = u.uid;
  }
});

// Cảnh báo khi rời trang trong lúc tiêu đề/mô tả chưa kịp tự lưu.
window.addEventListener('beforeunload', (e) => {
  if (hasUnsavedDrawerChanges()) e.preventDefault();
});

// Lỗi không bắt được: chỉ báo thông điệp chung, không lộ chi tiết kỹ thuật.
window.addEventListener('unhandledrejection', (e) => {
  if (import.meta.env.DEV) console.error('[Crew] unhandled', e.reason);
  toast('Đã xảy ra lỗi không mong muốn. Vui lòng thử lại.', 'error');
});
window.addEventListener('error', (e) => {
  if (import.meta.env.DEV) console.error('[Crew] error', e.error || e.message);
});
export { PAGES };
