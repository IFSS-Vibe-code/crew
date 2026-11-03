// Kho trạng thái tối giản: một object + pub/sub. Render được gom theo requestAnimationFrame.

/** Kiểu xem công việc được nhớ trên máy (chỉ là tiện ích, không phải dữ liệu nghiệp vụ). */
function savedView() {
  try {
    const v = localStorage.getItem('crew.taskView');
    return v === 'board' ? 'board' : 'list';
  } catch {
    return 'list';
  }
}

const initial = () => ({
  authReady: false,
  user: null, // { uid, email, displayName, emailVerified }
  memberships: [],
  membershipsReady: false,
  myInvites: [],
  wsId: null,
  workspace: null,
  me: null,
  members: [],
  units: [],
  tasks: [],
  events: [],
  approvals: [],
  notices: [],
  budget: [],
  docs: [],
  wsInvites: [],
  // Chat: tin mới nhất từng kênh, tin của kênh đang mở, mốc đã đọc (lưu trên máy).
  chatLatest: {},
  chatMessages: [],
  chatMessagesFor: null,
  chatLoaded: false,
  chatError: null,
  chatRead: {},
  loaded: {},
  errors: {},
  sync: { pendingWrites: false, fromCache: false, online: typeof navigator === 'undefined' ? true : navigator.onLine },
  savingCount: 0,
  ui: {
    taskView: savedView(),
    taskFilters: { status: 'Tất cả', unitId: '', priority: '', type: '', assignee: '' },
    search: '',
    calendarMonth: null,
    calendarFilters: { task: true, event: true, notice: true },
    openTaskId: null,
    chatActive: 'general',
    chatLimit: 100,
  },
});

let state = initial();
const subs = new Set();
let scheduled = false;

export function getState() {
  return state;
}

export function setState(patch) {
  state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
  schedule();
}

export function setUi(patch) {
  if (patch.taskView) {
    try {
      localStorage.setItem('crew.taskView', patch.taskView);
    } catch {
      /* bị chặn (chế độ riêng tư): chỉ mất tính năng nhớ kiểu xem */
    }
  }
  setState((s) => ({ ui: { ...s.ui, ...patch } }));
}

/** Xóa toàn bộ dữ liệu Workspace (khi đổi Workspace / đăng xuất) để không lộ dữ liệu người trước. */
export function resetWorkspaceData(extra = {}) {
  const fresh = initial();
  setState((s) => ({
    ...fresh,
    authReady: s.authReady,
    user: s.user,
    memberships: s.memberships,
    membershipsReady: s.membershipsReady,
    myInvites: s.myInvites,
    sync: s.sync,
    ...extra,
  }));
}

export function resetAll() {
  state = { ...initial(), authReady: true };
  schedule();
}

export function subscribe(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}

function schedule() {
  if (scheduled) return;
  scheduled = true;
  const run = () => {
    scheduled = false;
    for (const fn of subs) fn(state);
  };
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
  else queueMicrotask(run);
}

/** Theo dõi số thao tác ghi đang chờ server xác nhận (hiển thị "Đang lưu…"). */
export async function tracked(promise) {
  setState((s) => ({ savingCount: s.savingCount + 1 }));
  try {
    return await promise;
  } finally {
    setState((s) => ({ savingCount: Math.max(0, s.savingCount - 1) }));
  }
}
