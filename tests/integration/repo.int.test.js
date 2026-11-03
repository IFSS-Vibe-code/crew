// Integration: tầng repo thật của ứng dụng ↔ Firestore/Auth Emulator ↔ firestore.rules thật.
import { describe, it, expect, beforeAll } from 'vitest';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, updateProfile } from 'firebase/auth';
import { getDocs, query, collection, where, doc, getDoc } from 'firebase/firestore';
import { auth, db, runtimeInfo } from '../../src/services/firebase/app.js';
import * as repo from '../../src/services/repo.js';
import { newApproval, submit, approve, returnForRevision } from '../../src/domain/approvals.js';
import { ErrorKind } from '../../src/services/errors.js';

const PROJECT = 'demo-crewwork';
const PW = 'matkhau123';

async function verifyEmail(uid) {
  const r = await fetch(`http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({ localId: uid, emailVerified: true }),
  });
  if (!r.ok) throw new Error('verify failed ' + r.status);
}
async function newUser(email, name) {
  const cred = await createUserWithEmailAndPassword(auth, email, PW);
  await updateProfile(cred.user, { displayName: name });
  await verifyEmail(cred.user.uid);
  await cred.user.reload();
  await cred.user.getIdToken(true);
  return cred.user;
}
const actorOf = (u) => ({ uid: u.uid, name: u.displayName });
const uniq = () => Math.random().toString(36).slice(2, 8);

let owner, ws, units, unitIds, ctx, memInfo;

beforeAll(async () => {
  expect(runtimeInfo.emulator).toBe(true);
  expect(runtimeInfo.projectId).toBe(PROJECT);
  owner = await newUser(`owner-${uniq()}@khoa.test`, 'Lê Đình Hạc');
});

describe('Luồng chính qua repo', () => {
  it('tạo Workspace + Ban mặc định; đọc lại đúng dữ liệu', async () => {
    ws = await repo.createWorkspace(owner, { name: 'Khoa FinTech', academicYear: '2026 – 2027' });
    const snap = await getDoc(doc(db, 'workspaces', ws));
    expect(snap.data()).toMatchObject({ name: 'Khoa FinTech', ownerUid: owner.uid });
    const us = await getDocs(collection(db, 'workspaces', ws, 'units'));
    units = us.docs.map((d) => ({ id: d.id, ...d.data() }));
    expect(units.map((u) => u.name)).toContain('Đoàn Khoa / Liên chi');
    unitIds = units.map((u) => u.id);
    ctx = { unitIds, memberName: (uid) => (uid === owner.uid ? 'Lê Đình Hạc' : null) };
    const mine = await getDocs(collection(db, 'users', owner.uid, 'memberships'));
    expect(mine.docs.map((d) => d.id)).toContain(ws);
  });

  it('tạo công việc tuần tự sinh mã không trùng; reload vẫn đúng', async () => {
    const ids = [];
    for (let i = 0; i < 3; i++)
      ids.push(
        await repo.createTask(
          ws,
          actorOf(owner),
          { title: `Việc ${i}`, unitId: unitIds[0], type: 'Sự kiện', dueDate: '2026-11-20', assigneeUid: owner.uid },
          ctx,
        ),
      );
    const snap = await getDocs(collection(db, 'workspaces', ws, 'tasks'));
    const seqs = snap.docs.map((d) => d.data().seq).sort();
    expect(seqs).toEqual([1, 2, 3]);
    expect(snap.docs.find((d) => d.id === ids[0]).data().assigneeName).toBe('Lê Đình Hạc');
    const act = await getDocs(collection(db, 'workspaces', ws, 'tasks', ids[0], 'activity'));
    expect(act.size).toBe(1);
  });

  it('tạo song song không sinh trùng mã (transaction)', async () => {
    await Promise.all([1, 2, 3].map((i) => repo.createTask(ws, actorOf(owner), { title: `Song song ${i}`, unitId: unitIds[1], type: 'Học thuật' }, ctx)));
    const snap = await getDocs(collection(db, 'workspaces', ws, 'tasks'));
    const seqs = snap.docs.map((d) => d.data().seq);
    expect(new Set(seqs).size).toBe(seqs.length);
  });

  it('dữ liệu sai bị chặn trước khi ghi', async () => {
    await expect(repo.createTask(ws, actorOf(owner), { title: '', unitId: unitIds[0], type: 'Sự kiện' }, ctx)).rejects.toThrow(/bắt buộc/);
  });

  it('tự lưu mô tả và phát hiện xung đột', async () => {
    const snap = await getDocs(collection(db, 'workspaces', ws, 'tasks'));
    const t = { id: snap.docs[0].id, ...snap.docs[0].data() };
    const r1 = await repo.autosaveTaskField(ws, actorOf(owner), t.id, 'description', t.description ?? '', 'Bản 1', ctx);
    expect(r1.saved).toBe(true);
    // Lần 2 lấy baseValue cũ (giả lập người khác đã sửa trong lúc mình gõ) → xung đột, không ghi đè.
    await expect(repo.autosaveTaskField(ws, actorOf(owner), t.id, 'description', '', 'Bản 2', ctx)).rejects.toMatchObject({ kind: ErrorKind.CONFLICT });
    const after = await getDoc(doc(db, 'workspaces', ws, 'tasks', t.id));
    expect(after.data().description).toBe('Bản 1');
    // Cùng giá trị → không ghi thêm (chống ghi trùng).
    const r3 = await repo.autosaveTaskField(ws, actorOf(owner), t.id, 'description', 'Bản 1', 'Bản 1', ctx);
    expect(r3.saved).toBe(false);
  });

  it('listener nhận cập nhật realtime sau khi ghi', async () => {
    const got = await new Promise((resolve, reject) => {
      let unsub = () => {};
      let created = false;
      unsub = repo.listen(
        repo.refs.tasksFor(ws, { role: 'owner', uid: owner.uid })[0],
        async (list, meta) => {
          if (!created) {
            created = true;
            await repo.createTask(ws, actorOf(owner), { title: 'Realtime', unitId: unitIds[0], type: 'Hành chính' }, ctx);
            return;
          }
          if (!meta.hasPendingWrites && list.some((t) => t.title === 'Realtime')) {
            unsub();
            resolve(true);
          }
        },
        reject,
      );
    });
    expect(got).toBe(true);
  });

  it('quy trình duyệt: gửi → duyệt → trả về → gửi lại; chặn xử lý trùng', async () => {
    const actor = actorOf(owner);
    const draft = newApproval({ title: 'Hội thao', unitId: unitIds[0] });
    const id = await repo.createApproval(ws, actor, draft); // Rules chỉ cho tạo ở trạng thái Nháp
    const submitted = submit({ id, ...draft }, actor);
    await repo.commitApprovalTransition(ws, actor, { id, ...draft }, submitted, { asDecider: false });
    const a0 = { id, ...submitted };
    const a1 = approve(a0, actor, 'Đồng ý chủ trương');
    await repo.commitApprovalTransition(ws, actor, a0, a1, { asDecider: true });
    // Thử áp lại quyết định trên bản cũ → xung đột (người khác đã xử lý).
    await expect(repo.commitApprovalTransition(ws, actor, a0, a1, { asDecider: true })).rejects.toMatchObject({ kind: ErrorKind.CONFLICT });
    const a2 = returnForRevision({ id, ...a1 }, actor, 'Bổ sung dự toán');
    await repo.commitApprovalTransition(ws, actor, { id, ...a1 }, a2, { asDecider: true });
    const a3 = submit({ id, ...a2 }, actor);
    await repo.commitApprovalTransition(ws, actor, { id, ...a2 }, a3, { asDecider: false });
    const s = await getDoc(doc(db, 'workspaces', ws, 'approvals', id));
    expect(s.data()).toMatchObject({ status: 'Chờ xử lý', currentStep: 1 });
  });

  it('kinh phí, tài liệu, thông báo, chương trình', async () => {
    const actor = actorOf(owner);
    await repo.proposeBudget(ws, actor, { kind: 'thu', amount: '25.000.000', source: 'Quỹ ĐK/LC', note: 'Quỹ đầu năm', date: '2026-09-01' });
    const b = await getDocs(collection(db, 'workspaces', ws, 'budget'));
    await repo.decideBudget(ws, actor, b.docs[0].id, 'Đã duyệt');
    expect((await getDoc(b.docs[0].ref)).data()).toMatchObject({ status: 'Đã duyệt', amount: 25000000 });
    await repo.saveDoc(ws, actor, { title: 'Mẫu kế hoạch', group: 'Biểu mẫu', url: 'https://drive.google.com/x' });
    await repo.saveNotice(ws, actor, { title: 'Hội diễn văn nghệ', deadline: '2026-11-14' });
    const evId = await repo.saveEvent(ws, actor, { title: 'Hội thao 2025', type: 'Phong trào', unitId: unitIds[0], date: '2025-11-18' }, ctx);
    await repo.createTask(ws, actor, { title: 'Mượn sân', unitId: unitIds[0], type: 'Sự kiện', eventId: evId, status: 'Hoàn thành' }, ctx);
    const tasks = (await getDocs(query(collection(db, 'workspaces', ws, 'tasks'), where('eventId', '==', evId)))).docs.map((d) => ({ id: d.id, ...d.data() }));
    const ev = (await getDoc(doc(db, 'workspaces', ws, 'events', evId))).data();
    const res = await repo.cloneEvent(ws, actor, ev, tasks, ctx, 'Hội thao 2026');
    expect(res.count).toBe(1);
    const cloned = (await getDocs(query(collection(db, 'workspaces', ws, 'tasks'), where('eventId', '==', res.eventId)))).docs[0].data();
    expect(cloned).toMatchObject({ status: 'Chưa bắt đầu', dueDate: null, title: 'Mượn sân' });
  });
});

describe('Mời thành viên và phạm vi dữ liệu', () => {
  it('mời Thành viên → nhận lời mời → chỉ thấy việc được giao; không sửa được tiêu đề', async () => {
    const email = `mem-${uniq()}@khoa.test`;
    await repo.inviteMember(ws, 'Khoa FinTech', actorOf(owner), { email, role: 'member' }, ctx);
    await signOut(auth);
    const mem = await newUser(email, 'Trần Gia Hân');
    memInfo = { uid: mem.uid, email };
    const invites = await repo.findMyInvites(email);
    expect(invites).toHaveLength(1);
    await repo.acceptInvite(mem, invites[0]);
    // Thành viên chưa được giao việc → truy vấn theo phạm vi trả về rỗng, không lỗi.
    const memberCtx = { uid: mem.uid, role: 'member', unitIds: [] };
    for (const q of repo.refs.tasksFor(ws, memberCtx)) expect((await getDocs(q)).size).toBe(0);
    // Truy vấn toàn bộ bị Rules chặn.
    await expect(getDocs(collection(db, 'workspaces', ws, 'tasks'))).rejects.toMatchObject({ code: 'permission-denied' });

    // Owner giao việc cho thành viên
    await signOut(auth);
    await signInWithEmailAndPassword(auth, owner.email, PW);
    const id = await repo.createTask(ws, actorOf(owner), { title: 'Việc của Hân', unitId: unitIds[2], type: 'Sự kiện', assigneeUid: mem.uid }, ctx);
    await signOut(auth);
    await signInWithEmailAndPassword(auth, email, PW);
    const mine = (await getDocs(repo.refs.tasksFor(ws, memberCtx)[0])).docs.map((d) => ({ id: d.id, ...d.data() }));
    expect(mine.map((t) => t.id)).toEqual([id]);
    await repo.updateTaskProgress(ws, { uid: mem.uid, name: 'Trần Gia Hân' }, mine[0], { status: 'Đang thực hiện', progress: 40 });
    await expect(repo.updateTask(ws, { uid: mem.uid, name: 'Hân' }, mine[0], { title: 'Đổi tên' }, ctx)).rejects.toMatchObject({ kind: ErrorKind.PERMISSION });
    await expect(
      repo.proposeBudget(ws, { uid: mem.uid, name: 'Hân' }, { kind: 'chi', amount: 1000, source: 'Quỹ ĐK/LC', note: 'x', date: '2026-11-01' }),
    ).rejects.toMatchObject({ kind: ErrorKind.PERMISSION });
    await signOut(auth);
  });

  it('trao đổi: gửi/đọc kênh chung realtime; kênh Ban theo quyền; không mạo danh; xóa theo quyền', async () => {
    const { chatMessages } = repo.refs;
    // Thành viên (chưa thuộc Ban nào) gửi vào kênh chung
    await signInWithEmailAndPassword(auth, memInfo.email, PW);
    const memActor = { uid: memInfo.uid, name: 'Trần Gia Hân' };
    const id1 = await repo.sendMessage(ws, memActor, 'general', '  Chào cả nhà  ');
    const got = (await getDocs(chatMessages(ws, 'general', 10))).docs.map((d) => ({ id: d.id, ...d.data() }));
    expect(got.find((m) => m.id === id1)).toMatchObject({ text: 'Chào cả nhà', authorUid: memInfo.uid, authorName: 'Trần Gia Hân' });
    // Không vào được kênh Ban khi chưa được gán
    await expect(repo.sendMessage(ws, memActor, unitIds[0], 'xin vào')).rejects.toMatchObject({ kind: ErrorKind.PERMISSION });
    await expect(getDocs(chatMessages(ws, unitIds[0], 10))).rejects.toMatchObject({ code: 'permission-denied' });
    // Mạo danh tên hiển thị bị Rules chặn; tin rỗng bị chặn trước khi ghi
    await expect(repo.sendMessage(ws, { uid: memInfo.uid, name: 'Lê Đình Hạc' }, 'general', 'giả')).rejects.toMatchObject({ kind: ErrorKind.PERMISSION });
    await expect(repo.sendMessage(ws, memActor, 'general', '   ')).rejects.toThrow(/trống/);
    await signOut(auth);

    // Owner: nhận tin realtime ở kênh chung, gửi vào kênh Ban, xóa được tin của người khác
    await signInWithEmailAndPassword(auth, owner.email, PW);
    const seen = new Promise((resolve, reject) => {
      const stop = repo.listen(
        chatMessages(ws, 'general', 10),
        (list) => {
          if (list.some((m) => m.text === 'Đã nhận')) {
            stop();
            resolve(list);
          }
        },
        reject,
        { pendingFlag: true },
      );
    });
    await repo.sendMessage(ws, actorOf(owner), 'general', 'Đã nhận');
    expect((await seen).map((m) => m.text)).toEqual(expect.arrayContaining(['Chào cả nhà', 'Đã nhận']));
    await repo.sendMessage(ws, actorOf(owner), unitIds[0], 'Họp Ban lúc 9h');
    expect((await getDocs(chatMessages(ws, unitIds[0], 10))).size).toBe(1);
    await repo.deleteMessage(ws, 'general', id1);
    expect((await getDocs(chatMessages(ws, 'general', 10))).docs.map((d) => d.id)).not.toContain(id1);
    await signOut(auth);
  });
});
