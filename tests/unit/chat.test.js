import { describe, it, expect, vi } from 'vitest';
import { channelsFor, canChat, validateMessage, isUnread, unreadChannelIds, layoutMessages, linkify, timeLabel, MESSAGE_MAX } from '../../src/domain/chat.js';

const units = [
  { id: 'A', name: 'Ban Sự kiện' },
  { id: 'B', name: 'Ban Học thuật' },
];
const ts = (iso) => ({ toDate: () => new Date(iso), seconds: Date.parse(iso) / 1000 });

describe('chat – kênh theo quyền (khớp Rules)', () => {
  it('thành viên không thuộc Ban chỉ có kênh chung', () => {
    expect(channelsFor({ role: 'member', unitIds: [] }, units).map((c) => c.id)).toEqual(['general']);
  });
  it('Trưởng Ban / giảng viên có kênh chung + kênh Ban của mình', () => {
    expect(channelsFor({ role: 'manager', unitIds: ['B'] }, units).map((c) => c.id)).toEqual(['general', 'B']);
    expect(canChat({ role: 'lecturer', unitIds: ['A'] }, 'B', units)).toBe(false);
  });
  it('Owner có mọi kênh; Approver không tự động có kênh Ban', () => {
    expect(channelsFor({ role: 'owner', unitIds: [] }, units)).toHaveLength(3);
    expect(channelsFor({ role: 'approver', unitIds: [] }, units)).toHaveLength(1);
  });
  it('Ban đã xóa không còn kênh; chưa có hồ sơ thành viên → không có kênh', () => {
    expect(channelsFor({ role: 'manager', unitIds: ['X'] }, units).map((c) => c.id)).toEqual(['general']);
    expect(channelsFor(null, units)).toEqual([]);
  });
});

describe('chat – kiểm tra tin nhắn', () => {
  it('cắt khoảng trắng, chuẩn hóa xuống dòng', () => {
    expect(validateMessage('  xin chào\r\nmọi người  ')).toBe('xin chào\nmọi người');
  });
  it('từ chối rỗng, toàn khoảng trắng, sai kiểu, quá dài', () => {
    expect(() => validateMessage('')).toThrow(/trống/);
    expect(() => validateMessage('   \n ')).toThrow(/trống/);
    expect(() => validateMessage(null)).toThrow(/trống/);
    expect(() => validateMessage(123)).toThrow(/trống/);
    expect(() => validateMessage('a'.repeat(MESSAGE_MAX + 1))).toThrow(/tối đa/);
    expect(validateMessage('a'.repeat(MESSAGE_MAX))).toHaveLength(MESSAGE_MAX);
  });
});

describe('chat – chưa đọc', () => {
  it('tin của người khác mới hơn mốc đọc → chưa đọc', () => {
    expect(isUnread({ at: 200, authorUid: 'x' }, 100, 'me')).toBe(true);
    expect(isUnread({ at: 100, authorUid: 'x' }, 100, 'me')).toBe(false);
  });
  it('tin của chính mình, kênh trống, chưa có mốc đọc → không báo', () => {
    expect(isUnread({ at: 200, authorUid: 'me' }, 100, 'me')).toBe(false);
    expect(isUnread(null, 100, 'me')).toBe(false);
    expect(isUnread({ at: 200, authorUid: 'x' }, undefined, 'me')).toBe(false);
    expect(isUnread({ at: null, authorUid: 'x' }, 100, 'me')).toBe(false);
  });
  it('liệt kê kênh chưa đọc', () => {
    const ch = [{ id: 'general' }, { id: 'A' }, { id: 'B' }];
    const latest = { general: { at: 50, authorUid: 'x' }, A: { at: 300, authorUid: 'x' }, B: { at: 300, authorUid: 'me' } };
    expect(unreadChannelIds(ch, latest, { general: 100, A: 100, B: 100 }, 'me')).toEqual(['A']);
  });
});

describe('chat – bố cục hiển thị', () => {
  const msgs = [
    { id: '3', authorUid: 'a', text: 'c', createdAt: ts('2026-11-03T09:03:00') },
    { id: '1', authorUid: 'a', text: 'a', createdAt: ts('2026-11-02T08:00:00') },
    { id: '2', authorUid: 'a', text: 'b', createdAt: ts('2026-11-03T09:00:00') },
    { id: '4', authorUid: 'b', text: 'd', createdAt: ts('2026-11-03T09:04:00') },
    { id: '5', authorUid: 'b', text: 'e', createdAt: ts('2026-11-03T09:20:00') },
    { id: '6', authorUid: 'me', text: 'f', createdAt: null }, // đang gửi: xếp cuối
  ];
  // Tin đang gửi (createdAt null) lấy ngày hiện tại → cố định đồng hồ để bài test không phụ thuộc ngày chạy.
  vi.useFakeTimers({ now: new Date('2026-11-03T12:00:00'), toFake: ['Date'] });
  const out = layoutMessages(msgs, 'me');
  vi.useRealTimers();
  it('sắp cũ → mới và chèn mốc ngày', () => {
    expect(out.filter((x) => x.type === 'day').map((x) => x.label)).toEqual(['02/11/2026', '03/11/2026']);
    expect(out.filter((x) => x.type === 'msg').map((x) => x.msg.id)).toEqual(['1', '2', '3', '4', '5', '6']);
  });
  it('gộp tin liên tiếp ≤ 5 phút của cùng người; tách khi đổi người, qua ngày hoặc cách xa', () => {
    const head = Object.fromEntries(out.filter((x) => x.type === 'msg').map((x) => [x.msg.id, x.head]));
    // 2→3: cùng người, 3 phút → gộp; 4: đổi người; 5: cách 16 phút; 2: sang ngày mới
    expect(head).toEqual({ 1: true, 2: true, 3: false, 4: true, 5: true, 6: true });
    const close = layoutMessages(
      [
        { id: 'x', authorUid: 'a', createdAt: ts('2026-11-03T09:00:00') },
        { id: 'y', authorUid: 'a', createdAt: ts('2026-11-03T09:04:59') },
      ],
      'me',
    ).filter((x) => x.type === 'msg');
    expect(close.map((x) => x.head)).toEqual([true, false]);
  });
  it('đánh dấu tin của tôi; giờ hiển thị và trạng thái đang gửi', () => {
    expect(out.find((x) => x.msg?.id === '6').mine).toBe(true);
    expect(timeLabel(ts('2026-11-03T09:05:00'))).toBe('09:05');
    expect(timeLabel(null)).toBe('Đang gửi…');
  });
});

describe('chat – linkify an toàn', () => {
  it('chỉ nhận https, bỏ dấu câu cuối', () => {
    expect(linkify('Xem https://drive.google.com/x?a=1. Cảm ơn')).toEqual([{ text: 'Xem ' }, { url: 'https://drive.google.com/x?a=1' }, { text: '. Cảm ơn' }]);
  });
  it('không tạo liên kết cho http, javascript:, data:', () => {
    for (const t of ['http://a.vn', 'javascript:alert(1)', 'data:text/html,<b>x</b>']) expect(linkify(t).some((p) => p.url)).toBe(false);
  });
  it('văn bản thường và nhiều liên kết', () => {
    expect(linkify('không có link')).toEqual([{ text: 'không có link' }]);
    expect(linkify('https://a.vn và https://b.vn').filter((p) => p.url)).toHaveLength(2);
  });
});
