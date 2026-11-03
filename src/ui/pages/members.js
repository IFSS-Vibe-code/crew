import { html, raw, options, pill, run, confirmBox, toast, openModal } from '../kit.js';
import { header, gate } from './common.js';
import { S, wsId, actor, vctx } from '../ctx.js';
import { tracked } from '../../state/store.js';
import { ROLES, ROLE_KEYS } from '../../domain/constants.js';
import { openForm } from '../formModal.js';
import * as repo from '../../services/repo.js';
import { fmtDate, toDate, toIso } from '../../domain/dates.js';
import { ValidationError } from '../../domain/validation.js';

const ASSIGNABLE = ROLE_KEYS.filter((r) => r !== 'owner');
const roleOpts = (list) => list.map((r) => ({ v: r, l: ROLES[r].label }));

export const membersPage = {
  render() {
    const s = S();
    const g = gate('members', 'units', 'wsInvites');
    const head = header(
      'Thành viên & phân quyền',
      'Mời người dùng bằng email, gán vai trò và phạm vi Ban trong Workspace.',
      html`<button class="btn primary" id="invite">＋ Mời thành viên</button>`,
    );
    if (g) return html`${head}${g}`;
    const ownerUid = s.workspace?.ownerUid;
    return html`${head}
    <section class="panel"><div class="panelhead"><h2 style="font-size:14.5px;margin:0">Thành viên (${s.members.length})</h2></div><div class="tablewrap"><table class="table"><caption class="sr-only">Thành viên</caption><thead><tr><th scope="col">Họ tên</th><th scope="col">Email</th><th scope="col">Vai trò</th><th scope="col">Bộ phận</th><th scope="col">Thao tác</th></tr></thead><tbody>
      ${s.members.map(
        (
          m,
        ) => html`<tr><td><b>${m.displayName}</b>${m.uid === ownerUid ? html`<span class="sub">Chủ sở hữu Workspace</span>` : ''}</td><td>${m.email}</td><td>${ROLES[m.role]?.short || m.role}</td>
        <td>${
          (m.unitIds || [])
            .map((u) => s.units.find((x) => x.id === u)?.name)
            .filter(Boolean)
            .join(', ') || '—'
        }</td>
        <td>${m.uid === ownerUid ? html`<span class="muted">—</span>` : html`<button class="textlink" data-edit="${m.uid}">Đổi quyền</button> <button class="textlink danger" data-rm="${m.uid}">Xóa</button>`}</td></tr>`,
      )}</tbody></table></div></section>
    <section class="panel sectiongap"><div class="panelhead"><h2 style="font-size:14.5px;margin:0">Lời mời đang chờ (${s.wsInvites.length})</h2></div>
      ${s.wsInvites.length ? html`<div class="tablewrap"><table class="table"><caption class="sr-only">Lời mời</caption><thead><tr><th scope="col">Email</th><th scope="col">Vai trò</th><th scope="col">Ngày mời</th><th scope="col"></th></tr></thead><tbody>${s.wsInvites.map((i) => html`<tr><td>${i.email}</td><td>${ROLES[i.role]?.short}</td><td>${i.createdAt ? fmtDate(toIso(toDate(i.createdAt))) : '…'}</td><td><button class="textlink danger" data-revoke="${i.email}">Thu hồi</button></td></tr>`)}</tbody></table></div>` : html`<div class="empty">Không có lời mời nào đang chờ.</div>`}</section>
    <section class="panel sectiongap"><div class="panelhead"><h2 style="font-size:14.5px;margin:0">Ma trận vai trò</h2></div><div class="tablewrap"><table class="table"><thead><tr><th scope="col">Vai trò</th><th scope="col">Phạm vi</th><th scope="col">Quyền tiêu biểu</th></tr></thead><tbody>
      <tr><td><b>Lãnh đạo Khoa (Owner)</b></td><td>Toàn Khoa</td><td>Tạo Ban, mời & phân quyền, xem và quản lý mọi hoạt động, kinh phí</td></tr>
      <tr><td><b>Người duyệt (Approver)</b></td><td>Xem toàn Khoa</td><td>Duyệt / trả lại / từ chối hồ sơ; duyệt khoản kinh phí; không sửa nội dung kế hoạch</td></tr>
      <tr><td><b>Trưởng Ban (Manager)</b></td><td>Ban được gán</td><td>Tạo và chia việc, lập hồ sơ duyệt, đề xuất kinh phí, ghi nhận thông báo Trường</td></tr>
      <tr><td><b>Thành viên (Member)</b></td><td>Việc được giao</td><td>Nhận việc, cập nhật tiến độ, gửi minh chứng, bình luận</td></tr>
      <tr><td><b>Giảng viên (Lecturer)</b></td><td>Ban chuyên môn được gán</td><td>Nhận phân công giảng dạy, hướng dẫn, hội đồng; cập nhật tiến độ</td></tr></tbody></table></div></section>
    <div class="notice sectiongap">Quyền được kiểm tra ở máy chủ bằng Firestore Security Rules, không chỉ ẩn nút trên giao diện. Ai có quyền duyệt chính thức và quy trình một người kiêm nhiều vai trò cần khách hàng xác nhận.</div>`;
  },
  bind(root) {
    const s = () => S();
    const unitOpts = () => s().units.map((u) => ({ v: u.id, l: u.name }));
    root.querySelector('#invite')?.addEventListener('click', () =>
      openForm({
        title: 'Mời thành viên',
        submitLabel: 'Gửi lời mời',
        ok: 'Đã tạo lời mời. Người được mời đăng nhập bằng đúng email này để tham gia.',
        intro: html`<p class="muted" style="margin-top:0;font-size:13px">Hệ thống không tự gửi email. Hãy báo cho người được mời đăng ký/đăng nhập CrewWork bằng <b>đúng email này</b>; lời mời sẽ hiện ra sau khi họ xác minh email.</p>`,
        fields: [
          { name: 'email', label: 'Email', type: 'email', required: true, full: true, max: 254 },
          { name: 'displayName', label: 'Tên hiển thị (gợi ý)', full: true, max: 100 },
          { name: 'role', label: 'Vai trò', type: 'select', options: roleOpts(ASSIGNABLE) },
          { name: 'unitIds', label: 'Bộ phận (bắt buộc với Trưởng Ban)', type: 'multiselect', options: unitOpts(), hint: 'Giữ Ctrl/⌘ để chọn nhiều.' },
        ],
        values: { role: 'member', unitIds: [] },
        onSubmit: async (d) => {
          await tracked(repo.inviteMember(wsId(), s().workspace.name, actor(), d, vctx()));
        },
      }),
    );
    root.querySelectorAll('[data-edit]').forEach((b) =>
      b.addEventListener('click', () => {
        const m = s().members.find((x) => x.uid === b.dataset.edit);
        openForm({
          title: `Đổi quyền: ${m.displayName}`,
          ok: 'Đã cập nhật quyền.',
          fields: [
            { name: 'role', label: 'Vai trò', type: 'select', options: roleOpts(ASSIGNABLE) },
            { name: 'unitIds', label: 'Bộ phận', type: 'multiselect', options: unitOpts() },
          ],
          values: m,
          onSubmit: async (d) => {
            if (d.role === 'manager' && !d.unitIds.length) throw new ValidationError({ unitIds: 'Trưởng Ban cần được gán ít nhất một bộ phận.' });
            await tracked(repo.updateMember(wsId(), m.uid, { role: d.role, unitIds: d.unitIds }));
          },
        });
      }),
    );
    root.querySelectorAll('[data-rm]').forEach((b) =>
      b.addEventListener('click', async () => {
        const m = s().members.find((x) => x.uid === b.dataset.rm);
        if (
          await confirmBox({
            title: 'Xóa thành viên',
            message: `Xóa ${m.displayName} khỏi Workspace? Công việc họ phụ trách vẫn được giữ lại và cần được giao lại.`,
            confirmLabel: 'Xóa',
            danger: true,
          })
        )
          await run(b, () => tracked(repo.removeMember(wsId(), m.uid, actor())), { ok: 'Đã xóa thành viên.' });
      }),
    );
    root
      .querySelectorAll('[data-revoke]')
      .forEach((b) => b.addEventListener('click', () => run(b, () => tracked(repo.revokeInvite(wsId(), b.dataset.revoke)), { ok: 'Đã thu hồi lời mời.' })));
  },
};
export { raw, options, pill, toast, openModal };
