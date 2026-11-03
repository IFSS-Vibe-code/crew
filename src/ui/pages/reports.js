import { html } from '../kit.js';
import { header, gate, stat } from './common.js';
import { S, unitName } from '../ctx.js';
import { taskStatusBreakdown, onTimeRate, avgApprovalDays, workloadByAssignee, toCsv } from '../../domain/reports.js';
import { progressByUnit, taskCode, computeProgress, effectiveStatus } from '../../domain/tasks.js';
import { downloadText } from '../download.js';
import { stageLabel } from '../../domain/approvals.js';
import { statusSegments, weeklyFlow } from '../../domain/insights.js';
import { segmentedBar, lines, hbars, bindCharts } from '../charts.js';

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
    const seg = statusSegments(s.tasks);
    const flow = weeklyFlow(s.tasks);
    return html`${head}
    <div class="grid stats">
      ${stat('Tỷ lệ hoàn thành', `${done.percent}%`, '✓', '#e9f8f5', '#159582', `${done.count}/${b.total} công việc`)}
      ${stat('Hoàn thành đúng hạn', ot.count ? `${ot.percent}%` : '—', '◷', '#edf2ff', '#4568ce', ot.count ? `Trên ${ot.count} việc đã hoàn thành` : 'Chưa có việc hoàn thành')}
      ${stat('Chương trình', s.events.length, '▦', '#fff5e5', '#bf811c', `${s.events.filter((e) => e.status === 'Hoàn thành').length} đã hoàn thành`)}
      ${stat('Thời gian duyệt TB', avg === null ? '—' : `${avg} ngày`, '⏱', '#f3efff', '#8062c7', `${s.approvals.filter((a) => a.status === 'Đã duyệt').length} hồ sơ đã duyệt`)}
    </div>
    <div class="grid two vizrow">
      <section class="panel"><div class="panelhead"><div><h2>Tình trạng công việc</h2><p>${seg.total} công việc đang theo dõi (không tính việc đã hủy)</p></div></div><div class="panelbody">${segmentedBar(seg.parts, { label: 'Tình trạng công việc', hero: { value: `${seg.parts[0].percent}%`, caption: `đã hoàn thành (${seg.parts[0].count}/${seg.total} công việc)` } })}</div></section>
      <section class="panel"><div class="panelhead"><div><h2>Nhịp công việc 8 tuần gần nhất</h2><p>Số việc tạo mới so với số việc hoàn thành mỗi tuần</p></div></div><div class="panelbody">
        ${lines(
          flow,
          [
            { key: 'created', label: 'Tạo mới', color: '#2a78d6' },
            { key: 'completed', label: 'Hoàn thành', color: '#eb6834' },
          ],
          { label: 'Nhịp công việc theo tuần' },
        )}</div></section>
    </div>
    <div class="grid two even">
      <section class="panel"><div class="panelhead"><div><h2>Tiến độ theo bộ phận</h2><p>Trung bình tiến độ các công việc đang theo dõi</p></div></div><div class="panelbody">
        ${
          prog.length
            ? hbars(
                prog.map((r) => ({
                  label: r.name,
                  value: r.percent,
                  text: `${r.percent}%`,
                  tipLines: [`${r.percent}% tiến độ`, `${r.done}/${r.count} việc hoàn thành`],
                })),
                { max: 100, label: 'Tiến độ theo bộ phận' },
              )
            : html`<p class="muted">Chưa có dữ liệu.</p>`
        }</div></section>
      <section class="panel"><div class="panelhead"><div><h2>Khối lượng theo người phụ trách</h2><p>Số công việc đang mở; thanh đỏ = có việc quá hạn</p></div></div><div class="panelbody">
        ${
          load.length
            ? hbars(
                load.slice(0, 8).map((r) => ({
                  label: r.name,
                  value: r.open,
                  text: String(r.open),
                  color: r.overdue ? '#d03b3b' : undefined,
                  tipLines: [`${r.open} việc đang mở`, r.overdue ? `${r.overdue} việc quá hạn` : 'Không có việc quá hạn'],
                })),
                { label: 'Khối lượng theo người phụ trách' },
              )
            : html`<p class="muted">Chưa có việc đang mở được giao.</p>`
        }</div></section>
    </div>`;
  },
  bind(root) {
    bindCharts(root);
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
