// Quản lý listener realtime theo phiên đăng nhập và Workspace đang mở.
// - Không tạo listener trùng; hủy toàn bộ khi đổi Workspace / đăng xuất.
// - Listener công việc được tạo lại khi vai trò / Ban của tôi thay đổi.
// - Lỗi quyền không retry; lỗi mạng do SDK tự kết nối lại.
import { listen, refs, forgetMembership, findMyInvites } from './repo.js';
import { getState, setState, resetWorkspaceData } from '../state/store.js';
import { ErrorKind, logError } from './errors.js';
import { syncChatLatest, stopChat } from './chatSync.js';

let userUnsubs = [];
let wsUnsubs = [];
let taskUnsubs = [];
let taskScopeKey = '';
const meta = new Map(); // key -> {pending, cache}

function setMeta(key, m) {
  meta.set(key, { pending: m.hasPendingWrites, cache: m.fromCache });
  let pending = false;
  let cache = false;
  for (const v of meta.values()) {
    pending ||= v.pending;
    cache ||= v.cache;
  }
  const cur = getState().sync;
  if (cur.pendingWrites !== pending || cur.fromCache !== cache) setState({ sync: { ...cur, pendingWrites: pending, fromCache: cache } });
}

function onErr(key) {
  return (err) => {
    logError(`listener ${key}`, err);
    setState((s) => ({ errors: { ...s.errors, [key]: err.message }, loaded: { ...s.loaded, [key]: true } }));
  };
}

function stopAll(list) {
  for (const u of list) {
    try {
      u();
    } catch (e) {
      logError('unsubscribe', e);
    }
  }
  return [];
}

/** Bắt đầu các listener cấp người dùng (danh sách Workspace của tôi). */
export function startUser(uid) {
  userUnsubs = stopAll(userUnsubs);
  userUnsubs.push(
    listen(
      refs.memberships(uid),
      (list) => setState({ memberships: list.sort((a, b) => a.workspaceName.localeCompare(b.workspaceName, 'vi')), membershipsReady: true }),
      (err) => {
        onErr('memberships')(err);
        setState({ membershipsReady: true });
      },
    ),
  );
}

/** Tải lại các lời mời gửi tới email của tôi (truy vấn collection group, giới hạn 20). */
export async function refreshInvites() {
  const { user } = getState();
  if (!user?.email) return;
  try {
    const list = await findMyInvites(user.email);
    setState({ myInvites: list });
  } catch (e) {
    logError('findMyInvites', e);
    setState((s) => ({ errors: { ...s.errors, invites: e.message } }));
  }
}

export function stopUser() {
  userUnsubs = stopAll(userUnsubs);
  stopWorkspace();
}

export function stopWorkspace() {
  wsUnsubs = stopAll(wsUnsubs);
  taskUnsubs = stopAll(taskUnsubs);
  taskScopeKey = '';
  stopChat();
  meta.clear();
}

/** Mở Workspace: xóa dữ liệu cũ trước, rồi lắng nghe hồ sơ thành viên của tôi. */
export function openWorkspace(wsId) {
  stopWorkspace();
  resetWorkspaceData({ wsId });
  try {
    localStorage.setItem('crew.lastWs', wsId);
  } catch {
    /* localStorage không khả dụng (chế độ riêng tư) – bỏ qua, chỉ là tiện ích nhớ lựa chọn */
  }
  const uid = getState().user.uid;
  wsUnsubs.push(
    listen(
      refs.myMember(wsId, uid),
      (me, m) => {
        setMeta('me', m);
        if (!me) {
          // Bị xóa khỏi Workspace (hoặc Workspace không tồn tại).
          handleRemoved(wsId, uid);
          return;
        }
        const first = !getState().me;
        setState((s) => ({ me, loaded: { ...s.loaded, me: true } }));
        if (first) startWorkspaceListeners(wsId, me);
        restartTasksIfScopeChanged(wsId, me);
        syncChatLatest();
      },
      (err) => {
        onErr('me')(err);
        if (err.kind === ErrorKind.PERMISSION) handleRemoved(wsId, uid);
      },
    ),
  );
}

function handleRemoved(wsId, uid) {
  stopWorkspace();
  resetWorkspaceData({ wsId: null, errors: { workspace: 'Bạn không còn là thành viên của Workspace này.' } });
  forgetMembership(uid, wsId).catch((e) => logError('forgetMembership', e));
}

function startWorkspaceListeners(wsId, me) {
  const add = (key, ref, mapFn = (x) => x) =>
    wsUnsubs.push(
      listen(
        ref,
        (data, m) => {
          setMeta(key, m);
          setState((s) => ({ [key]: mapFn(data), loaded: { ...s.loaded, [key]: true }, errors: { ...s.errors, [key]: undefined } }));
          if (key === 'units') syncChatLatest();
        },
        onErr(key),
      ),
    );
  add('workspace', refs.workspace(wsId));
  add('members', refs.members(wsId), (l) => l.sort((a, b) => (a.displayName || '').localeCompare(b.displayName || '', 'vi')));
  add('units', refs.units(wsId));
  add('events', refs.events(wsId));
  add('approvals', refs.approvals(wsId));
  add('notices', refs.notices(wsId));
  add('docs', refs.docs(wsId));
  if (['owner', 'approver', 'manager'].includes(me.role)) add('budget', refs.budget(wsId));
  else setState((s) => ({ loaded: { ...s.loaded, budget: true } }));
  if (me.role === 'owner') add('wsInvites', refs.invites(wsId));
  else setState((s) => ({ loaded: { ...s.loaded, wsInvites: true } }));
}

/** Listener công việc theo phạm vi quyền; gộp kết quả nhiều truy vấn theo id. */
function restartTasksIfScopeChanged(wsId, me) {
  const key = `${me.role}|${(me.unitIds || []).join(',')}`;
  if (key === taskScopeKey) return;
  taskScopeKey = key;
  taskUnsubs = stopAll(taskUnsubs);
  const queries = refs.tasksFor(wsId, me);
  const parts = queries.map(() => null);
  const merge = () => {
    if (parts.some((p) => p === null)) return;
    const map = new Map();
    for (const p of parts) for (const t of p) map.set(t.id, t);
    setState((s) => ({ tasks: [...map.values()], loaded: { ...s.loaded, tasks: true }, errors: { ...s.errors, tasks: undefined } }));
  };
  queries.forEach((q, i) => {
    taskUnsubs.push(
      listen(
        q,
        (list, m) => {
          setMeta(`tasks${i}`, m);
          parts[i] = list;
          merge();
        },
        onErr('tasks'),
      ),
    );
  });
}

/** Listener chi tiết công việc (bình luận + lịch sử) – chỉ sống khi khung chi tiết đang mở. */
export function listenTaskDetail(wsId, taskId, onComments, onActivity, onError) {
  const a = listen(refs.comments(wsId, taskId), onComments, onError);
  const b = listen(refs.activity(wsId, taskId), onActivity, onError);
  return () => {
    a();
    b();
  };
}

if (typeof window !== 'undefined') {
  const upd = () => setState((s) => ({ sync: { ...s.sync, online: navigator.onLine } }));
  window.addEventListener('online', upd);
  window.addEventListener('offline', upd);
}
