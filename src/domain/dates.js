// Ngày nghiệp vụ (Deadline, ngày tổ chức) lưu dạng chuỗi 'YYYY-MM-DD' theo giờ địa phương
// để tránh lệch múi giờ; thời điểm hệ thống (createdAt...) dùng Firestore Timestamp.

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** @returns {boolean} chuỗi có phải ngày hợp lệ dạng YYYY-MM-DD */
export function isIsoDate(s) {
  if (typeof s !== 'string') return false;
  const m = ISO_DATE.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(y, mo - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d;
}

/** Ngày hôm nay (giờ địa phương) dạng YYYY-MM-DD. */
export function todayIso(now = new Date()) {
  return toIso(now);
}

export function toIso(dt) {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseIso(s) {
  if (!isIsoDate(s)) return null;
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** 'YYYY-MM-DD' -> 'DD/MM/YYYY'; rỗng -> 'Chưa đặt'. */
export function fmtDate(s) {
  if (!isIsoDate(s)) return 'Chưa đặt';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}

/** Số ngày từ a đến b (b - a), làm tròn theo ngày lịch. */
export function daysBetween(a, b) {
  const da = typeof a === 'string' ? parseIso(a) : a;
  const db = typeof b === 'string' ? parseIso(b) : b;
  if (!da || !db) return null;
  const ua = Date.UTC(da.getFullYear(), da.getMonth(), da.getDate());
  const ub = Date.UTC(db.getFullYear(), db.getMonth(), db.getDate());
  return Math.round((ub - ua) / 86_400_000);
}

export function addDays(iso, n) {
  const d = parseIso(iso);
  if (!d) return null;
  d.setDate(d.getDate() + n);
  return toIso(d);
}

/** Chuyển Firestore Timestamp | Date | millis -> Date (hoặc null). */
export function toDate(ts) {
  if (!ts) return null;
  if (ts instanceof Date) return ts;
  if (typeof ts.toDate === 'function') return ts.toDate();
  if (typeof ts === 'number') return new Date(ts);
  if (typeof ts.seconds === 'number') return new Date(ts.seconds * 1000);
  return null;
}

/** Thời gian tương đối ngắn gọn cho feed hoạt động. */
export function relativeTime(ts, now = new Date()) {
  const d = toDate(ts);
  if (!d) return 'Đang lưu…';
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60) return 'Vừa xong';
  if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`;
  const days = Math.floor(diff / 86400);
  if (days === 1) return 'Hôm qua';
  if (days < 30) return `${days} ngày trước`;
  return fmtDate(toIso(d));
}

/**
 * Lưới tháng cho lịch, bắt đầu từ Thứ Hai.
 * @returns {{iso:string, day:number, inMonth:boolean}[]} 35 hoặc 42 ô
 */
export function monthGrid(year, month /* 0-11 */) {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7; // T2 = 0
  const start = new Date(year, month, 1 - offset);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = Math.ceil((offset + daysInMonth) / 7) * 7;
  const out = [];
  for (let i = 0; i < cells; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    out.push({ iso: toIso(d), day: d.getDate(), inMonth: d.getMonth() === month });
  }
  return out;
}
