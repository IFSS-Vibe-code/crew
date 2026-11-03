import { test, expect } from '@playwright/test';

const PROJECT = 'demo-crewwork';
const EMU = 'http://127.0.0.1:9099';
const rnd = () => Math.random().toString(36).slice(2, 8);

/** Xác minh email bằng liên kết oobCode mà Auth Emulator tạo ra (thay cho việc mở hộp thư). */
async function verifyViaEmulator(email) {
  const r = await fetch(`${EMU}/emulator/v1/projects/${PROJECT}/oobCodes`);
  const { oobCodes } = await r.json();
  const code = [...oobCodes].reverse().find((c) => c.email === email && c.requestType === 'VERIFY_EMAIL');
  if (!code) throw new Error('Không thấy mã xác minh');
  const res = await fetch(code.oobLink.replace('localhost', '127.0.0.1'));
  if (!res.ok && res.status !== 200) throw new Error('verify failed ' + res.status);
}

async function signUp(page, email, name) {
  await page.goto('/');
  // Hồi quy: màn hình tải/đăng nhập không được hiện nguyên thẻ HTML dưới dạng chữ (lỗi escape).
  await expect(page.getByRole('heading', { name: 'Đăng nhập' })).toBeVisible();
  await expect(page.locator('body')).not.toContainText('<div');
  await page.getByRole('button', { name: 'Đăng ký' }).click();
  await page.getByLabel('Họ và tên', { exact: true }).fill(name);
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill('matkhau123');
  await page.getByRole('button', { name: 'Tạo tài khoản' }).click();
  await expect(page.getByRole('heading', { name: 'Xác minh email' })).toBeVisible();
  await verifyViaEmulator(email);
  await page.getByRole('button', { name: 'Tôi đã xác minh' }).click();
  await expect(page.getByRole('heading', { name: 'Không gian làm việc' })).toBeVisible();
}

test.describe.configure({ mode: 'serial' });

let consoleErrors = [];
let failedRequests = [];
let page; // một phiên trình duyệt dùng chung cho các test tuần tự (giữ đăng nhập)
test.beforeAll(async ({ browser }) => {
  page = await (await browser.newContext()).newPage();
});
test.afterAll(async () => {
  await page.context().close();
});
let listening = false;
test.beforeEach(() => {
  consoleErrors = [];
  failedRequests = [];
  if (listening) return;
  listening = true;
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push('PAGEERROR ' + e.message));
  page.on('requestfailed', (r) => {
    if (!r.url().includes('/Listen/channel') && !r.url().includes('/Write/channel')) failedRequests.push(`${r.method()} ${r.url()} ${r.failure()?.errorText}`);
  });
});

const owner = `owner-${rnd()}@khoa.test`;
const ownerPage = { name: 'Lê Đình Hạc' };

test('Đăng ký → xác minh → tạo Workspace → tổng quan', async () => {
  await signUp(page, owner, ownerPage.name);
  await page.getByLabel('Tên Khoa / CLB / tổ chức', { exact: true }).fill('Khoa FinTech');
  await page.getByLabel('Năm học', { exact: true }).fill('2026 – 2027');
  await page.getByRole('button', { name: /Tạo Workspace/ }).click();
  await expect(page.getByRole('heading', { name: 'Tổng quan hoạt động' })).toBeVisible();
  await expect(page.locator('#userName')).toHaveText(ownerPage.name);
  await expect(page.locator('#syncText')).toHaveText('Đã đồng bộ', { timeout: 15_000 });
  await page.getByRole('link', { name: /Ban \/ CLB \/ Bộ phận/ }).click();
  await expect(page.getByRole('heading', { name: 'Ban Sự kiện' })).toBeVisible();
  expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
  expect(failedRequests).toEqual([]);
});

test('Công việc: tạo → xác thực → danh sách/bảng → tự lưu mô tả → reload vẫn đúng', async () => {
  await page.goto('/#/tasks');
  await expect(page.getByRole('heading', { name: 'Quản lý công việc' })).toBeVisible();
  await expect(page.getByText('Chưa có công việc phù hợp')).toBeVisible();

  await page.getByRole('button', { name: /Tạo công việc/ }).click();
  await page.getByRole('button', { name: 'Tạo công việc', exact: true }).click(); // submit rỗng
  await expect(page.getByText('Tên công việc là bắt buộc.')).toBeVisible();
  await page.getByLabel('Tên công việc *', { exact: true }).fill('Hoàn thiện kế hoạch Hội thảo');
  await page.getByLabel('Người phụ trách', { exact: true }).selectOption({ label: ownerPage.name });
  await page.getByLabel('Deadline', { exact: true }).fill('2020-01-01');
  await page.getByRole('button', { name: 'Tạo công việc', exact: true }).click();
  await expect(page.getByText('Đã tạo công việc.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Hoàn thiện kế hoạch Hội thảo' }).first()).toBeVisible();
  await expect(page.getByText('#TK-001')).toBeVisible();
  await expect(page.locator('td .pill', { hasText: 'Quá hạn' })).toBeVisible(); // Deadline 2020 → quá hạn (suy ra)

  // Mở chi tiết, tự lưu mô tả
  await page.getByRole('button', { name: 'Hoàn thiện kế hoạch Hội thảo' }).first().click();
  const drawer = page.getByRole('dialog', { name: 'Chi tiết công việc' });
  await drawer.getByPlaceholder('Thêm mô tả…').fill('Mô tả được tự lưu');
  await expect(drawer.locator('#dSave')).toHaveText('Đã lưu', { timeout: 10_000 });
  // Checklist + tiến độ
  await drawer.getByLabel('Mục checklist mới', { exact: true }).fill('Soạn kế hoạch');
  await drawer.getByRole('button', { name: 'Thêm', exact: true }).first().click();
  await expect(drawer.getByText('Soạn kế hoạch')).toBeVisible();
  await drawer.getByLabel('Soạn kế hoạch', { exact: true }).check();
  await expect(drawer.getByText('100% (theo checklist)')).toBeVisible();
  // Hoàn thành khi chưa có minh chứng → bị chặn
  await drawer.locator('#pStatus').selectOption('Hoàn thành');
  await expect(page.getByText('Cần đính kèm ít nhất một minh chứng')).toBeVisible();
  // Minh chứng link http bị từ chối, https được nhận
  await drawer.getByLabel('Tên minh chứng', { exact: true }).fill('Kế hoạch');
  await drawer.getByLabel('Link minh chứng', { exact: true }).fill('http://khong-an-toan.test');
  await drawer.getByRole('button', { name: 'Thêm', exact: true }).nth(1).click();
  await expect(page.getByText('Nhập tên và link bắt đầu bằng https://')).toBeVisible();
  await drawer.getByLabel('Link minh chứng', { exact: true }).fill('https://drive.google.com/file/x');
  await drawer.getByRole('button', { name: 'Thêm', exact: true }).nth(1).click();
  await expect(drawer.getByRole('link', { name: 'Kế hoạch' })).toBeVisible();
  await drawer.locator('#pStatus').selectOption('Hoàn thành');
  await expect(drawer.locator('#pStatus')).toHaveValue('Hoàn thành');
  // Bình luận
  await drawer.getByLabel('Bình luận', { exact: true }).fill('<img src=x onerror=alert(1)> ok');
  await drawer.getByRole('button', { name: 'Gửi bình luận' }).click();
  await expect(drawer.getByText('<img src=x onerror=alert(1)> ok')).toBeVisible(); // hiển thị như văn bản, không thực thi
  await expect(drawer.locator('.comment img')).toHaveCount(0);
  await page.keyboard.press('Escape');

  // Chế độ bảng
  await page.getByRole('button', { name: /Bảng/ }).click();
  await expect(page.locator('[data-col="Hoàn thành"] .kcard')).toHaveCount(1);

  // Reload: dữ liệu vẫn đúng
  await page.reload();
  await expect(page.locator('[data-col="Hoàn thành"] .kcard')).toHaveCount(1); // kiểu xem Bảng được nhớ
  await page.getByRole('button', { name: /Danh sách/ }).click();
  await page.getByRole('button', { name: 'Hoàn thiện kế hoạch Hội thảo' }).first().click();
  await expect(page.getByPlaceholder('Thêm mô tả…')).toHaveValue('Mô tả được tự lưu');
  expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
  expect(failedRequests).toEqual([]);
});

test('Chương trình, thông báo Trường, phê duyệt hai cấp, kinh phí, tài liệu, báo cáo', async () => {
  await page.goto('/#/events');
  await page.getByRole('button', { name: /Tạo chương trình/ }).click();
  await page.getByLabel('Tên chương trình *', { exact: true }).fill('Hội thao sinh viên 2026');
  await page.getByLabel('Ngày tổ chức', { exact: true }).fill('2026-11-18');
  await page.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Hội thao sinh viên 2026' })).toBeVisible();

  await page.goto('/#/inbox');
  await page.getByRole('button', { name: /Ghi nhận thông báo/ }).click();
  await page.getByLabel('Tên chương trình / thông báo *', { exact: true }).fill('Hội diễn văn nghệ cấp Trường');
  await page.getByLabel('Hạn đăng ký', { exact: true }).fill('2026-11-14');
  await page.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Hội diễn văn nghệ cấp Trường' })).toBeVisible();
  await page.getByRole('button', { name: /Tạo nhiệm vụ/ }).click();
  await expect(page.getByLabel('Tên công việc *', { exact: true })).toHaveValue('Đăng ký: Hội diễn văn nghệ cấp Trường');
  await page.getByRole('button', { name: 'Tạo công việc', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Chi tiết công việc' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByText('Đã phân công')).toBeVisible();

  await page.goto('/#/approvals');
  await page.getByRole('button', { name: /Lập hồ sơ duyệt/ }).click();
  await page.getByLabel('Tên chương trình *', { exact: true }).fill('Hội thao sinh viên 2026');
  await page.getByRole('button', { name: 'Lưu hồ sơ', exact: true }).click();
  await expect(page.getByText('Đang soạn')).toBeVisible();
  await page.getByRole('button', { name: 'Gửi duyệt' }).click();
  await expect(page.getByText('Chờ Chi ủy duyệt')).toBeVisible();
  await page.getByRole('button', { name: 'Yêu cầu sửa' }).click();
  await page.getByRole('button', { name: 'Trả hồ sơ' }).click();
  await expect(page.getByText('Vui lòng nhập nội dung.')).toBeVisible();
  await page.getByLabel('Nội dung cần sửa / bổ sung', { exact: true }).fill('Bổ sung dự toán');
  await page.getByRole('button', { name: 'Trả hồ sơ' }).click();
  await expect(page.getByText('Trả về đơn vị lập kế hoạch')).toBeVisible();
  await expect(page.getByText('Phản hồi: “Bổ sung dự toán”')).toBeVisible();
  await page.getByRole('button', { name: 'Gửi lại' }).click();
  await page.getByRole('button', { name: 'Duyệt', exact: true }).click();
  await page.getByRole('button', { name: 'Duyệt', exact: true }).last().click();
  await expect(page.getByText('Chờ Đoàn trường / Hội Sinh viên duyệt')).toBeVisible();
  await page.getByRole('button', { name: 'Duyệt', exact: true }).click();
  await page.getByRole('button', { name: 'Duyệt', exact: true }).last().click();
  await expect(page.locator('td .pill', { hasText: 'Đã duyệt' })).toBeVisible();

  await page.goto('/#/budget');
  await page.getByRole('button', { name: /Ghi nhận khoản/ }).click();
  await page.getByLabel('Loại khoản', { exact: true }).selectOption('thu');
  await page.getByLabel('Số tiền (VNĐ) *', { exact: true }).fill('-5');
  await page.getByLabel('Nội dung khoản *', { exact: true }).fill('Quỹ đầu năm');
  await page.getByRole('button', { name: 'Gửi đề xuất' }).click();
  await expect(page.getByText('Số tiền phải là số nguyên dương.')).toBeVisible();
  await page.getByLabel('Số tiền (VNĐ) *', { exact: true }).fill('25.000.000');
  await page.getByRole('button', { name: 'Gửi đề xuất' }).click();
  await expect(page.getByText('Đã ghi nhận khoản (chờ duyệt).')).toBeVisible();
  await page.getByRole('button', { name: 'Duyệt', exact: true }).click();
  await expect(page.locator('.stat', { hasText: 'Số dư' }).locator('strong')).toContainText('25.000.000');

  await page.goto('/#/docs');
  await page.getByRole('button', { name: /Thêm tài liệu/ }).click();
  await page.getByLabel('Tên tài liệu *', { exact: true }).fill('Mẫu kế hoạch');
  await page.getByLabel('Link tài liệu (https) *', { exact: true }).fill('javascript:alert(1)');
  await page.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(page.getByText(/phải bắt đầu bằng https/)).toBeVisible();
  await page.getByLabel('Link tài liệu (https) *', { exact: true }).fill('https://drive.google.com/x');
  await page.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(page.getByRole('link', { name: /Mẫu kế hoạch/ })).toHaveAttribute('href', 'https://drive.google.com/x');

  await page.goto('/#/calendar');
  await expect(page.getByRole('button', { name: /Hạn ĐK: Hội diễn/ }).or(page.getByText('Không có mốc thời gian nào sắp tới.'))).toBeVisible();
  await page.goto('/#/reports');
  await expect(page.getByRole('heading', { name: 'Báo cáo & thống kê' })).toBeVisible();
  await expect(page.locator('.stat', { hasText: 'Chương trình' }).locator('strong')).toHaveText('1');
  expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
  expect(failedRequests).toEqual([]);
});

test('Mời thành viên: người ngoài không thấy dữ liệu; thành viên chỉ thấy việc được giao', async ({ browser }) => {
  // Người lạ đăng ký: không thấy Workspace của owner
  const stranger = `stranger-${rnd()}@khoa.test`;
  const ctx1 = await browser.newContext();
  const p1 = await ctx1.newPage();
  await signUp(p1, stranger, 'Người Lạ');
  await expect(p1.getByText('Khoa FinTech')).toHaveCount(0);
  await ctx1.close();

  // Owner mời một thành viên và giao việc
  const member = `member-${rnd()}@khoa.test`;
  await page.goto('/#/members');
  await page.getByRole('button', { name: /Mời thành viên/ }).click();
  await page.getByLabel('Email *', { exact: true }).fill(member);
  await page.getByLabel('Tên hiển thị (gợi ý)', { exact: true }).fill('Trần Gia Hân');
  await page.getByRole('button', { name: 'Gửi lời mời' }).click();
  await expect(page.getByRole('cell', { name: member })).toBeVisible();

  const ctx2 = await browser.newContext();
  const p2 = await ctx2.newPage();
  await signUp(p2, member, 'Trần Gia Hân');
  await expect(p2.getByText('Bạn có 1 lời mời')).toBeVisible();
  await p2.getByRole('button', { name: 'Tham gia' }).click();
  await expect(p2.getByRole('heading', { name: 'Tổng quan hoạt động' })).toBeVisible();
  await expect(p2.getByRole('link', { name: /Kinh phí/ })).toBeHidden(); // Thành viên không thấy mục Kinh phí
  await expect(p2.getByRole('link', { name: /Thành viên & phân quyền/ })).toBeHidden();
  await p2.goto('/#/tasks');
  await expect(p2.getByText('Chưa có công việc phù hợp')).toBeVisible(); // chưa được giao việc nào
  await expect(p2.getByRole('button', { name: /Tạo công việc/ })).toHaveCount(0);

  // Owner giao việc cho Hân
  await page.goto('/#/tasks');
  await page.getByRole('button', { name: /Tạo công việc/ }).click();
  await page.getByLabel('Tên công việc *', { exact: true }).fill('Việc của Hân');
  await page.getByLabel('Người phụ trách', { exact: true }).selectOption({ label: 'Trần Gia Hân' });
  await page.getByRole('button', { name: 'Tạo công việc', exact: true }).click();
  await page.keyboard.press('Escape');

  // Hân thấy việc realtime (không cần reload), đổi trạng thái được nhưng không sửa tiêu đề
  await expect(p2.getByRole('button', { name: 'Việc của Hân' })).toBeVisible({ timeout: 15_000 });
  await p2.getByRole('button', { name: 'Việc của Hân' }).click();
  const d = p2.getByRole('dialog', { name: 'Chi tiết công việc' });
  await expect(d.locator('#dTitle')).toHaveAttribute('readonly', '');
  await d.locator('#pStatus').selectOption('Đang thực hiện');
  await expect(d.locator('#pStatus')).toHaveValue('Đang thực hiện');
  // Owner thấy cập nhật realtime
  await expect(page.locator('tr', { hasText: 'Việc của Hân' }).locator('.pill')).toHaveText('Đang thực hiện', { timeout: 15_000 });

  // ---- Trao đổi (chat) giữa hai người, realtime ----
  await p2.keyboard.press('Escape');
  await page.goto('/#/chat');
  await expect(page.getByRole('heading', { name: 'Trao đổi' })).toBeVisible();
  // Owner thấy kênh chung + mọi kênh Ban; Hân (chưa thuộc Ban nào) chỉ thấy kênh chung
  await expect(page.locator('[data-chat]')).toHaveCount(7);
  await p2.goto('/#/overview');
  await expect(p2.getByRole('link', { name: /Trao đổi/ })).toBeVisible();
  // Owner gửi tin: chuỗi HTML phải hiện như chữ, link https được bấm được
  const compose = page.getByLabel('Tin nhắn tới Toàn Workspace');
  await compose.fill('Chào Hân <b>đậm</b> https://drive.google.com/x');
  await compose.press('Enter');
  await expect(compose).toHaveValue('');
  await expect(page.locator('.msg.mine .bubble p').last()).toContainText('Chào Hân <b>đậm</b>');
  await expect(page.locator('.bubble b')).toHaveCount(0);
  // Hân thấy chấm "chưa đọc" ở mục Trao đổi mà không cần tải lại
  await expect(p2.locator('[data-count="chat"]')).toHaveText('1', { timeout: 15_000 });
  await p2.getByRole('link', { name: /Trao đổi/ }).click();
  await expect(p2.locator('[data-chat]')).toHaveCount(1);
  await expect(p2.getByText('Chào Hân <b>đậm</b>')).toBeVisible();
  await expect(p2.getByRole('link', { name: 'https://drive.google.com/x' })).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(p2.locator('[data-count="chat"]')).toBeHidden(); // đã đọc
  // Shift+Enter xuống dòng, Enter gửi; tin xuất hiện bên Owner realtime
  const c2 = p2.getByLabel('Tin nhắn tới Toàn Workspace');
  await c2.fill('Dạ em');
  await c2.press('Shift+Enter');
  await c2.pressSequentially('đã nhận');
  await expect(c2).toHaveValue('Dạ em\nđã nhận');
  await c2.press('Enter');
  await expect(page.locator('.msg:not(.mine) .bubble p').last()).toHaveText('Dạ em\nđã nhận', { timeout: 15_000 });
  // Đang gõ dở thì có tin mới đến: nội dung đang gõ không bị mất
  await c2.fill('đang soạn dở');
  await compose.fill('Tin thứ hai');
  await compose.press('Enter');
  await expect(p2.getByText('Tin thứ hai')).toBeVisible({ timeout: 15_000 });
  await expect(c2).toHaveValue('đang soạn dở');
  // Hân không xóa được tin của Owner (không có nút); xóa được tin của mình
  await expect(p2.locator('.msg:not(.mine) [data-del-msg]')).toHaveCount(0);
  await p2.locator('.msg.mine .bubble').last().hover();
  await p2.locator('.msg.mine [data-del-msg]').last().click();
  await p2.getByRole('button', { name: 'Xóa', exact: true }).click();
  await expect(page.getByText('Dạ em')).toHaveCount(0, { timeout: 15_000 });
  // Kênh Ban: Owner gửi vào Ban Sự kiện; Hân không thấy kênh đó và không thấy tin
  await page.locator('[data-chat]', { hasText: 'Ban Sự kiện' }).click();
  await page.getByLabel('Tin nhắn tới Ban Sự kiện').fill('Tin nội bộ Ban');
  await page.getByLabel('Tin nhắn tới Ban Sự kiện').press('Enter');
  await expect(page.getByText('Tin nội bộ Ban')).toBeVisible();
  await expect(p2.getByText('Tin nội bộ Ban')).toHaveCount(0);
  await page.locator('[data-chat]', { hasText: 'Toàn Workspace' }).click();
  await expect(page.getByText('Tin thứ hai')).toBeVisible();
  await page.screenshot({ path: 'test-results/shots/chat-desktop.png' });
  await p2.reload();
  await expect(p2.getByText('Tin thứ hai')).toBeVisible(); // reload vẫn còn lịch sử
  await expect(p2.getByText('Tin nội bộ Ban')).toHaveCount(0);

  // Đăng xuất rồi đăng nhập tài khoản khác: không còn dữ liệu của người trước
  await p2.keyboard.press('Escape');
  await p2.getByRole('button', { name: 'Đăng xuất' }).click();
  await expect(p2.getByRole('heading', { name: 'Đăng nhập' })).toBeVisible();
  await expect(p2.getByText('Việc của Hân')).toHaveCount(0);
  await expect(p2.getByText('Tin thứ hai')).toHaveCount(0);
  await ctx2.close();
});

test('Responsive: không tràn ngang trên điện thoại; menu mở được', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 760 } });
  const p = await ctx.newPage();
  await p.goto('/');
  await p.getByLabel('Email', { exact: true }).fill(owner);
  await p.getByLabel('Mật khẩu', { exact: true }).fill('matkhau123');
  await p.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await p.getByRole('button', { name: /Khoa FinTech/ }).click(); // phiên mới chưa nhớ Workspace gần nhất
  await expect(p.getByRole('heading', { name: 'Tổng quan hoạt động' })).toBeVisible({ timeout: 20_000 });
  for (const page of ['overview', 'chat', 'tasks', 'events', 'approvals', 'calendar', 'budget', 'reports']) {
    await p.goto(`/#/${page}`);
    await p.waitForTimeout(300);
    if (page === 'chat') await p.screenshot({ path: 'test-results/shots/chat-mobile.png' });
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `tràn ngang ở trang ${page}`).toBeLessThanOrEqual(1);
  }
  await p.getByRole('button', { name: 'Mở menu' }).click();
  await expect(p.getByRole('link', { name: 'Công việc' })).toBeVisible();
  await ctx.close();
});
