// Template HTML an toàn: mọi giá trị nội suy đều được escape, trừ khi bọc bằng raw().
// Đây là lớp chống XSS chính vì dữ liệu Firestore do người dùng nhập.

const RAW = Symbol('raw');
const MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };

export function escapeHtml(v) {
  return String(v ?? '').replace(/[&<>"'`]/g, (c) => MAP[c]);
}

/** Đánh dấu chuỗi HTML đã an toàn (chỉ dùng cho HTML do chính code tạo). */
export function raw(s) {
  return { [RAW]: true, value: String(s ?? '') };
}

function render(v) {
  if (v === null || v === undefined || v === false) return '';
  if (Array.isArray(v)) return v.map(render).join('');
  if (typeof v === 'object' && v[RAW]) return v.value;
  return escapeHtml(v);
}

/** html`<b>${userText}</b>` → escape userText. Kết quả là raw để lồng nhau được. */
export function html(strings, ...values) {
  let out = '';
  strings.forEach((s, i) => {
    out += s;
    if (i < values.length) out += render(values[i]);
  });
  return raw(out);
}

export function toString(fragment) {
  return render(fragment);
}

/** Chỉ cho phép link https trong href. */
export function safeHref(url) {
  try {
    const u = new URL(String(url));
    return u.protocol === 'https:' ? u.href : '#';
  } catch {
    return '#';
  }
}
