import { html } from '../kit.js';
import { header, gate, stat } from './common.js';
import { S, unitName } from '../ctx.js';
import { taskStatusBreakdown, onTimeRate, avgApprovalDays, workloadByAssignee, toCsv } from '../../domain/reports.js';
import { progressByUnit, taskCode, computeProgress, effectiveStatus } from '../../domain/tasks.js';
import { downloadText } from '../download.js';
import { stageLabel } from '../../domain/approvals.js';

export const reportsPage = {
  render() {
    const s = S();
    const g = gate('tasks', 'units', 'members', 'approvals');
    const head = header(
      'Báo cáo & thống kê',
      'Tiến độ, thời gian duyệt và khối lượng công việc – tính từ dữ liệu thật trong phạm vi bạn được xem.',
      html`<button class="btn" id="exp">⇩ Xuất báo cáo (CSV)</button>`,
    );
    if (g) return html`${head}${g}`;
    const b = taskStatusBreakdown(s.tasks);
    const done = b.rows[0];
    const ot = onTimeRate(s.tasks);
    const avg = avgApprovalDays(s.approvals);
    const prog = progressByUnit(s.tasks, s.units).filter((r) => r.count);
    const load = workloadByAssignee(s.tasks, s.members);
    return html`${head}
    <div class="grid stats">
      ${stat('Tỷ lệ hoàn thành', `${done.percent}%`, '✓', '#e9f8f5', '#159582', `${done.count}/${b.total} công việc`)}
      ${stat('Hoàn thành đúng hạn', ot.count ? `${ot.percent}%` : '—', '◷', '#edf2ff', '#4568ce', ot.count ? `Trên ${ot.count} việc đã hoàn thành` : 'Chưa có việc hoàn thành')}
      ${stat('Chương trình', s.events.length, '▦', '#fff5e5', '#bf811c', `${s.events.filter((e) => e.status === 'Hoàn thành').length} đã hoàn thành`)}
      ${stat('Thời gian duyệt TB', avg === null ? '—' : `${avg} ngày`, '⏱', '#f3efff', '#8062c7', `${s.approvals.filter((a) => a.status === 'Đã duyệt').length} hồ sơ đã duyệt`)}
    </div>
    <div class="grid two"><section class="panel"><div class="panelhead"><h2 style="font-size:14.5px;margin:0">Tiến độ công việc theo trạng thái</h2></div><div class="panelbody">
      ${b.total ? b.rows.map((x) => html`<div style="margin:13px 0"><div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px"><span>${x.label}</span><b>${x.count} (${x.percent}%)</b></div><div class="bar"><i style="width:${x.percent}%;background:${x.color}"></i></div></div>`) : html`<p class="muted">Chưa có công việc.</p>`}</div></section>
    <section class="panel"><div class="panelhead"><h2 style="font-size:14.5px;margin:0">Khối lượng theo người phụ trách</h2></div><div class="panelbody">
      ${load.length ? load.slice(0, 8).map((r) => html`<div class="progressrow"><span class="name">${r.name}</span><div class="bar"><i style="width:${Math.min(100, r.open * 12)}%;background:${r.overdue ? 'var(--red)' : '#5e7be0'}"></i></div><b>${r.open}</b></div>`) : html`<p class="muted">Chưa có việc đang mở được giao.</p>`}
      <p class="muted" style="font-size:12px;margin:8px 0 0">Số công việc đang mở; thanh đỏ = có việc quá hạn.</p></div></section></div>
    <section class="panel sectiongap"><div class="panelhead"><h2 style="font-size:14.5px;margin:0">Tiến độ theo bộ phận</h2></div><div class="panelbody">
      ${prog.length ? prog.map((r) => html`<div class="progressrow"><span class="name">${r.name}</span><div class="bar"><i style="width:${r.percent}%"></i></div><b>${r.percent}%</b></div>`) : html`<p class="muted">Chưa có dữ liệu.</p>`}</div></section>`;
  },
  bind(root) {
    root.querySelector('#exp')?.addEventListener('click', () => {
      const s = S();
      const rows = [['BÁO CÁO CÔNG VIỆC'], ['Mã', 'Công việc', 'Bộ phận', 'Phụ trách', 'Deadline', 'Trạng thái', 'Tiến độ %']];
      for (const t of s.tasks)
        rows.push([taskCode(t.seq), t.title, unitName(t.unitId), t.assigneeName || '', t.dueDate || '', effectiveStatus(t), computeProgress(t)]);
      rows.push([], ['HỒ SƠ PHÊ DUYỆT'], ['Chương trình', 'Đơn vị', 'Cấp xử lý', 'Ngày gửi', 'Trạng thái']);
      for (const a of s.approvals) rows.push([a.title, unitName(a.unitId), stageLabel(a), a.submittedAt || '', a.status]);
      downloadText('bao-cao-khoa.csv', toCsv(rows), 'text/csv;charset=utf-8');
    });
  },
};
