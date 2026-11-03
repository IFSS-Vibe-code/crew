// Thành phần UI dùng chung: toast, modal, định dạng nhỏ.
import { html, raw, toString, escapeHtml } from '../lib/html.js';
import { effectiveStatus } from '../domain/tasks.js';

export { html, raw, toString, escapeHtml };

let toastTimer;
export function toast(msg, kind = 'ok') {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = `toast show ${kind === 'error' ? 'error' : ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), kind === 'error' ? 6000 : 3000);
}

const PILL = {
  'Hoàn thành': 'p-green',
  'Đã duyệt': 'p-green',
  'Đã hoàn tất': 'p-green',
  'Đã phân công': 'p-green',
  'Quá hạn': 'p-red',
  'Từ chối': 'p-red',
  'Cần bổ sung': 'p-red',
  'Chờ phê duyệt': 'p-amber',
  'Chờ nghiệm thu': 'p-amber',
  'Chờ duyệt': 'p-amber',
  'Chờ xử lý': 'p-amber',
  'Mới tiếp nhận': 'p-amber',
  'Cần đăng ký': 'p-amber',
  'Chờ phân công': 'p-amber',
  'Đề xuất': 'p-amber',
  'Đang thực hiện': 'p-blue',
  'Đang chuẩn bị': 'p-blue',
  'Đang tổ chức': 'p-blue',
  'Đang sử dụng': 'p-blue',
  'Chuẩn bị có điều kiện': 'p-purple',
  'Tổng kết': 'p-purple',
  Nháp: 'p-gray',
  'Chưa bắt đầu': 'p-gray',
  'Tạm hoãn/Hủy': 'p-gray',
  'Lưu trữ': 'p-gray',
};
export const pill = (s) => html`<span class="pill ${PILL[s] || 'p-gray'}">${s}</span>`;
export const taskPill = (t) => pill(effectiveStatus(t));

export function initials(name) {
  const parts = String(name || '?')
    .trim()
    .split(/\s+/);
  return (parts.length > 1 ? parts[parts.length - 2][0] + parts[parts.length - 1][0] : parts[0].slice(0, 2)).toUpperCase();
}
export const avatar = (name) => html`<span class="miniav" aria-hidden="true">${initials(name)}</span>`;

export function options(list, selected, { empty = null } = {}) {
  const items = list.map((o) => (typeof o === 'string' ? { v: o, l: o } : o));
  return [
    empty !== null ? html`<option value="">${empty}</option>` : '',
    ...items.map((o) => html`<option value="${o.v}" ${o.v === selected ? raw('selected') : ''}>${o.l}</option>`),
  ];
}

export function emptyState(title, text = '') {
  return html`<div class="empty"><b>${title}</b>${text}</div>`;
}

/**
 * Mở hộp thoại. Trả về { el, close }. Bẫy phím Tab, đóng bằng Esc, trả focus khi đóng.
 */
export function openModal({ title, body, footer, onClose, wide = false }) {
  const opener = document.activeElement;
  const back = document.createElement('div');
  back.className = 'modalback';
  back.innerHTML =
    toString(html`<div class="modal" role="dialog" aria-modal="true" aria-labelledby="mtitle" ${wide ? raw('style="width:min(760px,100%)"') : ''}>
    <div class="modalhead"><h2 id="mtitle">${title}</h2><button class="iconbtn" data-close aria-label="Đóng">✕</button></div>
    <div class="modalbody">${body}</div>${footer ? html`<div class="modalfoot">${footer}</div>` : ''}</div>`);
  document.body.appendChild(back);
  const modal = back.querySelector('.modal');
  const focusables = () => [...modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((e) => !e.disabled);
  const close = () => {
    document.removeEventListener('keydown', onKey, true);
    back.remove();
    if (opener && document.contains(opener)) opener.focus();
    onClose?.();
  };
  function onKey(e) {
    if (!document.body.contains(back)) return;
    // Chỉ xử lý nếu đây là modal trên cùng
    const all = document.querySelectorAll('.modalback');
    if (all[all.length - 1] !== back) return;
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    } else if (e.key === 'Tab') {
      const f = focusables();
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }
  document.addEventListener('keydown', onKey, true);
  back.addEventListener('mousedown', (e) => {
    if (e.target === back) close();
  });
  back.querySelector('[data-close]').addEventListener('click', close);
  const first = modal.querySelector('input, select, textarea') || modal.querySelector('button');
  first?.focus();
  return { el: modal, close };
}

/** Hộp xác nhận (thay cho confirm() của trình duyệt). */
export function confirmBox({ title, message, confirmLabel = 'Xác nhận', danger = false }) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => {
      if (!done) {
        done = true;
        resolve(v);
      }
    };
    const m = openModal({
      title,
      body: html`<p style="margin:0;line-height:1.55">${message}</p>`,
      footer: html`<button class="btn" data-no>Hủy</button><button class="btn ${danger ? 'danger' : 'primary'}" data-yes>${confirmLabel}</button>`,
      onClose: () => finish(false),
    });
    m.el.querySelector('[data-no]').addEventListener('click', () => m.close());
    m.el.querySelector('[data-yes]').addEventListener('click', () => {
      finish(true);
      m.close();
    });
  });
}

/** Hộp nhập lý do (dùng cho trả hồ sơ / từ chối). */
export function promptBox({ title, label, placeholder = '', confirmLabel = 'Gửi', required = true }) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => {
      if (!done) {
        done = true;
        resolve(v);
      }
    };
    const m = openModal({
      title,
      body: html`<div class="field"><label for="pb">${label}</label><textarea class="input" id="pb" rows="4" maxlength="2000" placeholder="${placeholder}"></textarea><div class="err" id="pberr" role="alert"></div></div>`,
      footer: html`<button class="btn" data-no>Hủy</button><button class="btn primary" data-yes>${confirmLabel}</button>`,
      onClose: () => finish(null),
    });
    m.el.querySelector('[data-no]').addEventListener('click', () => m.close());
    m.el.querySelector('[data-yes]').addEventListener('click', () => {
      const v = m.el.querySelector('#pb').value.trim();
      if (required && !v) {
        m.el.querySelector('#pberr').textContent = 'Vui lòng nhập nội dung.';
        return;
      }
      finish(v);
      m.close();
    });
  });
}

/** Hiển thị lỗi theo trường từ ValidationError vào form. */
export function showFieldErrors(root, fields) {
  root.querySelectorAll('.err[data-for]').forEach((e) => (e.textContent = ''));
  let firstEl = null;
  for (const [k, msg] of Object.entries(fields || {})) {
    const slot = root.querySelector(`.err[data-for="${k}"]`);
    if (slot) slot.textContent = msg;
    firstEl ||= root.querySelector(`[name="${k}"]`);
  }
  firstEl?.focus();
}

export const errSlot = (name) => html`<div class="err" data-for="${name}" role="alert"></div>`;

export function formData(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === 'checkbox') out[el.name] = el.checked;
    else if (el.multiple) out[el.name] = [...el.selectedOptions].map((o) => o.value);
    else out[el.name] = el.value;
  }
  return out;
}

/** Chạy thao tác ghi: khóa nút để chống double-submit, báo lỗi đúng loại, chỉ báo thành công khi server xác nhận. */
export async function run(button, fn, { ok, onError } = {}) {
  if (button?.dataset.busy === '1') return false;
  if (button) {
    button.dataset.busy = '1';
    button.disabled = true;
  }
  try {
    await fn();
    if (ok) toast(ok);
    return true;
  } catch (e) {
    if (onError?.(e) === true) return false;
    toast(e?.message || 'Đã xảy ra lỗi.', 'error');
    return false;
  } finally {
    if (button) {
      delete button.dataset.busy;
      button.disabled = false;
    }
  }
}
