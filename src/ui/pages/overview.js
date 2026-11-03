import { html } from '../kit.js';
import { header, stat, gate, taskTable, bindTaskOpeners } from './common.js';
import { S, me } from '../ctx.js';
import { can } from '../../domain/permissions.js';
import { needsAttention, progressByUnit, isOverdue } from '../../domain/tasks.js';
import { stageLabel } from '../../domain/approvals.js';
import { openCreateTask } from '../taskDrawer.js';
import { relativeTime as rel } from '../../domain/dates.js';
import { statusSegments, dueBuckets } from '../../domain/insights.js';
import { segmentedBar, columns, hbars, bindCharts } from '../charts.js';

const DESC = {
  owner: 'Toàn cảnh hoạt động, tiến độ các Ban và những nội dung cần lãnh đạo Khoa xử lý.',
  approver: 'Theo dõi kế hoạch đang chờ xem xét, phê duyệt và hồ sơ cần bổ sung.',
  manager: 'Theo dõi nhiệm vụ của Ban, phân công thành viên và kiểm soát Deadline.',
  lecturer: 'Theo dõi công việc giảng dạy, hướng dẫn, hội đồng và hoạt động chuyên môn.',
  member: 'Tập trung vào nhiệm vụ được giao, Deadline và cập nhật kết quả.',
};

export const overview = {
  render() {
    const g = gate('tasks', 'units', 'approvals', 'me');
    const s = S();
    const role = s.me.role;
    const head = header(
      'Tổng quan hoạt động',
      DESC[role],
      html`${can.createTask(me()) ? html`<button class="btn primary" id="newTask">＋ Tạo công việc</button>` : ''}`,
    );
    if (g) return html`${head}${g}`;
    const tasks = s.tasks;
    const pending = s.approvals.filter((a) => a.status === 'Chờ xử lý');
    const prog = progressByUnit(tasks, s.units).filter((r) => r.count > 0);
    const attention = needsAttention(tasks).slice(0, 6);
    // Hoạt động gần đây: dựng từ lịch sử hồ sơ duyệt và công việc mới cập nhật (dữ liệu thật).
    const feed = [
      ...s.approvals.flatMap((a) =>
        (a.history || []).slice(-1).map((h) => ({ icon: '✓', title: `${h.action}: ${a.title}`, text: `${h.byName || ''} · ${stageLabel(a)}`, at: h.at })),
      ),
      ...s.tasks
        .filter((t) => t.updatedAt)
        .map((t) => ({ icon: '☷', title: `Cập nhật: ${t.title}`, text: `${t.assigneeName || 'Chưa phân công'} · ${t.status}`, at: t.updatedAt })),
      ...s.notices.filter((n) => n.createdAt).map((n) => ({ icon: '✉', title: `Thông báo: ${n.title}`, text: n.source || 'Cấp Trường', at: n.createdAt })),
    ]
      .filter((f) => f.at)
      .sort((a, b) => new Date(b.at?.toDate?.() ?? b.at) - new Date(a.at?.toDate?.() ?? a.at))
      .slice(0, 5);
    const seg = statusSegments(tasks);
    const due = dueBuckets(tasks);
    const dueLabel = 'Số công việc đang mở theo hạn chót';
    return html`${head}
    <div class="grid stats">
      ${stat('Tổng công việc', tasks.length, '☷', '#edf2ff', '#4568ce', 'Trong phạm vi của bạn')}
      ${stat('Đang thực hiện', tasks.filter((t) => t.status === 'Đang thực hiện').length, '◷', '#e9f8f5', '#159582', 'Đang được triển khai')}
      ${stat('Chờ phê duyệt', pending.length, '✓', '#fff5e5', '#bf811c', 'Kế hoạch / đề xuất')}
      ${stat('Quá hạn', tasks.filter((t) => isOverdue(t)).length, '!', '#fff0f0', '#d15c5c', 'Cần được xử lý')}
    </div>
    <div class="grid two vizrow">
      <section class="panel" aria-labelledby="h_stat"><div class="panelhead"><div><h2 id="h_stat">Tình trạng công việc</h2><p>${seg.total ? `${seg.total} công việc đang theo dõi` : 'Chưa có công việc'}</p></div><a class="textlink" href="#/tasks">Mở danh sách →</a></div>
        <div class="panelbody">${segmentedBar(seg.parts, { label: 'Tình trạng công việc', hero: { value: `${seg.parts[0].percent}%`, caption: `đã hoàn thành (${seg.parts[0].count}/${seg.total} công việc)` } })}</div></section>
      <section class="panel" aria-labelledby="h_due"><div class="panelhead"><div><h2 id="h_due">Hạn chót sắp tới</h2><p>${due.noDue ? `${due.noDue} việc chưa đặt Deadline` : 'Việc đang mở; mỗi cột là một tuần, ghi ngày bắt đầu'}</p></div></div>
        <div class="panelbody">${columns(
          due.buckets.map((b) => ({ ...b, value: b.count, color: b.key === 'overdue' ? '#d03b3b' : undefined })),
          { label: dueLabel },
        )}</div></section>
    </div>
    <div class="grid two">
      <section class="panel" aria-labelledby="h_prog"><div class="panelhead"><div><h2 id="h_prog">Tiến độ theo bộ phận</h2><p>Trung bình tiến độ các công việc đang theo dõi</p></div><a class="textlink" href="#/units">Xem bộ phận →</a></div>
        <div class="panelbody">${
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
            : html`<p class="muted">Chưa có công việc nào để tính tiến độ.</p>`
        }</div></section>
      <section class="panel" aria-labelledby="h_feed"><div class="panelhead"><div><h2 id="h_feed">Hoạt động gần đây</h2><p>Cập nhật trong Workspace</p></div></div>
        <div class="panelbody">${feed.length ? feed.map((f) => html`<div class="feeditem"><div class="feedicon" aria-hidden="true">${f.icon}</div><div><strong>${f.title}</strong><p>${f.text}</p></div><time>${rel(f.at?.toDate?.() ?? f.at)}</time></div>`) : html`<p class="muted">Chưa có hoạt động.</p>`}</div></section>
    </div>
    <div class="grid two" style="grid-template-columns:minmax(0,1.35fr) minmax(280px,.8fr)">
      <section class="panel" aria-labelledby="h_att"><div class="panelhead"><div><h2 id="h_att">${role === 'member' ? 'Công việc của tôi' : 'Công việc cần chú ý'}</h2><p>Quá hạn, sắp đến hạn hoặc đang chờ phê duyệt</p></div><a class="textlink" href="#/tasks">Mở danh sách →</a></div>
        <div class="tablewrap">${taskTable(attention.length ? attention : [...tasks].slice(0, 5))}</div></section>
      <section class="panel" aria-labelledby="h_units"><div class="panelhead"><div><h2 id="h_units">Ban / Bộ phận</h2><p>Cơ cấu của Workspace</p></div><a class="textlink" href="#/units">Chi tiết →</a></div>
        <div class="panelbody"><div class="unitlist">${s.units.slice(0, 5).map((u) => html`<div class="unit"><div class="unitico" aria-hidden="true">${u.icon || '▤'}</div><div class="unitinfo"><strong>${u.name}</strong><small>${u.description || ''}</small></div><span class="tag">${s.members.filter((m) => (m.unitIds || []).includes(u.id)).length} TV</span></div>`)}</div></div></section>
    </div>`;
  },
  bind(root, { openTask }) {
    root.querySelector('#newTask')?.addEventListener('click', () => openCreateTask({}, { onCreated: openTask }));
    bindTaskOpeners(root, openTask);
    bindCharts(root);
  },
};
