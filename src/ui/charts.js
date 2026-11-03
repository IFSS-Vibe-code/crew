// Biểu đồ SVG/HTML thuần, không thư viện ngoài (giữ CSP chặt, bundle nhỏ).
// Mọi nhãn đi qua html`` nên được escape; tooltip dùng textContent. Mỗi biểu đồ đều có bảng dữ liệu thay thế.
import { html, raw } from './kit.js';
import { niceScale } from '../domain/insights.js';

const nf = (n) => Number(n).toLocaleString('vi-VN');

/** Chuỗi tooltip: dòng đầu là tiêu đề, các dòng sau là giá trị (ngăn bằng \n). */
const tip = (...lines) => lines.join('\n');

/** Bảng dữ liệu thay thế – ai cũng đọc được số liệu mà không cần rê chuột. */
export function dataTable(caption, head, rows) {
  return html`<details class="viztable"><summary>Xem dạng bảng</summary><table class="table"><caption class="sr-only">${caption}</caption>
    <thead><tr>${head.map((h) => html`<th scope="col">${h}</th>`)}</tr></thead>
    <tbody>${rows.map((r) => html`<tr>${r.map((c, i) => (i === 0 ? html`<th scope="row">${c}</th>` : html`<td>${c}</td>`))}</tr>`)}</tbody></table></details>`;
}

export function legend(items) {
  return html`<ul class="vizlegend">${items.map((i) => html`<li><i style="background:${i.color}" aria-hidden="true"></i>${i.label}</li>`)}</ul>`;
}

/** Thanh phân đoạn cao: một tổng chia thành các phần (tối đa 6), % in trong khối khi đủ rộng. */
export function segmentedBar(parts, { label, hero = null }) {
  const total = parts.reduce((s, p) => s + p.count, 0);
  if (!total) return html`<p class="muted">Chưa có dữ liệu.</p>`;
  const shown = parts.filter((p) => p.count > 0);
  return html`${hero ? html`<div class="hero"><strong>${hero.value}</strong><span>${hero.caption}</span></div>` : ''}<div class="segbar" role="img" aria-label="${label}: ${shown.map((p) => `${p.label} ${p.count} (${p.percent}%)`).join('; ')}">
    ${shown.map(
      (p) =>
        html`<div class="seg" style="flex:${p.count} 0 0;background:${p.color};color:${['waiting', 'todo'].includes(p.key) ? '#0b0b0b' : '#fff'}" data-tip="${tip(p.label, `${nf(p.count)} công việc · ${p.percent}%`)}" tabindex="0">${p.percent >= 9 ? html`<span>${p.percent}%</span>` : ''}</div>`,
    )}</div>
    ${legend(parts.map((p) => ({ color: p.color, label: p.label })))}`;
}

/**
 * Cột đứng có trục: mỗi cột một màu, số trên đỉnh chỉ khi lớn nhất hoặc có giá trị; gridline hairline.
 * rows: {label, value, range, color?, tipLabel?}
 */
export function columns(rows, { unit = 'công việc', color = '#2a78d6', label }) {
  const W = 640;
  const H = 220;
  const pad = { l: 34, r: 8, t: 14, b: 30 };
  const max = Math.max(...rows.map((r) => r.value), 0);
  const sc = niceScale(max, 4);
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const slot = iw / rows.length;
  const bw = Math.min(24, slot * 0.6);
  const y = (v) => pad.t + ih - (v / sc.max) * ih;
  const peak = rows.reduce((b, r, i) => (r.value > rows[b].value ? i : b), 0);
  return html`<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${label}" focusable="false">
    ${sc.ticks.map((t) => html`<line class="grid" x1="${pad.l}" x2="${W - pad.r}" y1="${y(t)}" y2="${y(t)}"/><text class="axis" x="${pad.l - 8}" y="${y(t) + 4}" text-anchor="end">${t}</text>`)}
    ${rows.map((r, i) => {
      const cx = pad.l + slot * i + slot / 2;
      const h = Math.max(r.value ? 4 : 0, ih - (y(r.value) - pad.t));
      const top = pad.t + ih - h;
      const c = r.color || color;
      return html`<g class="mark" data-tip="${tip(r.tipLabel || r.label, `${nf(r.value)} ${unit}`, r.range || '')}" tabindex="0">
        <rect class="hit" x="${cx - slot / 2}" y="${pad.t}" width="${slot}" height="${ih + pad.b}"/>
        ${r.value ? raw(`<path d="M${cx - bw / 2} ${pad.t + ih}V${top + 4}a4 4 0 0 1 4-4h${bw - 8}a4 4 0 0 1 4 4V${pad.t + ih}Z" fill="${c}"/>`) : ''}
        ${r.value && (i === peak || rows.length <= 8) ? html`<text class="val" x="${cx}" y="${top - 5}" text-anchor="middle">${r.value}</text>` : ''}
        <text class="axis" x="${cx}" y="${H - 9}" text-anchor="middle">${r.label}</text></g>`;
    })}
    <line class="base" x1="${pad.l}" x2="${W - pad.r}" y1="${pad.t + ih}" y2="${pad.t + ih}"/></svg>
    ${dataTable(
      label,
      ['Mốc', `Số ${unit}`, 'Khoảng thời gian'],
      rows.map((r) => [r.label, nf(r.value), r.range || '—']),
    )}`;
}

/** Đường theo thời gian: hai chuỗi, đường 2px, chấm cuối có viền nền, con trỏ dọc khi rê chuột. */
export function lines(rows, series, { label, unit = 'công việc' }) {
  const W = 640;
  const H = 220;
  const pad = { l: 34, r: 14, t: 14, b: 30 };
  const max = Math.max(...rows.flatMap((r) => series.map((s) => r[s.key])), 0);
  const sc = niceScale(max, 4);
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const x = (i) => pad.l + (rows.length === 1 ? iw / 2 : (iw * i) / (rows.length - 1));
  const y = (v) => pad.t + ih - (v / sc.max) * ih;
  const slot = iw / Math.max(1, rows.length - 1);
  return html`<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${label}" focusable="false">
    ${sc.ticks.map((t) => html`<line class="grid" x1="${pad.l}" x2="${W - pad.r}" y1="${y(t)}" y2="${y(t)}"/><text class="axis" x="${pad.l - 8}" y="${y(t) + 4}" text-anchor="end">${t}</text>`)}
    <line class="base" x1="${pad.l}" x2="${W - pad.r}" y1="${pad.t + ih}" y2="${pad.t + ih}"/>
    ${series.map((s) => html`<path d="${raw(rows.map((r, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(r[s.key]).toFixed(1)}`).join(''))}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`)}
    ${rows.map(
      (
        r,
        i,
      ) => html`<g class="mark xcol" data-tip="${tip(`Tuần ${r.label}`, ...series.map((s) => `${s.label}: ${nf(r[s.key])} ${unit}`), r.range)}" tabindex="0">
        <rect class="hit" x="${x(i) - slot / 2}" y="${pad.t}" width="${slot}" height="${ih + pad.b}"/>
        <line class="cross" x1="${x(i)}" x2="${x(i)}" y1="${pad.t}" y2="${pad.t + ih}"/>
        ${series.map((s) => html`<circle class="dot" cx="${x(i)}" cy="${y(r[s.key])}" r="4" fill="${s.color}"/>`)}
        <text class="axis" x="${x(i)}" y="${H - 9}" text-anchor="middle">${r.label}</text></g>`,
    )}</svg>
    ${legend(series.map((s) => ({ color: s.color, label: s.label })))}
    ${dataTable(
      label,
      ['Tuần kết thúc', ...series.map((s) => s.label), 'Khoảng thời gian'],
      rows.map((r) => [r.label, ...series.map((s) => nf(r[s.key])), r.range]),
    )}`;
}

/**
 * Thanh ngang xếp hạng: một màu, giá trị ở đầu thanh. rows: {label, value, text?, color?, tipLines?}
 * max: giá trị tương ứng 100% độ rộng.
 */
export function hbars(rows, { max, label, color = '#2a78d6' }) {
  const m = max ?? Math.max(1, ...rows.map((r) => r.value));
  return html`<ul class="hbars" aria-label="${label}">${rows.map(
    (
      r,
    ) => html`<li class="hrow mark" data-tip="${tip(r.tipTitle || r.label, ...(r.tipLines || [r.text ?? String(r.value)]))}" tabindex="0"><span class="hname">${r.label}</span>
      <span class="htrack"><i style="width:${Math.max(r.value ? 1.5 : 0, Math.min(100, (r.value / m) * 100))}%;background:${r.color || color}"></i></span><b>${r.text ?? r.value}</b></li>`,
  )}</ul>`;
}

/** Tooltip dùng chung: một phần tử, rê chuột hoặc focus bàn phím đều hiện; luôn dùng textContent. */
let tipEl;
export function bindCharts(root) {
  if (!tipEl) {
    tipEl = document.createElement('div');
    tipEl.className = 'viztip';
    tipEl.setAttribute('role', 'presentation');
    tipEl.hidden = true;
    document.body.appendChild(tipEl);
  }
  const show = (el, x, y) => {
    const [title, ...rest] = el.dataset.tip.split('\n').filter(Boolean);
    tipEl.replaceChildren();
    const t = document.createElement('div');
    t.className = 'tt';
    t.textContent = title;
    tipEl.appendChild(t);
    rest.forEach((line, i) => {
      const d = document.createElement('div');
      d.className = i === 0 ? 'tv' : 'ts';
      d.textContent = line;
      tipEl.appendChild(d);
    });
    tipEl.hidden = false;
    const r = tipEl.getBoundingClientRect();
    const left = Math.min(Math.max(8, x + 14), window.innerWidth - r.width - 8);
    const top = y + 18 + r.height > window.innerHeight ? y - r.height - 12 : y + 18;
    tipEl.style.left = `${left}px`;
    tipEl.style.top = `${Math.max(8, top)}px`;
  };
  const hide = () => (tipEl.hidden = true);
  root.querySelectorAll('[data-tip]').forEach((el) => {
    el.addEventListener('pointermove', (e) => show(el, e.clientX, e.clientY));
    el.addEventListener('pointerleave', hide);
    el.addEventListener('focus', () => {
      const r = el.getBoundingClientRect();
      show(el, r.left + r.width / 2, r.top);
    });
    el.addEventListener('blur', hide);
  });
}
export const hideChartTip = () => tipEl && (tipEl.hidden = true);
