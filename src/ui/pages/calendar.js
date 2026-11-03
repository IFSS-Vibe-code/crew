import { html } from '../kit.js';
import { header, gate } from './common.js';
import { S } from '../ctx.js';
import { setUi } from '../../state/store.js';
import { monthGrid, todayIso, fmtDate } from '../../domain/dates.js';
import { calendarItems, itemsByDate, upcoming } from '../../domain/calendar.js';
import { openCreateTask } from '../taskDrawer.js';
import { can } from '../../domain/permissions.js';
import { me } from '../ctx.js';

const MONTHS = ['Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6', 'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'];
const cur = () =>
  S().ui.calendarMonth ||
  (() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  })();

export const calendarPage = {
  render() {
    const s = S();
    const g = gate('tasks', 'events', 'notices');
    const { y, m } = cur();
    const head = header(
      'Lịch hoạt động',
      'Deadline công việc, chương trình và hạn đăng ký trong Workspace.',
      html`<button class="btn" id="prev" aria-label="Tháng trước">‹</button><span style="font-weight:650;min-width:110px;text-align:center">${MONTHS[m]}, ${y}</span><button class="btn" id="next" aria-label="Tháng sau">›</button><button class="btn" id="today">Hôm nay</button>`,
    );
    if (g) return html`${head}${g}`;
    const items = calendarItems({ tasks: s.tasks, events: s.events, notices: s.notices }, s.ui.calendarFilters);
    const byDate = itemsByDate(items);
    const today = todayIso();
    const f = s.ui.calendarFilters;
    return html`${head}
    <section class="panel"><div class="panelbody"><div class="calendar" role="grid" aria-label="Lịch ${MONTHS[m]} ${y}">
      ${['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map((d) => html`<div class="dayhead" role="columnheader">${d}</div>`)}
      ${monthGrid(y, m).map(
        (c) => html`<div class="day ${c.inMonth ? '' : 'out'} ${c.iso === today ? 'today' : ''}" role="gridcell" aria-label="${fmtDate(c.iso)}"><b>${c.day}</b>
        ${(byDate.get(c.iso) || []).slice(0, 3).map((it) => html`<button class="dayevent k-${it.kind}" data-kind="${it.kind}" data-ref="${it.refId}" title="${it.title}">${it.title}</button>`)}
        ${(byDate.get(c.iso) || []).length > 3 ? html`<span style="font-size:11px">+${byDate.get(c.iso).length - 3} nữa</span>` : ''}</div>`,
      )}</div></div></section>
    <div class="grid two sectiongap"><section class="panel"><div class="panelhead"><h2 style="font-size:14.5px;margin:0">Sắp diễn ra</h2></div><div class="panelbody">
      ${upcoming(items, today).map((it) => html`<div class="feeditem"><div class="feedicon k-${it.kind}" aria-hidden="true">▣</div><div><strong>${it.title}</strong><p>${fmtDate(it.date)}</p></div></div>`)}
      ${upcoming(items, today).length ? '' : html`<p class="muted">Không có mốc thời gian nào sắp tới.</p>`}</div></section>
    <section class="panel"><div class="panelhead"><h2 style="font-size:14.5px;margin:0">Bộ lọc lịch</h2></div><div class="panelbody">
      ${[
        ['task', 'Deadline công việc'],
        ['event', 'Chương trình / sự kiện'],
        ['notice', 'Hạn đăng ký thông báo Trường'],
      ].map(
        ([k, l]) =>
          html`<label class="checkline"><input type="checkbox" data-cf="${k}" ${f[k] ? 'checked' : ''} /> <span class="tag k-${k}">${l}</span></label>`,
      )}
      ${can.createTask(me()) ? html`<button class="btn" id="addFromCal" style="margin-top:8px">＋ Thêm công việc</button>` : ''}</div></section></div>`;
  },
  bind(root, { openTask, navigate }) {
    const move = (d) => {
      const { y, m } = cur();
      const dt = new Date(y, m + d, 1);
      setUi({ calendarMonth: { y: dt.getFullYear(), m: dt.getMonth() } });
    };
    root.querySelector('#prev')?.addEventListener('click', () => move(-1));
    root.querySelector('#next')?.addEventListener('click', () => move(1));
    root.querySelector('#today')?.addEventListener('click', () => setUi({ calendarMonth: null }));
    root
      .querySelectorAll('[data-cf]')
      .forEach((c) => c.addEventListener('change', () => setUi({ calendarFilters: { ...S().ui.calendarFilters, [c.dataset.cf]: c.checked } })));
    root.querySelector('#addFromCal')?.addEventListener('click', () => openCreateTask({}, { onCreated: openTask }));
    root.querySelectorAll('.dayevent').forEach((b) =>
      b.addEventListener('click', () => {
        if (b.dataset.kind === 'task') openTask(b.dataset.ref);
        else navigate(b.dataset.kind === 'event' ? 'events' : 'inbox');
      }),
    );
  },
};
