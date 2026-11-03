// Listener cho chat.
// - "Tin mới nhất" của mỗi kênh tôi được tham gia (limit 1) → chấm chưa đọc ở sidebar. Dựng lại khi danh sách kênh đổi.
// - Kênh đang mở: N tin gần nhất (mặc định 100), chỉ sống khi trang Trao đổi đang hiển thị.
import { listen, refs } from './repo.js';
import { getState, setState } from '../state/store.js';
import { logError } from './errors.js';
import { channelsFor, latestInfo } from '../domain/chat.js';

let latestUnsubs = [];
let latestKey = '';
let active = null; // { key, unsub }

const readKey = (ws, uid) => `khoaflow.chatRead.${ws}.${uid}`;

function loadRead(ws, uid) {
  try {
    const v = JSON.parse(localStorage.getItem(readKey(ws, uid)) || '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {}; // localStorage bị chặn hoặc dữ liệu hỏng: coi như chưa có mốc đọc
  }
}

function saveRead(ws, uid, map) {
  try {
    localStorage.setItem(readKey(ws, uid), JSON.stringify(map));
  } catch {
    /* không lưu được mốc đọc: chỉ ảnh hưởng chấm "chưa đọc" trên máy này */
  }
}

/** Đánh dấu đã đọc kênh tới thời điểm atMs (không lùi mốc). */
export function markChatRead(chatId, atMs = Date.now()) {
  const { wsId, user, chatRead } = getState();
  if (!wsId || !user) return;
  if ((chatRead[chatId] ?? 0) >= atMs) return;
  const next = { ...chatRead, [chatId]: atMs };
  saveRead(wsId, user.uid, next);
  setState({ chatRead: next });
}

function stopList(list) {
  for (const u of list) {
    try {
      u();
    } catch (e) {
      logError('chat unsubscribe', e);
    }
  }
  return [];
}

/** Gọi khi hồ sơ thành viên hoặc danh sách Ban thay đổi. */
export function syncChatLatest() {
  const { wsId, me, units, user, loaded } = getState();
  if (!wsId || !me || !loaded.units) return;
  const channels = channelsFor(me, units);
  const key = `${wsId}|${channels.map((c) => c.id).join(',')}`;
  if (key === latestKey) return;
  const firstForWs = !latestKey.startsWith(`${wsId}|`);
  latestKey = key;
  latestUnsubs = stopList(latestUnsubs);
  if (firstForWs) setState({ chatRead: loadRead(wsId, user.uid), chatLatest: {} });
  for (const c of channels) {
    latestUnsubs.push(
      listen(
        refs.chatLatest(wsId, c.id),
        (list) => {
          const info = latestInfo(list[0]);
          // Lần đầu thấy kênh trên máy này: lấy mốc hiện tại làm "đã đọc" để không báo lịch sử cũ là tin mới.
          if (getState().chatRead[c.id] == null) markChatRead(c.id, info?.at ?? Date.now());
          setState((s) => ({ chatLatest: { ...s.chatLatest, [c.id]: info } }));
        },
        (err) => logError(`chat latest ${c.id}`, err),
      ),
    );
  }
}

/** Mở (hoặc đổi) kênh đang xem. Không tạo listener trùng nếu kênh và giới hạn không đổi. */
export function openChatChannel(chatId, n) {
  const { wsId } = getState();
  const key = `${wsId}|${chatId}|${n}`;
  if (active?.key === key) return;
  const sameChannel = active && getState().chatMessagesFor === chatId;
  closeChatChannel({ keepMessages: sameChannel });
  setState({ chatMessagesFor: chatId, chatError: null, ...(sameChannel ? {} : { chatMessages: [], chatLoaded: false }) });
  const unsub = listen(
    refs.chatMessages(wsId, chatId, n),
    (list) => setState({ chatMessages: list, chatLoaded: true, chatError: null }),
    (err) => {
      logError(`chat ${chatId}`, err);
      setState({ chatError: err.message, chatLoaded: true });
    },
    { pendingFlag: true },
  );
  active = { key, unsub };
}

export function closeChatChannel({ keepMessages = false } = {}) {
  if (active) {
    try {
      active.unsub();
    } catch (e) {
      logError('chat close', e);
    }
  }
  active = null;
  if (!keepMessages && getState().chatMessagesFor) setState({ chatMessagesFor: null, chatMessages: [], chatLoaded: false });
}

export function stopChat() {
  latestUnsubs = stopList(latestUnsubs);
  latestKey = '';
  closeChatChannel();
}
