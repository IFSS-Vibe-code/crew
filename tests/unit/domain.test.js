import { describe, it, expect } from 'vitest';
import { isIsoDate, fmtDate, daysBetween, monthGrid, addDays, relativeTime } from '../../src/domain/dates.js';
import {
  isOverdue,
  effectiveStatus,
  computeProgress,
  transitionError,
  filterTasks,
  sortTasks,
  groupByStatus,
  progressByUnit,
  taskCode,
  isDueSoon,
  diffFields,
  needsAttention,
} from '../../src/domain/tasks.js';
import {
  newApproval,
  submit,
  approve,
  returnForRevision,
  reject,
  stageLabel,
  waitingDays,
  isWaitingTooLong,
  ApprovalError,
} from '../../src/domain/approvals.js';
import { summarizeBudget, formatVnd } from '../../src/domain/budget.js';
import {
  validateTask,
  validateBudgetEntry,
  validateDoc,
  validateInvite,
  validateChecklist,
  validateEvidence,
  parseVnd,
  isSafeUrl,
  ValidationError,
  validateWorkspace,
  validateComment,
} from '../../src/domain/validation.js';
import { can } from '../../src/domain/permissions.js';
import { taskStatusBreakdown, toCsv, avgApprovalDays, onTimeRate } from '../../src/domain/reports.js';
import { calendarItems, itemsByDate } from '../../src/domain/calendar.js';

const TODAY = '2026-11-03';

describe('dates', () => {
  it('kiểm tra ngày hợp lệ, kể cả năm nhuận và ngày không tồn tại', () => {
    expect(isIsoDate('2026-11-03')).toBe(true);
    expect(isIsoDate('2028-02-29')).toBe(true);
    expect(isIsoDate('2026-02-29')).toBe(false);
    expect(isIsoDate('2026-13-01')).toBe(false);
    expect(isIsoDate('03/11/2026')).toBe(false);
    expect(isIsoDate(null)).toBe(false);
    expect(isIsoDate(20261103)).toBe(false);
  });
  it('định dạng và khoảng cách ngày', () => {
    expect(fmtDate('2026-11-03')).toBe('03/11/2026');
    expect(fmtDate('')).toBe('Chưa đặt');
    expect(daysBetween('2026-11-03', '2026-11-10')).toBe(7);
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1);
    expect(daysBetween('x', '2026-01-01')).toBe(null);
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
  });
  it('lưới tháng 11/2026 bắt đầu Thứ Hai 26/10', () => {
    const g = monthGrid(2026, 10);
    expect(g[0].iso).toBe('2026-10-26');
    expect(g.length % 7).toBe(0);
    expect(g.filter((c) => c.inMonth).length).toBe(30);
  });
  it('relativeTime xử lý timestamp chưa xác nhận', () => {
    expect(relativeTime(null)).toBe('Đang lưu…');
    const now = new Date('2026-11-03T10:00:00');
    expect(relativeTime(new Date('2026-11-03T09:59:30'), now)).toBe('Vừa xong');
    expect(relativeTime({ seconds: now.getTime() / 1000 - 7200 }, now)).toBe('2 giờ trước');
  });
});

describe('tasks', () => {
  const t = (o) => ({ id: 'x', title: 'T', status: 'Đang thực hiện', priority: 'Trung bình', unitId: 'u1', ...o });
  it('quá hạn chỉ khi có Deadline đã qua và chưa kết thúc', () => {
    expect(isOverdue(t({ dueDate: '2026-11-02' }), TODAY)).toBe(true);
    expect(isOverdue(t({ dueDate: '2026-11-03' }), TODAY)).toBe(false);
    expect(isOverdue(t({ dueDate: '2026-11-02', status: 'Hoàn thành' }), TODAY)).toBe(false);
    expect(isOverdue(t({ dueDate: '2026-11-02', status: 'Tạm hoãn/Hủy' }), TODAY)).toBe(false);
    expect(isOverdue(t({ dueDate: null }), TODAY)).toBe(false);
    expect(effectiveStatus(t({ dueDate: '2026-01-01' }), TODAY)).toBe('Quá hạn');
  });
  it('sắp hạn', () => {
    expect(isDueSoon(t({ dueDate: '2026-11-04' }), 1, TODAY)).toBe(true);
    expect(isDueSoon(t({ dueDate: '2026-11-06' }), 1, TODAY)).toBe(false);
    expect(isDueSoon(t({ dueDate: '2026-11-01' }), 1, TODAY)).toBe(false);
  });
  it('tiến độ theo checklist, giới hạn 0–100', () => {
    expect(computeProgress(t({ checklist: [{ done: true }, { done: false }, { done: true }, { done: true }] }))).toBe(75);
    expect(computeProgress(t({ progress: 140 }))).toBe(100);
    expect(computeProgress(t({ progress: -3 }))).toBe(0);
    expect(computeProgress(t({ progress: 'abc' }))).toBe(0);
    expect(computeProgress({})).toBe(0);
  });
  it('báo hoàn thành cần minh chứng khi Workspace yêu cầu', () => {
    expect(transitionError(t({}), 'Hoàn thành', { requireEvidenceOnComplete: true })).toMatch(/minh chứng/);
    expect(transitionError(t({ evidence: [{ url: 'https://x' }] }), 'Hoàn thành', { requireEvidenceOnComplete: true })).toBe(null);
    expect(transitionError(t({}), 'Hoàn thành', { requireEvidenceOnComplete: false })).toBe(null);
    expect(transitionError(t({}), 'Chuẩn bị có điều kiện', { allowConditionalPrep: false })).toMatch(/chưa cho phép/);
    expect(transitionError(t({}), 'Quá hạn', {})).toMatch(/không hợp lệ/);
  });
  it('lọc theo trạng thái hiệu lực, Ban và từ khóa không dấu hoa thường', () => {
    const list = [t({ id: 1, title: 'Kế hoạch Hội thao', dueDate: '2026-11-01' }), t({ id: 2, title: 'Tuyển sinh', unitId: 'u2', dueDate: '2026-12-01' })];
    expect(filterTasks(list, { status: 'Quá hạn' }, TODAY).map((x) => x.id)).toEqual([1]);
    expect(filterTasks(list, { unitId: 'u2' }, TODAY).map((x) => x.id)).toEqual([2]);
    expect(filterTasks(list, { search: 'HỘI THAO' }, TODAY).map((x) => x.id)).toEqual([1]);
    expect(filterTasks(list, { status: 'Tất cả' }, TODAY)).toHaveLength(2);
    expect(filterTasks([], { search: 'x' })).toEqual([]);
  });
  it('sắp xếp: việc mở trước, Deadline gần trước, ưu tiên cao trước', () => {
    const list = [
      t({ id: 'done', status: 'Hoàn thành', dueDate: '2026-01-01' }),
      t({ id: 'nodate' }),
      t({ id: 'late-low', dueDate: '2026-11-10', priority: 'Thấp' }),
      t({ id: 'late-high', dueDate: '2026-11-10', priority: 'Cao' }),
      t({ id: 'soon', dueDate: '2026-11-05' }),
    ];
    expect(sortTasks(list).map((x) => x.id)).toEqual(['soon', 'late-high', 'late-low', 'nodate', 'done']);
  });
  it('nhóm Kanban và tiến độ theo Ban bỏ qua việc hủy', () => {
    const list = [t({ id: 1, progress: 100, status: 'Hoàn thành' }), t({ id: 2, progress: 0 }), t({ id: 3, progress: 50, status: 'Tạm hoãn/Hủy' })];
    expect(groupByStatus(list)['Hoàn thành']).toHaveLength(1);
    const [row] = progressByUnit(list, [{ id: 'u1', name: 'Ban' }]);
    expect(row).toMatchObject({ count: 2, done: 1, percent: 50 });
    expect(progressByUnit([], [{ id: 'u1', name: 'Ban' }])[0].percent).toBe(0);
  });
  it('mã công việc và diff trường thay đổi', () => {
    expect(taskCode(7)).toBe('#TK-007');
    expect(taskCode(undefined)).toBe('#TK-…');
    expect(diffFields({ a: 1, b: [1] }, { a: 1, b: [1, 2] }, ['a', 'b'])).toEqual({ b: [1, 2] });
  });
  it('cần chú ý gồm quá hạn, sắp hạn, chờ duyệt', () => {
    const list = [t({ id: 1, dueDate: '2026-11-01' }), t({ id: 2, dueDate: '2026-12-30' }), t({ id: 3, status: 'Chờ phê duyệt' })];
    expect(
      needsAttention(list, TODAY)
        .map((x) => x.id)
        .sort(),
    ).toEqual([1, 3]);
  });
});

describe('approvals – máy trạng thái', () => {
  const actor = { uid: 'u', name: 'Cô Tuyền' };
  const d = new Date('2026-11-01T08:00:00');
  it('luồng đầy đủ: nháp → Chi ủy → Trường → Đã duyệt', () => {
    let a = newApproval({ title: 'Hội thao', unitId: 'u1' });
    expect(a.status).toBe('Nháp');
    expect(stageLabel(a)).toBe('Đang soạn');
    a = submit(a, actor, d);
    expect(a.status).toBe('Chờ xử lý');
    expect(stageLabel(a)).toBe('Chờ Chi ủy duyệt');
    a = approve(a, actor, '', d);
    expect(a.currentStep).toBe(1);
    expect(stageLabel(a)).toBe('Chờ Đoàn trường / Hội Sinh viên duyệt');
    a = approve(a, actor, 'OK', d);
    expect(a.status).toBe('Đã duyệt');
    expect(a.history.map((h) => h.action)).toHaveLength(3);
  });
  it('chỉ một cấp khi không cần Trường duyệt', () => {
    let a = submit(newApproval({ title: 'X', unitId: 'u', requireSchoolLevel: false }), actor, d);
    a = approve(a, actor, '', d);
    expect(a.status).toBe('Đã duyệt');
  });
  it('trả về bắt buộc ghi lý do; gửi lại tiếp tục từ bước bị trả', () => {
    let a = approve(submit(newApproval({ title: 'X', unitId: 'u' }), actor, d), actor, '', d);
    expect(() => returnForRevision(a, actor, '  ', d)).toThrow(ApprovalError);
    a = returnForRevision(a, actor, 'Bổ sung dự toán', d);
    expect(a.status).toBe('Cần bổ sung');
    expect(stageLabel(a)).toBe('Trả về đơn vị lập kế hoạch');
    a = submit(a, actor, d);
    expect(a.currentStep).toBe(1);
    expect(a.steps[0].status).toBe('approved');
  });
  it('không duyệt hồ sơ chưa gửi / đã kết thúc; không gửi lại hồ sơ đã duyệt', () => {
    const draft = newApproval({ title: 'X', unitId: 'u' });
    expect(() => approve(draft, actor)).toThrow(/chờ xử lý/);
    const rejected = reject(submit(draft, actor, d), actor, 'Không phù hợp', d);
    expect(rejected.status).toBe('Từ chối');
    expect(() => approve(rejected, actor)).toThrow();
    expect(() => submit(rejected, actor)).toThrow();
    expect(() => reject(submit(draft, actor, d), actor, '')).toThrow(/lý do/);
  });
  it('không thay đổi object gốc (bất biến)', () => {
    const a = newApproval({ title: 'X', unitId: 'u' });
    submit(a, actor, d);
    expect(a.status).toBe('Nháp');
  });
  it('đếm ngày chờ và cảnh báo chờ quá lâu', () => {
    const a = submit(newApproval({ title: 'X', unitId: 'u' }), actor, new Date('2026-10-15T08:00:00'));
    expect(waitingDays(a, '2026-11-03')).toBe(19);
    expect(isWaitingTooLong(a, 14, '2026-11-03')).toBe(true);
    expect(isWaitingTooLong(a, 30, '2026-11-03')).toBe(false);
    expect(waitingDays(newApproval({ title: 'X', unitId: 'u' }))).toBe(0);
  });
  it('lịch sử bị giới hạn 50 mục', () => {
    let a = newApproval({ title: 'X', unitId: 'u' });
    for (let i = 0; i < 40; i++) {
      a = submit(a, actor, d);
      a = returnForRevision(a, actor, 'lại', d);
    }
    expect(a.history.length).toBe(50);
  });
});

describe('budget', () => {
  const e = (o) => ({ kind: 'chi', amount: 100, source: 'Quỹ ĐK/LC', status: 'Đã duyệt', ...o });
  it('chỉ tính khoản đã duyệt vào số dư; tách đề xuất', () => {
    const s = summarizeBudget([
      e({ kind: 'thu', amount: 25_000_000 }),
      e({ kind: 'thu', amount: 8_000_000, source: 'Khoa hỗ trợ' }),
      e({ amount: 12_500_000 }),
      e({ amount: 1_000_000, status: 'Đề xuất' }),
      e({ amount: 9_000_000, status: 'Từ chối' }),
    ]);
    expect(s).toMatchObject({ income: 33_000_000, expense: 12_500_000, balance: 20_500_000, pendingExpense: 1_000_000, projected: 19_500_000 });
    expect(s.bySource.find((x) => x.source === 'Quỹ ĐK/LC').balance).toBe(12_500_000);
    expect(summarizeBudget([]).balance).toBe(0);
  });
  it('định dạng VND', () => {
    expect(formatVnd(25000000)).toMatch(/25.000.000 đ/);
    expect(formatVnd(NaN)).toBe('—');
  });
});

describe('validation', () => {
  const ctx = { unitIds: ['u1'] };
  it('task hợp lệ được chuẩn hóa', () => {
    const v = validateTask({ title: '  Kế hoạch  ', unitId: 'u1', type: 'Sự kiện', dueDate: '2026-11-10', collaboratorUids: ['a', 'a', ''] }, ctx);
    expect(v.title).toBe('Kế hoạch');
    expect(v.status).toBe('Chưa bắt đầu');
    expect(v.collaboratorUids).toEqual(['a']);
    expect(v.assigneeUid).toBe(null);
  });
  it('task thiếu trường / sai kiểu / ngoài phạm vi bị từ chối', () => {
    const bad = (o) => () => validateTask({ title: 'A', unitId: 'u1', type: 'Sự kiện', ...o }, ctx);
    expect(bad({ title: '' })).toThrow(ValidationError);
    expect(bad({ title: 'x'.repeat(201) })).toThrow(/tối đa/);
    expect(bad({ unitId: 'zzz' })).toThrow(/không tồn tại/);
    expect(bad({ type: 'Khác' })).toThrow(/Loại/);
    expect(bad({ status: 'Quá hạn' })).toThrow(/Trạng thái/);
    expect(bad({ dueDate: '2026-02-30' })).toThrow(/định dạng/);
    expect(bad({ startDate: '2026-11-10', dueDate: '2026-11-01' })).toThrow(/sau/);
    expect(bad({ progress: 101 })).toThrow(/0 đến 100/);
    expect(() => validateTask({}, ctx)).toThrow(ValidationError);
  });
  it('số tiền VND', () => {
    expect(parseVnd('1.500.000')).toBe(1500000);
    expect(parseVnd('1 500 000 đ')).toBe(1500000);
    expect(parseVnd('-5')).toBeNaN();
    expect(parseVnd('1,5')).toBe(15);
    expect(parseVnd('abc')).toBeNaN();
    expect(() => validateBudgetEntry({ kind: 'chi', amount: '0', source: 'Quỹ ĐK/LC', note: 'x', date: '2026-11-01' })).toThrow(/dương/);
    expect(validateBudgetEntry({ kind: 'thu', amount: '2.000.000', source: 'Khoa hỗ trợ', note: 'Hỗ trợ', date: '2026-11-01' }).amount).toBe(2000000);
  });
  it('URL an toàn chỉ https', () => {
    expect(isSafeUrl('https://drive.google.com/a')).toBe(true);
    expect(isSafeUrl('http://a.com')).toBe(false);
    expect(isSafeUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeUrl('')).toBe(false);
    expect(() => validateDoc({ title: 'A', group: 'Biểu mẫu', url: 'data:text/html,x' })).toThrow(/https/);
  });
  it('lời mời: email chuẩn hóa, không mời làm owner, Trưởng Ban cần Ban', () => {
    expect(validateInvite({ email: ' A@B.COM ', role: 'member' }, ctx).email).toBe('a@b.com');
    expect(() => validateInvite({ email: 'a@b.com', role: 'owner' }, ctx)).toThrow(/Vai trò/);
    expect(() => validateInvite({ email: 'ab.com', role: 'member' }, ctx)).toThrow(/Email/);
    expect(() => validateInvite({ email: 'a@b.com', role: 'manager', unitIds: [] }, ctx)).toThrow(/ít nhất/);
  });
  it('checklist, minh chứng, workspace, bình luận', () => {
    expect(validateChecklist([{ text: ' a ', done: 1 }])[0]).toMatchObject({ text: 'a', done: false });
    expect(() => validateChecklist(Array.from({ length: 51 }, () => ({ text: 'a' })))).toThrow(/50/);
    expect(() => validateChecklist([{ text: '' }])).toThrow();
    expect(() => validateEvidence([{ label: 'Ảnh', url: 'http://x' }])).toThrow(/https/);
    expect(() => validateWorkspace({ name: 'K', academicYear: '2026' })).toThrow(/Năm học/);
    expect(() => validateComment('   ')).toThrow();
  });
});

describe('permissions (UI) khớp với Rules', () => {
  const m = (role, unitIds = []) => ({ uid: 'me', role, unitIds });
  it('tạo / sửa công việc', () => {
    expect(can.createTask(m('owner'), 'x')).toBe(true);
    expect(can.createTask(m('manager', ['a']), 'a')).toBe(true);
    expect(can.createTask(m('manager', ['a']), 'b')).toBe(false);
    expect(can.createTask(m('member'), 'a')).toBe(false);
    expect(can.editTask(m('approver'), { unitId: 'a' })).toBe(false);
    expect(can.updateTaskProgress(m('member'), { unitId: 'a', assigneeUid: 'me' })).toBe(true);
    expect(can.updateTaskProgress(m('member'), { unitId: 'a', collaboratorUids: ['me'] })).toBe(true);
    expect(can.updateTaskProgress(m('member'), { unitId: 'a', assigneeUid: 'other' })).toBe(false);
  });
  it('duyệt và kinh phí', () => {
    expect(can.decideApproval(m('approver'))).toBe(true);
    expect(can.decideApproval(m('manager', ['a']))).toBe(false);
    expect(can.readBudget(m('member'))).toBe(false);
    expect(can.readBudget(m('lecturer'))).toBe(false);
    expect(can.decideBudget(m('owner'))).toBe(true);
    expect(can.decideBudget(null)).toBe(false);
  });
});

describe('reports & calendar', () => {
  it('phân bổ trạng thái loại trừ việc hủy', () => {
    const r = taskStatusBreakdown(
      [{ status: 'Hoàn thành' }, { status: 'Đang thực hiện', dueDate: '2026-01-01' }, { status: 'Chờ phê duyệt' }, { status: 'Tạm hoãn/Hủy' }],
      TODAY,
    );
    expect(r.total).toBe(3);
    expect(r.rows.map((x) => x.count)).toEqual([1, 0, 1, 1]);
    expect(taskStatusBreakdown([]).rows[0].percent).toBe(0);
  });
  it('tỷ lệ đúng hạn và thời gian duyệt trung bình', () => {
    expect(
      onTimeRate([
        { status: 'Hoàn thành', dueDate: '2026-11-10', completedOn: '2026-11-09' },
        { status: 'Hoàn thành', dueDate: '2026-11-10', completedOn: '2026-11-12' },
      ]).percent,
    ).toBe(50);
    expect(avgApprovalDays([])).toBe(null);
    const a = {
      status: 'Đã duyệt',
      history: [
        { action: 'Gửi duyệt', at: '2026-10-01T08:00:00' },
        { action: 'Duyệt: Chi ủy', at: '2026-10-05T08:00:00' },
        { action: 'Duyệt: Trường', at: '2026-10-21T08:00:00' },
      ],
    };
    expect(avgApprovalDays([a])).toBe(20);
  });
  it('CSV có BOM, escape dấu phẩy/ngoặc và chặn công thức', () => {
    const csv = toCsv([
      ['Tên', 'Ghi chú'],
      ['A, B', '=HYPERLINK("x")'],
      ['"q"', null],
    ]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('"A, B"');
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).toContain('"""q"""');
  });
  it('lịch gộp mốc, bỏ việc đã đóng và thông báo đã hoàn tất', () => {
    const items = calendarItems({
      tasks: [
        { id: 't', title: 'A', dueDate: '2026-11-05', status: 'Đang thực hiện' },
        { id: 't2', title: 'B', dueDate: '2026-11-05', status: 'Hoàn thành' },
      ],
      events: [{ id: 'e', title: 'Hội thao', date: '2026-11-18' }],
      notices: [{ id: 'n', title: 'Hội diễn', deadline: '2026-11-14', status: 'Đã hoàn tất' }],
    });
    expect(items.map((i) => i.refId)).toEqual(['t', 'e']);
    expect(itemsByDate(items).get('2026-11-05')).toHaveLength(1);
    expect(calendarItems({ tasks: [{ id: 't', title: 'A', dueDate: '2026-11-05', status: 'x' }] }, { task: false }).length).toBe(0);
  });
});
