// Trao đổi: kênh "Toàn Workspace" + kênh riêng của từng Ban (theo quyền).
// Khung trang (danh sách kênh, ô soạn tin) chỉ phụ thuộc vào danh sách kênh → main.js không dựng lại khi có tin mới,
// nên nội dung đang gõ không bị mất. Danh sách tin nhắn và chấm "chưa đọc" được cập nhật riêng qua subscribe().
import { html, toString, avatar, confirmBox, run } from '../kit.js';
import { header, gate } from './common.js';
import { S, me, wsId, actor } from '../ctx.js';
import { subscribe, setUi, tracked } from '../../state/store.js';
import { channelsFor, layoutMessages, timeLabel, linkify, unreadChannelIds, MESSAGE_MAX } from '../../domain/chat.js';
import { openChatChannel, closeChatChannel, markChatRead } from '../../services/chatSync.js';
import * as repo from '../../services/repo.js';
import { safeHref } from '../../lib/html.js';

const PAGE_SIZE = 100;
let teardown = null;

function activeChannel(channels) {
  const want = S().ui.chatActive;
  return channels.find((c) => c.id === want) || channels[0];
}

function memberCount(ch) {
  const ms = S().members;
  if (ch.kind === 'general') return ms.length;
  return ms.filter((m) => m.role === 'owner' || (m.unitIds || []).includes(ch.id)).length;
}

function renderText(text) {
  return linkify(text).map((p) => (p.url ? html`<a href="${safeHref(p.url)}" target="_blank" rel="noopener noreferrer">${p.url}</a>` : p.text));
}

function messagesHtml(ch) {
  const s = S();
  if (s.chatError) return html`<div class="notice error" role="alert" style="margin:14px">Không tải được tin nhắn. ${s.chatError}</div>`;
  if (!s.chatLoaded) return html`<div class="loading" role="status">Đang tải tin nhắn…</div>`;
  if (!s.chatMessages.length)
    return html`<div class="empty"><b>Chưa có tin nhắn nào</b>Hãy mở đầu cuộc trao đổi trong ${ch.kind === 'general' ? 'kênh chung' : `kênh ${ch.name}`}.</div>`;
  const myUid = s.user.uid;
  const isOwner = s.me?.role === 'owner';
  const more = s.chatMessages.length >= s.ui.chatLimit;
  return html`${more ? html`<div class="chatmore"><button class="btn small" id="chatOlder">Tải tin cũ hơn</button></div>` : ''}
    ${layoutMessages(s.chatMessages, myUid).map((it) =>
      it.type === 'day'
        ? html`<div class="chatday" role="separator"><span>${it.label}</span></div>`
        : html`<div class="msg ${it.mine ? 'mine' : ''} ${it.head ? 'head' : ''}" data-msg="${it.msg.id}">
            ${it.head ? html`<div class="msgmeta">${avatar(it.msg.authorName)}<b>${it.mine ? 'Bạn' : it.msg.authorName}</b><time>${timeLabel(it.msg.createdAt)}</time></div>` : ''}
            <div class="bubble" title="${timeLabel(it.msg.createdAt)}"><p>${renderText(it.msg.text)}</p>${it.msg._pending ? html`<span class="sending">Đang gửi…</span>` : ''}
            ${it.mine || isOwner ? html`<button class="msgdel" data-del-msg="${it.msg.id}" aria-label="Xóa tin nhắn">✕</button>` : ''}</div></div>`,
    )}`;
}

export const chatPage = {
  render() {
    const g = gate('units', 'members');
    const head = header('Trao đổi', 'Kênh chung của cả Workspace và kênh riêng của từng Ban / CLB mà bạn tham gia.');
    if (g) return html`${head}${g}`;
    const channels = channelsFor(me(), S().units);
    const ch = activeChannel(channels);
    return html`${head}
    <div class="chat">
      <nav class="chatlist" aria-label="Kênh trao đổi">
        <div class="navlabel">Kênh</div>
        ${channels.map(
          (c) =>
            html`<button class="chatch" data-chat="${c.id}" ${c.id === ch.id ? html`aria-current="true"` : ''}><span class="ico" aria-hidden="true">${c.kind === 'general' ? '◎' : '#'}</span><span class="nm">${c.name}</span><span class="unread" data-unread="${c.id}" hidden aria-label="có tin mới">●</span></button>`,
        )}
        ${channels.length === 1 ? html`<p class="muted chatnote">Bạn chưa thuộc Ban nào nên chỉ có kênh chung. Owner có thể gán bạn vào Ban ở trang Thành viên.</p>` : ''}
      </nav>
      <section class="chatmain" aria-label="Kênh ${ch.name}">
        <header class="chathead"><b>${ch.kind === 'general' ? '◎' : '#'} ${ch.name}</b><span class="muted">${ch.kind === 'general' ? 'Mọi thành viên Workspace' : 'Thành viên của Ban'} · ${memberCount(ch)} người</span></header>
        <div class="chatmsgs" id="chatMsgs" role="log" aria-live="polite" aria-label="Tin nhắn" tabindex="0"></div>
        <button class="btn small chatnew" id="chatNew" hidden>Có tin mới ↓</button>
        <form class="chatcompose" id="chatForm" novalidate>
          <label class="sr-only" for="chatText">Tin nhắn tới ${ch.name}</label>
          <textarea class="input" id="chatText" name="text" rows="1" maxlength="${MESSAGE_MAX}" autocomplete="off" placeholder="Nhắn tới ${ch.name}…"></textarea>
          <button class="btn primary" type="submit" id="chatSend">Gửi</button>
        </form>
        <div class="chathint"><span class="err" id="chatErr" role="alert"></span><span class="muted" id="chatCount"></span><span class="muted keyhint">Enter để gửi · Shift+Enter xuống dòng</span></div>
      </section>
    </div>`;
  },

  bind(root) {
    teardown?.();
    const channels = channelsFor(me(), S().units);
    if (!channels.length || !root.querySelector('#chatMsgs')) return;
    const ch = activeChannel(channels);
    const list = root.querySelector('#chatMsgs');
    const text = root.querySelector('#chatText');
    const newBtn = root.querySelector('#chatNew');
    let lastSig = '';
    let loadingOlder = false;
    let forceBottom = true;

    const atBottom = () => list.scrollHeight - list.scrollTop - list.clientHeight < 60;
    const toBottom = () => {
      list.scrollTop = list.scrollHeight;
      newBtn.hidden = true;
    };
    const markRead = () => {
      const s = S();
      if (document.visibilityState !== 'visible' || s.chatMessagesFor !== ch.id) return;
      const latest = s.chatLatest[ch.id];
      if (latest?.at && atBottom()) markChatRead(ch.id, latest.at);
    };

    const update = () => {
      if (!root.isConnected || root.dataset.page !== 'chat') {
        teardown?.();
        return;
      }
      const s = S();
      openChatChannel(ch.id, s.ui.chatLimit); // không tạo lại nếu kênh/giới hạn không đổi
      // Chấm chưa đọc ở các kênh khác.
      const unread = new Set(unreadChannelIds(channels, s.chatLatest, s.chatRead, s.user.uid));
      root.querySelectorAll('[data-unread]').forEach((el) => (el.hidden = !unread.has(el.dataset.unread) || el.dataset.unread === ch.id));

      const sig = `${s.chatMessagesFor}|${s.chatLoaded}|${s.chatError}|${s.chatMessages.map((m) => `${m.id}${m._pending ? 'p' : ''}${m.createdAt?.seconds ?? ''}`).join(',')}`;
      if (sig === lastSig) return;
      const hadContent = lastSig !== '';
      lastSig = sig;
      const wasBottom = atBottom();
      const oldHeight = list.scrollHeight;
      const oldTop = list.scrollTop;
      list.innerHTML = toString(messagesHtml(ch));
      if (loadingOlder) {
        list.scrollTop = oldTop + (list.scrollHeight - oldHeight); // giữ nguyên vị trí đang đọc
        loadingOlder = false;
      } else if (forceBottom || wasBottom || !hadContent) {
        toBottom();
        if (s.chatLoaded) forceBottom = false;
      } else {
        newBtn.hidden = false;
      }
      markRead();
    };

    // Gửi tin
    const form = root.querySelector('#chatForm');
    const err = root.querySelector('#chatErr');
    const count = root.querySelector('#chatCount');
    const grow = () => {
      text.style.height = 'auto';
      text.style.height = `${Math.min(text.scrollHeight, 160)}px`;
      const n = text.value.length;
      count.textContent = n > MESSAGE_MAX - 200 ? `${n}/${MESSAGE_MAX}` : '';
    };
    const send = async () => {
      err.textContent = '';
      const value = text.value;
      if (!value.trim()) return;
      const btn = root.querySelector('#chatSend');
      const ok = await run(btn, () => tracked(repo.sendMessage(wsId(), actor(), ch.id, value)), {
        onError: (e) => {
          err.textContent = e.message; // giữ nguyên nội dung để người dùng gửi lại
          return true;
        },
      });
      if (ok) {
        if (text.value === value) text.value = '';
        grow();
        forceBottom = true;
        toBottom();
        text.focus();
      }
    };
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      send();
    });
    text.addEventListener('keydown', (e) => {
      // Bỏ qua Enter khi đang gõ dấu bằng bộ gõ (Telex/VNI): isComposing hoặc keyCode 229.
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) {
        e.preventDefault();
        send();
      }
    });
    text.addEventListener('input', grow);

    // Xóa tin, tải tin cũ, nhảy tới tin mới
    list.addEventListener('click', async (e) => {
      const del = e.target.closest('[data-del-msg]');
      if (del) {
        if (!(await confirmBox({ title: 'Xóa tin nhắn', message: 'Xóa tin nhắn này cho mọi người? Không thể hoàn tác.', confirmLabel: 'Xóa', danger: true })))
          return;
        await run(del, () => tracked(repo.deleteMessage(wsId(), ch.id, del.dataset.delMsg)), { ok: 'Đã xóa tin nhắn.' });
        return;
      }
      if (e.target.closest('#chatOlder')) {
        loadingOlder = true;
        setUi({ chatLimit: S().ui.chatLimit + PAGE_SIZE });
      }
    });
    list.addEventListener('scroll', () => {
      if (atBottom()) {
        newBtn.hidden = true;
        markRead();
      }
    });
    newBtn.addEventListener('click', toBottom);

    // Đổi kênh
    root.querySelectorAll('[data-chat]').forEach((b) =>
      b.addEventListener('click', () => {
        if (b.dataset.chat === ch.id) return;
        setUi({ chatActive: b.dataset.chat, chatLimit: PAGE_SIZE });
      }),
    );

    const onVisible = () => markRead();
    document.addEventListener('visibilitychange', onVisible);
    const unsub = subscribe(update);
    teardown = () => {
      unsub();
      document.removeEventListener('visibilitychange', onVisible);
      teardown = null;
    };
    update();
  },

  /** Rời trang Trao đổi: hủy listener kênh đang mở (giữ listener "tin mới nhất" cho chấm chưa đọc). */
  leave() {
    teardown?.();
    closeChatChannel();
  },
};
