// Nghiệp vụ trao đổi (chat): kênh theo quyền, kiểm tra tin nhắn, chưa đọc, gom nhóm hiển thị.
import { LIMITS } from './constants.js';
import { toDate, toIso, fmtDate } from './dates.js';

export const GENERAL = 'general';
export const MESSAGE_MAX = LIMITS.message;
/** Hai tin liên tiếp của cùng một người cách nhau tối đa bấy nhiêu phút thì gộp chung một khối. */
export const GROUP_MINUTES = 5;

/**
 * Các kênh tôi được tham gia: "Toàn Workspace" cho mọi thành viên; kênh của Ban cho thành viên Ban đó
 * (Owner thấy mọi Ban). Khớp với firestore.rules (match /chats/{chatId}/messages).
 * @returns {{id:string, name:string, kind:'general'|'unit'}[]}
 */
export function channelsFor(me, units) {
  if (!me) return [];
  const mine = me.role === 'owner' ? units : units.filter((u) => (me.unitIds || []).includes(u.id));
  return [{ id: GENERAL, name: 'Toàn Workspace', kind: 'general' }, ...mine.map((u) => ({ id: u.id, name: u.name, kind: 'unit' }))];
}

export function canChat(me, chatId, units) {
  return channelsFor(me, units).some((c) => c.id === chatId);
}

/** Làm sạch nội dung: bỏ khoảng trắng đầu/cuối, chuẩn hóa xuống dòng. Trả về chuỗi hợp lệ hoặc ném lỗi. */
export function validateMessage(text) {
  const t = typeof text === 'string' ? text.replace(/\r\n?/g, '\n').trim() : '';
  if (!t) throw new MessageError('Tin nhắn đang trống.');
  if (t.length > MESSAGE_MAX) throw new MessageError(`Tin nhắn tối đa ${MESSAGE_MAX} ký tự (hiện ${t.length}).`);
  return t;
}
export class MessageError extends Error {
  constructor(m) {
    super(m);
    this.name = 'MessageError';
    this.fields = { text: m };
  }
}

const ms = (ts) => toDate(ts)?.getTime() ?? null;

/** Thời điểm tin mới nhất của kênh (ms) hoặc null. */
export function latestInfo(msg) {
  return msg ? { at: ms(msg.createdAt), authorUid: msg.authorUid } : null;
}

/**
 * Kênh có tin mới chưa đọc không: tin mới nhất không phải của tôi và mới hơn mốc đã đọc.
 * Chưa có mốc đọc → coi như đã đọc (không báo "chưa đọc" cho lịch sử cũ khi mới tham gia).
 */
export function isUnread(latest, lastReadMs, myUid) {
  if (!latest || latest.at == null || latest.authorUid === myUid) return false;
  if (lastReadMs == null) return false;
  return latest.at > lastReadMs;
}

export function unreadChannelIds(channels, latestMap, readMap, myUid) {
  return channels.filter((c) => isUnread(latestMap[c.id], readMap[c.id], myUid)).map((c) => c.id);
}

/**
 * Chuẩn bị hiển thị: sắp xếp cũ → mới, chèn mốc ngày, gộp tin liên tiếp của cùng người.
 * @returns {{type:'day', label:string, key:string}|{type:'msg', msg:object, head:boolean, mine:boolean}[]}
 */
export function layoutMessages(messages, myUid) {
  const sorted = [...messages].sort((a, b) => (ms(a.createdAt) ?? Infinity) - (ms(b.createdAt) ?? Infinity) || a.id.localeCompare(b.id));
  const out = [];
  let prev = null;
  let prevDay = '';
  for (const m of sorted) {
    const d = toDate(m.createdAt) || new Date();
    const day = toIso(d);
    if (day !== prevDay) {
      out.push({ type: 'day', label: fmtDate(day), key: `day-${day}` });
      prevDay = day;
      prev = null;
    }
    const sameBlock = prev && prev.authorUid === m.authorUid && d.getTime() - (toDate(prev.createdAt)?.getTime() ?? 0) <= GROUP_MINUTES * 60_000;
    out.push({ type: 'msg', msg: m, head: !sameBlock, mine: m.authorUid === myUid });
    prev = m;
  }
  return out;
}

export function timeLabel(ts) {
  const d = toDate(ts);
  if (!d) return 'Đang gửi…';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * Tách văn bản thành các đoạn {text} / {url}. Chỉ nhận liên kết https:// — không bao giờ tạo href từ chuỗi khác.
 * Dấu câu cuối (. , ; : ! ? ) ) không thuộc liên kết.
 */
export function linkify(text) {
  const parts = [];
  const re = /https:\/\/[^\s<>"']+/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    let url = m[0];
    const trail = url.match(/[.,;:!?)\]]+$/)?.[0] || '';
    if (trail) url = url.slice(0, -trail.length);
    if (m.index > last) parts.push({ text: text.slice(last, m.index) });
    try {
      const u = new URL(url);
      if (u.protocol === 'https:' && u.hostname) parts.push({ url });
      else parts.push({ text: url });
    } catch {
      parts.push({ text: url });
    }
    last = m.index + url.length;
    re.lastIndex = last;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}
