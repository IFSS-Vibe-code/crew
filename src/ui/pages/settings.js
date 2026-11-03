import { html, options, run } from '../kit.js';
import { header, gate } from './common.js';
import { S, wsId, actor } from '../ctx.js';
import { tracked } from '../../state/store.js';
import { WORKSPACE_TYPES } from '../../domain/constants.js';
import { showFieldErrors, formData, errSlot } from '../kit.js';
import { ValidationError } from '../../domain/validation.js';
import * as repo from '../../services/repo.js';

export const settingsPage = {
  render() {
    const w = S().workspace;
    const g = gate('workspace');
    const head = header(
      'Cài đặt Workspace',
      'Thiết lập thông tin và quy tắc vận hành áp dụng cho toàn Workspace.',
      html`<button class="btn primary" id="saveSettings">Lưu thay đổi</button>`,
    );
    if (g || !w) return html`${head}${g || ''}`;
    const st = w.settings;
    return html`${head}
    <form id="setForm" novalidate><div class="grid two"><section class="panel"><div class="panelhead"><h2 style="font-size:14.5px;margin:0">Thông tin Workspace</h2></div><div class="panelbody">
      <div class="field"><label for="s_name">Tên tổ chức</label><input class="input" id="s_name" name="name" maxlength="100" value="${w.name}" />${errSlot('name')}</div>
      <div class="field"><label for="s_year">Năm học</label><input class="input" id="s_year" name="academicYear" placeholder="2026 – 2027…" maxlength="20" value="${w.academicYear || ''}" />${errSlot('academicYear')}</div>
      <div class="field"><label for="s_mail">Email đầu mối (nhận thông báo Trường)</label><input class="input" id="s_mail" name="contactEmail" type="email" maxlength="254" value="${w.contactEmail || ''}" />${errSlot('contactEmail')}</div>
      <div class="field"><label for="s_type">Loại Workspace</label><select class="input" id="s_type" name="type">${options(WORKSPACE_TYPES, w.type)}</select>${errSlot('type')}</div></div></section>
    <section class="panel"><div class="panelhead"><h2 style="font-size:14.5px;margin:0">Quy tắc vận hành</h2></div><div class="panelbody">
      <div class="field"><label for="s_remind">Nhắc việc trước Deadline (giờ)</label><input class="input" id="s_remind" name="remindBeforeDeadlineHours" type="number" min="0" max="336" value="${st.remindBeforeDeadlineHours}" /></div>
      <div class="field"><label for="s_warn">Cảnh báo hồ sơ chờ duyệt quá (ngày)</label><input class="input" id="s_warn" name="approvalWaitWarnDays" type="number" min="1" max="120" value="${st.approvalWaitWarnDays}" /></div>
      <label class="checkline"><input type="checkbox" name="requireEvidenceOnComplete" ${st.requireEvidenceOnComplete ? 'checked' : ''} /> Yêu cầu minh chứng khi báo hoàn thành</label>
      <label class="checkline"><input type="checkbox" name="allowConditionalPrep" ${st.allowConditionalPrep ? 'checked' : ''} /> Cho phép "Chuẩn bị có điều kiện" khi chờ phê duyệt</label>
      <p class="muted" style="font-size:12.5px">Mọi thay đổi trạng thái được ghi lịch sử hoạt động của từng công việc; dữ liệu được tách theo quyền của Ban/vai trò bằng Security Rules.</p></div></section></div></form>`;
  },
  bind(root) {
    const form = root.querySelector('#setForm');
    root.querySelector('#saveSettings')?.addEventListener('click', (e) => {
      const d = formData(form);
      run(e.currentTarget, () => tracked(repo.updateWorkspace(wsId(), actor(), d, d)), {
        ok: 'Đã lưu cài đặt.',
        onError: (ex) => {
          if (ex instanceof ValidationError) {
            showFieldErrors(form, ex.fields);
            return true;
          }
          return false;
        },
      });
    });
  },
};
