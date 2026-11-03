import { describe, it, expect } from 'vitest';
import { sharePercents, statusSegments, dueBuckets, weeklyFlow, niceScale, compactVnd } from '../../src/domain/insights.js';

const TODAY = '2026-11-04';
const t = (over) => ({ status: 'Đang thực hiện', dueDate: '2026-11-20', progress: 0, checklist: [], ...over });

describe('sharePercents', () => {
  it('luôn cộng đúng 100 và không cấp % cho nhóm rỗng', () => {
    expect(sharePercents([1, 1, 1]).reduce((a, b) => a + b, 0)).toBe(100);
    expect(sharePercents([0, 1, 2])).toEqual([0, 33, 67]);
    expect(sharePercents([0, 0])).toEqual([0, 0]);
  });
});

describe('statusSegments', () => {
  it('quá hạn thắng trạng thái lưu, bỏ việc hủy, các nhóm loại trừ nhau', () => {
    const tasks = [
      t({ status: 'Hoàn thành', dueDate: '2026-01-01' }),
      t({ dueDate: '2026-10-01' }), // quá hạn
      t({ status: 'Chờ phê duyệt' }),
      t({ status: 'Chưa bắt đầu' }),
      t(),
      t({ status: 'Tạm hoãn/Hủy' }),
    ];
    const r = statusSegments(tasks, TODAY);
    expect(r.total).toBe(5);
    expect(Object.fromEntries(r.parts.map((p) => [p.key, p.count]))).toEqual({ done: 1, doing: 1, todo: 1, waiting: 1, overdue: 1 });
    expect(r.parts.reduce((s, p) => s + p.percent, 0)).toBe(100);
  });
});

describe('dueBuckets', () => {
  it('chia việc đang mở theo tuần, đếm riêng quá hạn và việc chưa có Deadline', () => {
    const tasks = [
      t({ dueDate: '2026-11-01' }), // quá hạn
      t({ dueDate: '2026-11-04' }), // tuần 0
      t({ dueDate: '2026-11-10' }), // tuần 0 (hết ngày thứ 7)
      t({ dueDate: '2026-11-11' }), // tuần 1
      t({ dueDate: '2027-03-01' }), // sau đó
      t({ dueDate: null }),
      t({ status: 'Hoàn thành', dueDate: '2026-11-05' }), // đã đóng: không tính
    ];
    const { buckets, noDue } = dueBuckets(tasks, TODAY);
    const by = Object.fromEntries(buckets.map((b) => [b.key, b.count]));
    expect(by).toMatchObject({ overdue: 1, w0: 2, w1: 1, later: 1 });
    expect(noDue).toBe(1);
    expect(buckets).toHaveLength(8);
  });
});

describe('weeklyFlow', () => {
  it('đếm việc tạo mới và hoàn thành đúng tuần, tuần cuối kết thúc hôm nay', () => {
    const rows = weeklyFlow(
      [t({ createdAt: new Date(2026, 10, 3), status: 'Hoàn thành', completedOn: '2026-11-04' }), t({ createdAt: new Date(2026, 9, 20) })],
      TODAY,
      4,
    );
    expect(rows).toHaveLength(4);
    expect(rows[3].to).toBe(TODAY);
    expect(rows[3]).toMatchObject({ created: 1, completed: 1 });
    expect(rows.reduce((s, r) => s + r.created, 0)).toBe(2);
  });
});

describe('niceScale / compactVnd', () => {
  it('trục tròn, bắt đầu từ 0 và bao trọn giá trị lớn nhất', () => {
    for (const m of [0, 1, 3, 7, 12, 99, 1500]) {
      const s = niceScale(m);
      expect(s.ticks[0]).toBe(0);
      expect(s.max).toBeGreaterThanOrEqual(m);
      expect(s.ticks.at(-1)).toBe(s.max);
    }
    expect(niceScale(3).ticks.every(Number.isInteger)).toBe(true);
  });
  it('rút gọn tiền', () => {
    expect(compactVnd(1_500_000)).toBe('1,5 tr');
    expect(compactVnd(12_000)).toBe('12 N');
    expect(compactVnd(2_000_000_000)).toBe('2 tỷ');
    expect(compactVnd(500)).toBe('500');
  });
});

describe('initials', () => {
  it('lấy chữ cái đầu của hai từ cuối, bỏ ký tự không phải chữ', async () => {
    const { initials } = await import('../../src/ui/kit.js');
    expect(initials('Lê Đình Hạc')).toBe('ĐH');
    expect(initials('Khoa FinTech (Demo)')).toBe('KF');
    expect(initials('Crew')).toBe('CR');
    expect(initials('')).toBe('?');
    expect(initials('(??)')).toBe('?');
  });
});
