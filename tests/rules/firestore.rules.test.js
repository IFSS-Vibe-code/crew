import { describe, it, beforeAll, beforeEach, afterAll } from 'vitest';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  getDocs,
  query,
  where,
  writeBatch,
  serverTimestamp,
  collectionGroup,
  increment,
} from 'firebase/firestore';
import { makeEnv, seed, dbAs, USERS, WS, baseTask, SETTINGS } from './helpers.js';

let env;
beforeAll(async () => {
  env = await makeEnv();
});
afterAll(async () => {
  await env?.cleanup();
});
beforeEach(async () => {
  await env.clearFirestore();
  await seed(env);
});

const now = () => ({ createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
const stamp = (u) => ({ updatedAt: serverTimestamp(), updatedBy: u.uid });

describe('Người chưa đăng nhập / chưa xác minh', () => {
  it('khách không đọc được Workspace, công việc, thành viên', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, `workspaces/${WS}`)));
    await assertFails(getDoc(doc(db, `workspaces/${WS}/tasks/t1`)));
    await assertFails(getDocs(collection(db, `workspaces/${WS}/members`)));
  });
  it('thành viên chưa xác minh email bị từ chối', async () => {
    await assertFails(getDoc(doc(dbAs(env, USERS.owner, { verified: false }), `workspaces/${WS}`)));
  });
  it('người ngoài Workspace bị từ chối', async () => {
    const out = dbAs(env, { uid: 'stranger', email: 'x@y.test' });
    await assertFails(getDoc(doc(out, `workspaces/${WS}`)));
    await assertFails(getDoc(doc(out, `workspaces/${WS}/tasks/t1`)));
  });
  it('đường dẫn chưa khai báo quyền bị từ chối', async () => {
    const db = dbAs(env, USERS.owner);
    await assertFails(setDoc(doc(db, 'random/x'), { a: 1 }));
    await assertFails(getDoc(doc(db, `workspaces/${WS}/secret/x`)));
  });
});

describe('Tạo Workspace', () => {
  const wsData = (u) => ({
    name: 'CLB Học thuật',
    type: 'CLB / tổ chức sinh viên',
    academicYear: '2026 – 2027',
    contactEmail: '',
    ownerUid: u.uid,
    settings: SETTINGS,
    ...now(),
    updatedBy: u.uid,
  });
  const memberData = (u, role = 'owner') => ({
    uid: u.uid,
    email: u.email,
    displayName: 'Chủ',
    role,
    unitIds: [],
    joinedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  it('người dùng tạo Workspace mới và tự làm Owner trong một batch', async () => {
    const u = { uid: 'newbie', email: 'newbie@khoa.test' };
    const db = dbAs(env, u);
    const b = writeBatch(db);
    b.set(doc(db, 'workspaces/ws2'), wsData(u));
    b.set(doc(db, 'workspaces/ws2/members/newbie'), memberData(u));
    b.set(doc(db, 'users/newbie/memberships/ws2'), { workspaceId: 'ws2', workspaceName: 'CLB Học thuật', joinedAt: serverTimestamp() });
    await assertSucceeds(b.commit());
  });
  it('không thể tự thêm mình làm Owner của Workspace đã tồn tại', async () => {
    const u = { uid: 'attacker', email: 'a@x.test' };
    const db = dbAs(env, u);
    await assertFails(setDoc(doc(db, `workspaces/${WS}/members/attacker`), memberData(u)));
  });
  it('không thể tạo Workspace với ownerUid của người khác', async () => {
    const u = { uid: 'newbie', email: 'newbie@khoa.test' };
    const db = dbAs(env, u);
    const b = writeBatch(db);
    b.set(doc(db, 'workspaces/ws3'), { ...wsData(u), ownerUid: 'someone' });
    b.set(doc(db, 'workspaces/ws3/members/newbie'), memberData(u));
    await assertFails(b.commit());
  });
  it('Owner không thể đổi ownerUid; người khác không sửa được Workspace', async () => {
    await assertFails(updateDoc(doc(dbAs(env, USERS.owner), `workspaces/${WS}`), { ownerUid: 'x', ...stamp(USERS.owner) }));
    await assertFails(updateDoc(doc(dbAs(env, USERS.manager), `workspaces/${WS}`), { name: 'Hack', ...stamp(USERS.manager) }));
    await assertSucceeds(updateDoc(doc(dbAs(env, USERS.owner), `workspaces/${WS}`), { name: 'Khoa FinTech 2', ...stamp(USERS.owner) }));
  });
  it('không ai được xóa Workspace từ client', async () => {
    await assertFails(deleteDoc(doc(dbAs(env, USERS.owner), `workspaces/${WS}`)));
  });
});

describe('Thành viên, vai trò và lời mời', () => {
  it('thành viên không thể tự nâng quyền lên owner', async () => {
    const db = dbAs(env, USERS.member);
    await assertFails(updateDoc(doc(db, `workspaces/${WS}/members/${USERS.member.uid}`), { role: 'owner', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(db, `workspaces/${WS}/members/${USERS.member.uid}`), { unitIds: ['unitA'], updatedAt: serverTimestamp() }));
  });
  it('thành viên được đổi tên hiển thị của chính mình', async () => {
    const db = dbAs(env, USERS.member);
    await assertSucceeds(updateDoc(doc(db, `workspaces/${WS}/members/${USERS.member.uid}`), { displayName: 'Hân', updatedAt: serverTimestamp() }));
  });
  it('Trưởng Ban không đổi được vai trò người khác; Owner thì được', async () => {
    const ref = (db) => doc(db, `workspaces/${WS}/members/${USERS.member.uid}`);
    await assertFails(updateDoc(ref(dbAs(env, USERS.manager)), { role: 'manager', updatedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(ref(dbAs(env, USERS.owner)), { role: 'manager', unitIds: ['unitA'], updatedAt: serverTimestamp() }));
  });
  it('không thể hạ quyền hoặc xóa chủ sở hữu gốc', async () => {
    const db = dbAs(env, USERS.owner);
    await assertFails(updateDoc(doc(db, `workspaces/${WS}/members/${USERS.owner.uid}`), { role: 'member', updatedAt: serverTimestamp() }));
    await assertFails(deleteDoc(doc(db, `workspaces/${WS}/members/${USERS.owner.uid}`)));
  });
  it('mời → người được mời (đúng email, đã xác minh) nhận lời mời', async () => {
    const guest = { uid: 'guest', email: 'guest@khoa.test' };
    const ownerDb = dbAs(env, USERS.owner);
    const invite = {
      workspaceId: WS,
      workspaceName: 'Khoa FinTech',
      email: guest.email,
      role: 'manager',
      unitIds: ['unitB'],
      displayName: 'Khách',
      invitedBy: USERS.owner.uid,
      createdAt: serverTimestamp(),
    };
    await assertSucceeds(setDoc(doc(ownerDb, `workspaces/${WS}/invites/${guest.email}`), invite));

    const gdb = dbAs(env, guest);
    const found = await assertSucceeds(getDocs(query(collectionGroup(gdb, 'invites'), where('email', '==', guest.email))));
    if (found.size !== 1) throw new Error('Không tìm thấy lời mời');

    // Không được tự nâng quyền khác với lời mời
    const bad = writeBatch(gdb);
    bad.set(doc(gdb, `workspaces/${WS}/members/guest`), {
      uid: 'guest',
      email: guest.email,
      displayName: 'Khách',
      role: 'owner',
      unitIds: ['unitB'],
      joinedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    bad.delete(doc(gdb, `workspaces/${WS}/invites/${guest.email}`));
    await assertFails(bad.commit());

    const ok = writeBatch(gdb);
    ok.set(doc(gdb, `workspaces/${WS}/members/guest`), {
      uid: 'guest',
      email: guest.email,
      displayName: 'Khách',
      role: 'manager',
      unitIds: ['unitB'],
      joinedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    ok.delete(doc(gdb, `workspaces/${WS}/invites/${guest.email}`));
    ok.set(doc(gdb, `users/guest/memberships/${WS}`), { workspaceId: WS, workspaceName: 'Khoa FinTech', joinedAt: serverTimestamp() });
    await assertSucceeds(ok.commit());
  });
  it('người khác email hoặc chưa xác minh không nhận được lời mời', async () => {
    const ownerDb = dbAs(env, USERS.owner);
    await setDoc(doc(ownerDb, `workspaces/${WS}/invites/guest@khoa.test`), {
      workspaceId: WS,
      workspaceName: 'K',
      email: 'guest@khoa.test',
      role: 'member',
      unitIds: [],
      displayName: '',
      invitedBy: USERS.owner.uid,
      createdAt: serverTimestamp(),
    });
    const thief = { uid: 'thief', email: 'thief@x.test' };
    const tdb = dbAs(env, thief);
    await assertFails(getDoc(doc(tdb, `workspaces/${WS}/invites/guest@khoa.test`)));
    const b = writeBatch(tdb);
    b.set(doc(tdb, `workspaces/${WS}/members/thief`), {
      uid: 'thief',
      email: thief.email,
      displayName: 'T',
      role: 'member',
      unitIds: [],
      joinedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await assertFails(b.commit());
    const unverified = dbAs(env, { uid: 'guest', email: 'guest@khoa.test' }, { verified: false });
    await assertFails(getDoc(doc(unverified, `workspaces/${WS}/invites/guest@khoa.test`)));
  });
  it('Trưởng Ban không tạo được lời mời', async () => {
    await assertFails(
      setDoc(doc(dbAs(env, USERS.manager), `workspaces/${WS}/invites/z@z.test`), {
        workspaceId: WS,
        workspaceName: 'K',
        email: 'z@z.test',
        role: 'member',
        unitIds: [],
        displayName: '',
        invitedBy: USERS.manager.uid,
        createdAt: serverTimestamp(),
      }),
    );
  });
  it('không đọc được danh sách Workspace của người khác', async () => {
    await assertFails(getDocs(collection(dbAs(env, USERS.member), `users/${USERS.owner.uid}/memberships`)));
  });
});

describe('Công việc', () => {
  const createTask = (db, u, data) => {
    const b = writeBatch(db);
    b.update(doc(db, `workspaces/${WS}/counters/tasks`), { next: increment(1) });
    b.set(doc(collection(db, `workspaces/${WS}/tasks`)), { ...baseTask(data), seq: 2, createdBy: u.uid, ...now(), updatedBy: u.uid });
    return b.commit();
  };
  it('Owner và Trưởng Ban (đúng Ban) tạo được công việc', async () => {
    await assertSucceeds(createTask(dbAs(env, USERS.manager), USERS.manager, { unitId: 'unitA' }));
  });
  it('Trưởng Ban không tạo việc ở Ban khác; Thành viên/Giảng viên không tạo việc', async () => {
    await assertFails(createTask(dbAs(env, USERS.manager), USERS.manager, { unitId: 'unitB' }));
    await assertFails(createTask(dbAs(env, USERS.member), USERS.member, { unitId: 'unitA' }));
    await assertFails(createTask(dbAs(env, USERS.lecturer), USERS.lecturer, { unitId: 'unitB' }));
  });
  it('seq phải khớp bộ đếm (không tạo trùng mã)', async () => {
    const db = dbAs(env, USERS.owner);
    const b = writeBatch(db);
    b.set(doc(collection(db, `workspaces/${WS}/tasks`)), { ...baseTask(), seq: 1, createdBy: USERS.owner.uid, ...now(), updatedBy: USERS.owner.uid });
    await assertFails(b.commit());
  });
  it('dữ liệu sai cấu trúc bị từ chối', async () => {
    const db = dbAs(env, USERS.owner);
    await assertFails(createTask(db, USERS.owner, { status: 'Bịa đặt' }));
    await assertFails(createTask(db, USERS.owner, { progress: 150 }));
    await assertFails(createTask(db, USERS.owner, { dueDate: '20/11/2026' }));
    await assertFails(createTask(db, USERS.owner, { title: '' }));
    await assertFails(createTask(db, USERS.owner, { unitId: 'khongton' }));
    await assertFails(createTask(db, USERS.owner, { assigneeUid: 'nguoila' }));
    await assertFails(createTask(db, USERS.owner, { isAdmin: true }));
  });
  it('phạm vi đọc: Owner/Người duyệt đọc tất cả; Thành viên chỉ đọc việc được giao', async () => {
    await assertSucceeds(getDocs(collection(dbAs(env, USERS.approver), `workspaces/${WS}/tasks`)));
    await assertSucceeds(getDoc(doc(dbAs(env, USERS.member), `workspaces/${WS}/tasks/t1`)));
    await assertFails(getDoc(doc(dbAs(env, USERS.member), `workspaces/${WS}/tasks/tB`)));
    await assertFails(getDocs(collection(dbAs(env, USERS.member), `workspaces/${WS}/tasks`)));
    await assertSucceeds(getDocs(query(collection(dbAs(env, USERS.member), `workspaces/${WS}/tasks`), where('assigneeUid', '==', USERS.member.uid))));
  });
  it('Trưởng Ban / Giảng viên truy vấn theo Ban của mình', async () => {
    await assertSucceeds(getDocs(query(collection(dbAs(env, USERS.manager), `workspaces/${WS}/tasks`), where('unitId', 'in', ['unitA']))));
    await assertFails(getDocs(query(collection(dbAs(env, USERS.manager), `workspaces/${WS}/tasks`), where('unitId', 'in', ['unitA', 'unitB']))));
    await assertSucceeds(getDocs(query(collection(dbAs(env, USERS.lecturer), `workspaces/${WS}/tasks`), where('unitId', 'in', ['unitB']))));
  });
  it('người được giao chỉ cập nhật tiến độ, không sửa tiêu đề/Deadline/người phụ trách', async () => {
    const ref = doc(dbAs(env, USERS.member), `workspaces/${WS}/tasks/t1`);
    await assertSucceeds(updateDoc(ref, { status: 'Đang thực hiện', progress: 30, ...stamp(USERS.member) }));
    await assertFails(updateDoc(ref, { title: 'Đổi tên', ...stamp(USERS.member) }));
    await assertFails(updateDoc(ref, { dueDate: '2027-01-01', ...stamp(USERS.member) }));
    await assertFails(updateDoc(ref, { assigneeUid: USERS.lecturer.uid, ...stamp(USERS.member) }));
  });
  it('không giả mạo updatedBy', async () => {
    const ref = doc(dbAs(env, USERS.member), `workspaces/${WS}/tasks/t1`);
    await assertFails(updateDoc(ref, { progress: 40, updatedAt: serverTimestamp(), updatedBy: USERS.owner.uid }));
  });
  it('Trưởng Ban không chuyển việc sang Ban mình không quản lý', async () => {
    await assertFails(updateDoc(doc(dbAs(env, USERS.manager), `workspaces/${WS}/tasks/t1`), { unitId: 'unitB', ...stamp(USERS.manager) }));
  });
  it('chỉ Owner/Trưởng Ban của Ban được xóa công việc', async () => {
    await assertFails(deleteDoc(doc(dbAs(env, USERS.member), `workspaces/${WS}/tasks/t1`)));
    await assertFails(deleteDoc(doc(dbAs(env, USERS.approver), `workspaces/${WS}/tasks/t1`)));
    await assertFails(deleteDoc(doc(dbAs(env, USERS.manager), `workspaces/${WS}/tasks/tB`)));
    await assertSucceeds(deleteDoc(doc(dbAs(env, USERS.manager), `workspaces/${WS}/tasks/t1`)));
  });
  it('bình luận: người đọc được việc mới bình luận được, không mạo danh', async () => {
    const mdb = dbAs(env, USERS.member);
    await assertSucceeds(
      setDoc(doc(mdb, `workspaces/${WS}/tasks/t1/comments/c1`), { text: 'OK', authorUid: USERS.member.uid, authorName: 'TV', createdAt: serverTimestamp() }),
    );
    await assertFails(
      setDoc(doc(mdb, `workspaces/${WS}/tasks/t1/comments/c2`), { text: 'OK', authorUid: USERS.owner.uid, authorName: 'TV', createdAt: serverTimestamp() }),
    );
    await assertFails(
      setDoc(doc(mdb, `workspaces/${WS}/tasks/tB/comments/c3`), { text: 'OK', authorUid: USERS.member.uid, authorName: 'TV', createdAt: serverTimestamp() }),
    );
    await assertFails(updateDoc(doc(mdb, `workspaces/${WS}/tasks/t1/comments/c1`), { text: 'sửa' }));
  });
  it('lịch sử hoạt động không sửa / xóa được', async () => {
    const mdb = dbAs(env, USERS.member);
    const ref = doc(mdb, `workspaces/${WS}/tasks/t1/activity/a1`);
    await assertSucceeds(setDoc(ref, { action: 'Cập nhật', detail: '', actorUid: USERS.member.uid, actorName: 'TV', createdAt: serverTimestamp() }));
    await assertFails(updateDoc(ref, { action: 'x' }));
    await assertFails(deleteDoc(ref));
  });
});

describe('Phê duyệt kế hoạch', () => {
  const steps = [
    { key: 'chiuy', label: 'Chi ủy', status: 'pending', by: null, byName: null, at: null, comment: '' },
    { key: 'truong', label: 'Trường', status: 'waiting', by: null, byName: null, at: null, comment: '' },
  ];
  const approval = (u, over = {}) => ({
    title: 'Hội thao',
    unitId: 'unitA',
    eventId: null,
    note: '',
    requireSchoolLevel: true,
    steps,
    currentStep: 0,
    status: 'Chờ xử lý',
    submittedAt: '2026-11-01',
    history: [],
    createdBy: u.uid,
    ...now(),
    updatedBy: u.uid,
    ...over,
  });
  beforeEach(async () => {
    await env.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore(), `workspaces/${WS}/approvals/a1`), { ...approval(USERS.manager), createdAt: new Date(), updatedAt: new Date() }),
    );
  });
  it('Trưởng Ban lập hồ sơ (Nháp) cho Ban mình; không lập cho Ban khác; không tạo sẵn ở trạng thái đã gửi', async () => {
    const draftSteps = steps.map((st) => ({ ...st, status: 'waiting' }));
    const draft = (over = {}) => approval(USERS.manager, { status: 'Nháp', submittedAt: null, steps: draftSteps, ...over });
    await assertSucceeds(setDoc(doc(dbAs(env, USERS.manager), `workspaces/${WS}/approvals/a2`), draft()));
    await assertFails(setDoc(doc(dbAs(env, USERS.manager), `workspaces/${WS}/approvals/a3`), draft({ unitId: 'unitB' })));
    await assertFails(setDoc(doc(dbAs(env, USERS.manager), `workspaces/${WS}/approvals/a5`), approval(USERS.manager))); // đã ở "Chờ xử lý"
  });
  it('không được tạo hồ sơ ở trạng thái Đã duyệt', async () => {
    await assertFails(setDoc(doc(dbAs(env, USERS.owner), `workspaces/${WS}/approvals/a4`), approval(USERS.owner, { status: 'Đã duyệt' })));
  });
  it('Trưởng Ban không tự duyệt hồ sơ', async () => {
    await assertFails(
      updateDoc(doc(dbAs(env, USERS.manager), `workspaces/${WS}/approvals/a1`), { status: 'Đã duyệt', currentStep: 1, ...stamp(USERS.manager) }),
    );
  });
  it('Người duyệt duyệt từng bước; không nhảy thẳng tới Đã duyệt', async () => {
    const ref = doc(dbAs(env, USERS.approver), `workspaces/${WS}/approvals/a1`);
    await assertFails(updateDoc(ref, { status: 'Đã duyệt', ...stamp(USERS.approver) }));
    await assertSucceeds(updateDoc(ref, { currentStep: 1, status: 'Chờ xử lý', ...stamp(USERS.approver) }));
    await assertSucceeds(updateDoc(ref, { status: 'Đã duyệt', ...stamp(USERS.approver) }));
    await assertFails(updateDoc(ref, { status: 'Chờ xử lý', ...stamp(USERS.approver) }));
  });
  it('Người duyệt không sửa nội dung hồ sơ', async () => {
    await assertFails(updateDoc(doc(dbAs(env, USERS.approver), `workspaces/${WS}/approvals/a1`), { title: 'Sửa', ...stamp(USERS.approver) }));
  });
  it('Thành viên / Giảng viên không duyệt được', async () => {
    await assertFails(updateDoc(doc(dbAs(env, USERS.member), `workspaces/${WS}/approvals/a1`), { status: 'Cần bổ sung', ...stamp(USERS.member) }));
    await assertFails(updateDoc(doc(dbAs(env, USERS.lecturer), `workspaces/${WS}/approvals/a1`), { status: 'Từ chối', ...stamp(USERS.lecturer) }));
  });
});

describe('Hồi quy bảo mật (rà soát security-audit)', () => {
  const U = USERS;
  const histEntry = (u, action = 'Gửi duyệt') => ({ action, by: u.uid, byName: u.role, at: '2026-11-01T00:00:00.000Z', step: 'chiuy', comment: '' });
  const stepsDraft = [
    { key: 'chiuy', label: 'Chi ủy', status: 'waiting', by: null, byName: null, at: null, comment: '' },
    { key: 'truong', label: 'Trường', status: 'waiting', by: null, byName: null, at: null, comment: '' },
  ];
  const ap = (u, over = {}) => ({
    title: 'Hội thao',
    unitId: 'unitA',
    eventId: null,
    note: '',
    requireSchoolLevel: true,
    steps: stepsDraft,
    currentStep: 0,
    status: 'Nháp',
    submittedAt: null,
    history: [],
    createdBy: u.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedBy: u.uid,
    ...over,
  });
  beforeEach(async () => {
    await env.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore(), `workspaces/${WS}/approvals/d1`), { ...ap(U.manager), createdAt: new Date(), updatedAt: new Date() }),
    );
  });
  const ref = (u) => doc(dbAs(env, u), `workspaces/${WS}/approvals/d1`);

  it('Trưởng Ban gửi duyệt hợp lệ (đổi step 0 sang pending + 1 mục lịch sử của chính mình)', async () => {
    const steps = [{ ...stepsDraft[0], status: 'pending' }, stepsDraft[1]];
    await assertSucceeds(
      updateDoc(ref(U.manager), { steps, status: 'Chờ xử lý', submittedAt: '2026-11-01', history: [histEntry(U.manager)], ...stamp(U.manager) }),
    );
  });
  it('Trưởng Ban không thể tự đánh dấu bước "đã duyệt" khi gửi duyệt', async () => {
    const steps = [{ ...stepsDraft[0], status: 'approved', by: U.approver.uid, byName: 'Cô Tuyền' }, stepsDraft[1]];
    await assertFails(updateDoc(ref(U.manager), { steps, status: 'Chờ xử lý', history: [histEntry(U.manager)], ...stamp(U.manager) }));
  });
  it('Trưởng Ban không thể mạo danh người khác trong lịch sử hoặc ghi hơn một mục', async () => {
    const steps = [{ ...stepsDraft[0], status: 'pending' }, stepsDraft[1]];
    await assertFails(updateDoc(ref(U.manager), { steps, status: 'Chờ xử lý', history: [histEntry(U.approver, 'Duyệt: Chi ủy')], ...stamp(U.manager) }));
    await assertFails(
      updateDoc(ref(U.manager), { steps, status: 'Chờ xử lý', history: [histEntry(U.manager), histEntry(U.manager, 'x')], ...stamp(U.manager) }),
    );
  });
  it('Người lập hồ sơ không sửa/xóa lịch sử cũ khi gửi lại', async () => {
    const steps = [{ ...stepsDraft[0], status: 'returned', by: U.approver.uid, byName: 'Cô Tuyền', at: 'x', comment: 'Bổ sung' }, stepsDraft[1]];
    await env.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore(), `workspaces/${WS}/approvals/d1`), {
        ...ap(U.manager, { steps, status: 'Cần bổ sung', history: [histEntry(U.manager), histEntry(U.approver, 'Yêu cầu bổ sung')] }),
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );
    const resubmitSteps = [{ ...steps[0], status: 'pending' }, stepsDraft[1]];
    const old = [histEntry(U.manager), histEntry(U.approver, 'Yêu cầu bổ sung')];
    await assertSucceeds(
      updateDoc(ref(U.manager), { steps: resubmitSteps, status: 'Chờ xử lý', history: [...old, histEntry(U.manager, 'Gửi lại')], ...stamp(U.manager) }),
    );
    await env.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore(), `workspaces/${WS}/approvals/d1`), {
        ...ap(U.manager, { steps, status: 'Cần bổ sung', history: old }),
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );
    await assertFails(updateDoc(ref(U.manager), { steps: resubmitSteps, status: 'Chờ xử lý', history: [histEntry(U.manager)], ...stamp(U.manager) })); // xóa lịch sử
    await assertFails(
      updateDoc(ref(U.manager), {
        steps: [{ ...resubmitSteps[0], comment: 'sửa lời phản hồi' }, stepsDraft[1]],
        status: 'Chờ xử lý',
        history: [...old, histEntry(U.manager, 'Gửi lại')],
        ...stamp(U.manager),
      }),
    );
  });
  it('Người duyệt chỉ nối lịch sử bằng tên chính mình; không xóa lịch sử', async () => {
    const pendingSteps = [{ ...stepsDraft[0], status: 'pending' }, stepsDraft[1]];
    const h0 = [histEntry(U.manager)];
    await env.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore(), `workspaces/${WS}/approvals/d1`), {
        ...ap(U.manager, { steps: pendingSteps, status: 'Chờ xử lý', submittedAt: '2026-11-01', history: h0 }),
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );
    const next = [
      { ...pendingSteps[0], status: 'approved', by: U.approver.uid },
      { ...stepsDraft[1], status: 'pending' },
    ];
    await assertFails(updateDoc(ref(U.approver), { steps: next, currentStep: 1, history: [], ...stamp(U.approver) }));
    await assertFails(updateDoc(ref(U.approver), { steps: next, currentStep: 1, history: [...h0, histEntry(U.owner, 'Duyệt')], ...stamp(U.approver) }));
    await assertSucceeds(
      updateDoc(ref(U.approver), { steps: next, currentStep: 1, history: [...h0, histEntry(U.approver, 'Duyệt: Chi ủy')], ...stamp(U.approver) }),
    );
  });
  it('tạo hồ sơ không được kèm bước đã duyệt hoặc lịch sử giả', async () => {
    const db = dbAs(env, U.manager);
    await assertFails(setDoc(doc(db, `workspaces/${WS}/approvals/x1`), ap(U.manager, { history: [histEntry(U.manager)] })));
    await assertFails(setDoc(doc(db, `workspaces/${WS}/approvals/x2`), ap(U.manager, { steps: [{ ...stepsDraft[0], status: 'approved' }, stepsDraft[1]] })));
    await assertSucceeds(setDoc(doc(db, `workspaces/${WS}/approvals/x3`), ap(U.manager)));
  });

  it('người được giao không tự đặt "Đã duyệt"; "Hoàn thành" cần minh chứng (theo cài đặt Workspace)', async () => {
    const r = doc(dbAs(env, U.member), `workspaces/${WS}/tasks/t1`);
    await assertFails(updateDoc(r, { status: 'Đã duyệt', ...stamp(U.member) }));
    await assertFails(updateDoc(r, { status: 'Hoàn thành', completedOn: '2026-11-03', ...stamp(U.member) }));
    await assertSucceeds(
      updateDoc(r, {
        status: 'Hoàn thành',
        completedOn: '2026-11-03',
        evidence: [{ id: 'e1', label: 'KH', url: 'https://drive.google.com/x' }],
        ...stamp(U.member),
      }),
    );
  });
  it('khi Workspace tắt yêu cầu minh chứng, người được giao hoàn thành không cần minh chứng', async () => {
    await assertSucceeds(
      updateDoc(doc(dbAs(env, U.owner), `workspaces/${WS}`), { settings: { ...SETTINGS, requireEvidenceOnComplete: false }, ...stamp(U.owner) }),
    );
    await assertSucceeds(
      updateDoc(doc(dbAs(env, U.member), `workspaces/${WS}/tasks/t1`), { status: 'Hoàn thành', completedOn: '2026-11-03', ...stamp(U.member) }),
    );
  });
  it('Owner / Trưởng Ban vẫn đặt "Đã duyệt" được', async () => {
    await assertSucceeds(updateDoc(doc(dbAs(env, U.manager), `workspaces/${WS}/tasks/t1`), { status: 'Đã duyệt', ...stamp(U.manager) }));
  });
});

describe('Kinh phí, tài liệu, thông báo, Ban', () => {
  const entry = (u, over = {}) => ({
    kind: 'chi',
    amount: 1500000,
    source: 'Quỹ ĐK/LC',
    eventId: null,
    note: 'In ấn',
    date: '2026-11-02',
    evidenceUrl: null,
    status: 'Đề xuất',
    decidedBy: null,
    createdBy: u.uid,
    ...now(),
    updatedBy: u.uid,
    ...over,
  });
  it('Thành viên / Giảng viên không xem được kinh phí', async () => {
    await assertFails(getDocs(collection(dbAs(env, USERS.member), `workspaces/${WS}/budget`)));
    await assertFails(getDocs(collection(dbAs(env, USERS.lecturer), `workspaces/${WS}/budget`)));
    await assertSucceeds(getDocs(collection(dbAs(env, USERS.manager), `workspaces/${WS}/budget`)));
  });
  it('Trưởng Ban đề xuất khoản chi; không tự duyệt; Người duyệt duyệt', async () => {
    const mdb = dbAs(env, USERS.manager);
    await assertSucceeds(setDoc(doc(mdb, `workspaces/${WS}/budget/b1`), entry(USERS.manager)));
    await assertFails(setDoc(doc(mdb, `workspaces/${WS}/budget/b2`), entry(USERS.manager, { status: 'Đã duyệt' })));
    await assertFails(updateDoc(doc(mdb, `workspaces/${WS}/budget/b1`), { status: 'Đã duyệt', decidedBy: USERS.manager.uid, ...stamp(USERS.manager) }));
    await assertSucceeds(
      updateDoc(doc(dbAs(env, USERS.approver), `workspaces/${WS}/budget/b1`), { status: 'Đã duyệt', decidedBy: USERS.approver.uid, ...stamp(USERS.approver) }),
    );
    await assertFails(updateDoc(doc(dbAs(env, USERS.approver), `workspaces/${WS}/budget/b1`), { amount: 1, ...stamp(USERS.approver) }));
  });
  it('số tiền âm / số thực / quá lớn bị từ chối', async () => {
    const db = dbAs(env, USERS.owner);
    await assertFails(setDoc(doc(db, `workspaces/${WS}/budget/x1`), entry(USERS.owner, { amount: -5 })));
    await assertFails(setDoc(doc(db, `workspaces/${WS}/budget/x2`), entry(USERS.owner, { amount: 10.5 })));
    await assertFails(setDoc(doc(db, `workspaces/${WS}/budget/x3`), entry(USERS.owner, { amount: 1e12 })));
  });
  it('tài liệu chỉ nhận link https', async () => {
    const db = dbAs(env, USERS.manager);
    const d = (url) => ({
      title: 'Mẫu',
      group: 'Biểu mẫu',
      url,
      appliesTo: '',
      academicYear: '',
      status: 'Đang sử dụng',
      createdBy: USERS.manager.uid,
      ...now(),
      updatedBy: USERS.manager.uid,
    });
    await assertSucceeds(setDoc(doc(db, `workspaces/${WS}/docs/d1`), d('https://drive.google.com/x')));
    await assertFails(setDoc(doc(db, `workspaces/${WS}/docs/d2`), d('javascript:alert(1)')));
    await assertFails(setDoc(doc(dbAs(env, USERS.member), `workspaces/${WS}/docs/d3`), d('https://a.b')));
  });
  it('chỉ Owner quản lý Ban / bộ phận', async () => {
    const u = (usr) => ({ name: 'Ban mới', description: '', managerLabel: '', icon: '▤', ...now(), updatedBy: usr.uid });
    await assertFails(setDoc(doc(dbAs(env, USERS.manager), `workspaces/${WS}/units/u9`), u(USERS.manager)));
    await assertSucceeds(setDoc(doc(dbAs(env, USERS.owner), `workspaces/${WS}/units/u9`), u(USERS.owner)));
  });
  it('thông báo cấp Trường: Thành viên chỉ xem', async () => {
    const n = (usr) => ({
      title: 'Hội diễn',
      category: 'Văn nghệ',
      summary: '',
      deadline: '2026-11-14',
      source: 'Email',
      contact: '',
      status: 'Mới tiếp nhận',
      taskIds: [],
      createdBy: usr.uid,
      ...now(),
      updatedBy: usr.uid,
    });
    await assertSucceeds(setDoc(doc(dbAs(env, USERS.manager), `workspaces/${WS}/notices/n1`), n(USERS.manager)));
    await assertFails(setDoc(doc(dbAs(env, USERS.member), `workspaces/${WS}/notices/n2`), n(USERS.member)));
    await assertSucceeds(getDocs(collection(dbAs(env, USERS.member), `workspaces/${WS}/notices`)));
  });
});
