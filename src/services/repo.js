// Tầng truy cập Firestore duy nhất của ứng dụng. UI không gọi Firestore trực tiếp.
// Mọi hàm ghi: kiểm tra dữ liệu (domain/validation) → ghi → chỉ resolve khi server xác nhận.
import {
  collection,
  collectionGroup,
  doc,
  query,
  where,
  limit,
  orderBy,
  onSnapshot,
  writeBatch,
  runTransaction,
  serverTimestamp,
  getDocs,
  getDoc,
  arrayUnion,
  deleteField,
} from 'firebase/firestore';
import { db } from './firebase/app.js';
import { classify, AppError, ErrorKind } from './errors.js';
import {
  validateTask,
  validateEvent,
  validateNotice,
  validateBudgetEntry,
  validateDoc,
  validateUnit,
  validateInvite,
  validateWorkspace,
  validateComment,
  validateChecklist,
  validateEvidence,
} from '../domain/validation.js';
import { DEFAULT_SETTINGS, DEFAULT_UNITS, TASK_STATUSES } from '../domain/constants.js';
import { todayIso } from '../domain/dates.js';
import { DECISION_FIELDS } from '../domain/approvals.js';
import { validateMessage } from '../domain/chat.js';

const Q_LIMIT = 500; // giới hạn số bản ghi mỗi truy vấn để tiết kiệm hạn mức Spark

const wsDoc = (ws) => doc(db, 'workspaces', ws);
const col = (ws, name) => collection(db, 'workspaces', ws, name);
const stamp = (actor) => ({ updatedAt: serverTimestamp(), updatedBy: actor.uid });
const created = (actor) => ({ createdBy: actor.uid, createdAt: serverTimestamp(), ...stamp(actor) });

async function guard(fn) {
  try {
    return await fn();
  } catch (e) {
    throw classify(e);
  }
}

/** Lắng nghe realtime; trả về hàm hủy. onError nhận AppError. */
export function listen(ref, onData, onError, { pendingFlag = false } = {}) {
  return onSnapshot(
    ref,
    { includeMetadataChanges: true },
    (snap) => {
      if ('docs' in snap) {
        onData(
          snap.docs.map((d) => ({
            id: d.id,
            ...d.data({ serverTimestamps: 'estimate' }),
            // Tin nhắn chưa được máy chủ xác nhận (chỉ dùng cho chat: hiển thị "Đang gửi…").
            ...(pendingFlag ? { _pending: d.metadata.hasPendingWrites } : {}),
          })),
          snap.metadata,
        );
      } else {
        onData(snap.exists() ? { id: snap.id, ...snap.data({ serverTimestamps: 'estimate' }) } : null, snap.metadata);
      }
    },
    (err) => onError(classify(err)),
  );
}

// ---------------- Workspace & thành viên ----------------

export const refs = {
  memberships: (uid) => query(collection(db, 'users', uid, 'memberships'), limit(50)),
  workspace: (ws) => wsDoc(ws),
  myMember: (ws, uid) => doc(db, 'workspaces', ws, 'members', uid),
  members: (ws) => query(col(ws, 'members'), limit(Q_LIMIT)),
  units: (ws) => query(col(ws, 'units'), orderBy('createdAt'), limit(100)),
  invites: (ws) => query(col(ws, 'invites'), limit(Q_LIMIT)),
  events: (ws) => query(col(ws, 'events'), orderBy('createdAt', 'desc'), limit(Q_LIMIT)),
  approvals: (ws) => query(col(ws, 'approvals'), orderBy('createdAt', 'desc'), limit(Q_LIMIT)),
  notices: (ws) => query(col(ws, 'notices'), orderBy('createdAt', 'desc'), limit(Q_LIMIT)),
  budget: (ws) => query(col(ws, 'budget'), orderBy('createdAt', 'desc'), limit(Q_LIMIT)),
  docs: (ws) => query(col(ws, 'docs'), orderBy('createdAt', 'desc'), limit(Q_LIMIT)),
  /** Tin nhắn mới nhất của một kênh (dùng cho chấm "chưa đọc"). */
  chatLatest: (ws, chatId) => query(collection(db, 'workspaces', ws, 'chats', chatId, 'messages'), orderBy('createdAt', 'desc'), limit(1)),
  /** N tin gần nhất của kênh đang mở (tải thêm bằng cách tăng N). */
  chatMessages: (ws, chatId, n) => query(collection(db, 'workspaces', ws, 'chats', chatId, 'messages'), orderBy('createdAt', 'desc'), limit(n)),
  comments: (ws, taskId) => query(collection(db, 'workspaces', ws, 'tasks', taskId, 'comments'), orderBy('createdAt'), limit(200)),
  activity: (ws, taskId) => query(collection(db, 'workspaces', ws, 'tasks', taskId, 'activity'), orderBy('createdAt', 'desc'), limit(30)),
  /**
   * Truy vấn công việc theo phạm vi quyền. Rules không phải bộ lọc, nên truy vấn phải khớp đúng điều kiện được phép đọc.
   * @returns {import('firebase/firestore').Query[]}
   */
  tasksFor(ws, member) {
    const c = col(ws, 'tasks');
    if (['owner', 'approver'].includes(member.role)) return [query(c, limit(1000))];
    const qs = [
      query(c, where('assigneeUid', '==', member.uid), limit(Q_LIMIT)),
      query(c, where('collaboratorUids', 'array-contains', member.uid), limit(Q_LIMIT)),
    ];
    const units = member.unitIds || [];
    for (let i = 0; i < units.length; i += 10) qs.push(query(c, where('unitId', 'in', units.slice(i, i + 10)), limit(Q_LIMIT)));
    return qs;
  },
};

/** Tạo Workspace mới; người tạo là Owner. Có thể khởi tạo các Ban mặc định (PHAN_TICH_YEU_CAU §3). */
export async function createWorkspace(user, input, { withDefaultUnits = true } = {}) {
  const v = validateWorkspace(input);
  return guard(async () => {
    const ref = doc(collection(db, 'workspaces'));
    const b = writeBatch(db);
    b.set(ref, {
      name: v.name,
      type: v.type,
      academicYear: v.academicYear || null,
      contactEmail: v.contactEmail || null,
      ownerUid: user.uid,
      settings: { ...DEFAULT_SETTINGS },
      createdAt: serverTimestamp(),
      ...stamp(user),
    });
    b.set(doc(ref, 'members', user.uid), {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName || user.email,
      role: 'owner',
      unitIds: [],
      joinedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    b.set(doc(db, 'users', user.uid, 'memberships', ref.id), { workspaceId: ref.id, workspaceName: v.name, joinedAt: serverTimestamp() });
    await b.commit();
    // Các bước sau cần Owner đã tồn tại (Rules kiểm tra members/{uid}).
    const b2 = writeBatch(db);
    b2.set(doc(ref, 'counters', 'tasks'), { next: 0 });
    if (withDefaultUnits) {
      for (const u of DEFAULT_UNITS) b2.set(doc(collection(ref, 'units')), { ...u, createdAt: serverTimestamp(), ...stamp(user) });
    }
    await b2.commit();
    return ref.id;
  });
}

export async function updateWorkspace(ws, actor, input, settings) {
  const v = validateWorkspace(input);
  const s = {
    remindBeforeDeadlineHours: clampInt(settings.remindBeforeDeadlineHours, 0, 336, 24),
    approvalWaitWarnDays: clampInt(settings.approvalWaitWarnDays, 1, 120, 14),
    requireEvidenceOnComplete: !!settings.requireEvidenceOnComplete,
    allowConditionalPrep: !!settings.allowConditionalPrep,
  };
  return guard(async () => {
    const b = writeBatch(db);
    b.update(wsDoc(ws), {
      name: v.name,
      type: v.type,
      academicYear: v.academicYear || null,
      contactEmail: v.contactEmail || null,
      settings: s,
      ...stamp(actor),
    });
    b.update(doc(db, 'users', actor.uid, 'memberships', ws), { workspaceName: v.name });
    await b.commit();
  });
}

function clampInt(v, min, max, dflt) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt;
}

export async function findMyInvites(email) {
  return guard(async () => {
    const snap = await getDocs(query(collectionGroup(db, 'invites'), where('email', '==', email.toLowerCase()), limit(20)));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  });
}

/** Nhận lời mời: tạo member đúng role/unitIds của lời mời, xóa lời mời, thêm vào danh sách Workspace của tôi. */
export async function acceptInvite(user, invite) {
  return guard(async () => {
    const b = writeBatch(db);
    b.set(doc(db, 'workspaces', invite.workspaceId, 'members', user.uid), {
      uid: user.uid,
      email: user.email,
      displayName: invite.displayName || user.displayName || user.email,
      role: invite.role,
      unitIds: invite.unitIds,
      joinedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    b.delete(doc(db, 'workspaces', invite.workspaceId, 'invites', invite.email));
    b.set(doc(db, 'users', user.uid, 'memberships', invite.workspaceId), {
      workspaceId: invite.workspaceId,
      workspaceName: invite.workspaceName,
      joinedAt: serverTimestamp(),
    });
    await b.commit();
  });
}

export async function declineInvite(invite) {
  return guard(async () => {
    const b = writeBatch(db);
    b.delete(doc(db, 'workspaces', invite.workspaceId, 'invites', invite.email));
    await b.commit();
  });
}

export async function inviteMember(ws, wsName, actor, input, ctx) {
  const v = validateInvite(input, ctx);
  return guard(async () => {
    const b = writeBatch(db);
    b.set(doc(db, 'workspaces', ws, 'invites', v.email), {
      workspaceId: ws,
      workspaceName: wsName,
      email: v.email,
      role: v.role,
      unitIds: v.unitIds,
      displayName: v.displayName || null,
      invitedBy: actor.uid,
      createdAt: serverTimestamp(),
    });
    await b.commit();
    return v.email;
  });
}

export async function revokeInvite(ws, email) {
  return guard(async () => {
    const b = writeBatch(db);
    b.delete(doc(db, 'workspaces', ws, 'invites', email));
    await b.commit();
  });
}

export async function updateMember(ws, memberUid, { role, unitIds, displayName }) {
  return guard(async () => {
    const patch = { updatedAt: serverTimestamp() };
    if (role !== undefined) patch.role = role;
    if (unitIds !== undefined) patch.unitIds = unitIds;
    if (displayName !== undefined) patch.displayName = String(displayName).trim().slice(0, 100);
    const b = writeBatch(db);
    b.update(doc(db, 'workspaces', ws, 'members', memberUid), patch);
    await b.commit();
  });
}

/** Xóa thành viên. Nếu tự rời đi thì xóa luôn mục trong danh sách Workspace của mình. */
export async function removeMember(ws, memberUid, actor) {
  return guard(async () => {
    const b = writeBatch(db);
    b.delete(doc(db, 'workspaces', ws, 'members', memberUid));
    if (memberUid === actor.uid) b.delete(doc(db, 'users', actor.uid, 'memberships', ws));
    await b.commit();
  });
}

/** Dọn mục Workspace trong danh sách của tôi khi tôi đã bị xóa khỏi Workspace đó. */
export async function forgetMembership(uid, ws) {
  return guard(async () => {
    const b = writeBatch(db);
    b.delete(doc(db, 'users', uid, 'memberships', ws));
    await b.commit();
  });
}

// ---------------- Ban / bộ phận ----------------

export async function saveUnit(ws, actor, input, id = null) {
  const v = validateUnit(input);
  return guard(async () => {
    const b = writeBatch(db);
    if (id) b.update(doc(db, 'workspaces', ws, 'units', id), { ...v, ...stamp(actor) });
    else b.set(doc(col(ws, 'units')), { ...v, createdAt: serverTimestamp(), ...stamp(actor) });
    await b.commit();
  });
}

export async function deleteUnit(ws, id) {
  return guard(async () => {
    const b = writeBatch(db);
    b.delete(doc(db, 'workspaces', ws, 'units', id));
    await b.commit();
  });
}

// ---------------- Công việc ----------------

function activityDoc(ws, taskId, actor, action, detail = '') {
  return [
    doc(collection(db, 'workspaces', ws, 'tasks', taskId, 'activity')),
    { action, detail: String(detail).slice(0, 500), actorUid: actor.uid, actorName: actor.name, createdAt: serverTimestamp() },
  ];
}

/**
 * Tạo công việc với mã #TK tăng dần (transaction trên bộ đếm → không trùng mã khi nhiều người tạo cùng lúc).
 * Id được tạo trước để retry của transaction không sinh bản ghi trùng.
 */
export async function createTask(ws, actor, input, ctx) {
  const v = validateTask(input, ctx);
  const ref = doc(col(ws, 'tasks'));
  const counterRef = doc(db, 'workspaces', ws, 'counters', 'tasks');
  // Khi nhiều người tạo việc cùng lúc, Rules có thể đánh giá trên bộ đếm vừa bị người khác tăng
  // và trả permission-denied. Chỉ thử lại khi xác minh được bộ đếm đã đổi (xung đột thật), tối đa 3 lần.
  for (let attempt = 0; ; attempt++) {
    let usedNext = null;
    try {
      return await createTaskOnce(ws, actor, v, ctx, ref, counterRef, (n) => (usedNext = n));
    } catch (e) {
      const err = classify(e);
      if (err.kind !== ErrorKind.PERMISSION || attempt >= 2 || usedNext === null) throw err;
      const now = await getDoc(counterRef).catch(() => null);
      if (!now?.exists() || now.data().next === usedNext) throw err; // không phải xung đột → lỗi quyền thật
      await new Promise((r) => setTimeout(r, 50 + Math.random() * 150));
    }
  }
}

async function createTaskOnce(ws, actor, v, ctx, ref, counterRef, onRead) {
  return guard(async () => {
    await runTransaction(db, async (tx) => {
      const c = await tx.get(counterRef);
      if (!c.exists()) throw new AppError(ErrorKind.CONFIG, 'Workspace chưa được khởi tạo bộ đếm công việc.');
      onRead(c.data().next || 0);
      const seq = (c.data().next || 0) + 1;
      tx.update(counterRef, { next: seq });
      tx.set(ref, {
        ...v,
        assigneeName: ctx.memberName?.(v.assigneeUid) ?? null,
        checklist: [],
        evidence: [],
        seq,
        completedOn: v.status === 'Hoàn thành' ? todayIso() : null,
        ...created(actor),
      });
      const [aRef, aData] = activityDoc(ws, ref.id, actor, 'Tạo công việc', v.title);
      tx.set(aRef, aData);
    });
    return ref.id;
  });
}

/** Sửa toàn bộ thông tin (Owner / Trưởng Ban). Chỉ ghi các trường thay đổi. */
export async function updateTask(ws, actor, task, input, ctx) {
  const v = validateTask({ ...task, ...input }, ctx);
  const patch = {};
  for (const k of Object.keys(v)) if (JSON.stringify(task[k] ?? null) !== JSON.stringify(v[k] ?? null)) patch[k] = v[k];
  if (!Object.keys(patch).length) return;
  if ('assigneeUid' in patch) patch.assigneeName = ctx.memberName?.(v.assigneeUid) ?? null;
  if ('status' in patch) patch.completedOn = patch.status === 'Hoàn thành' ? todayIso() : null;
  return guard(async () => {
    const b = writeBatch(db);
    b.update(doc(db, 'workspaces', ws, 'tasks', task.id), { ...patch, ...stamp(actor) });
    const [aRef, aData] = activityDoc(
      ws,
      task.id,
      actor,
      'Cập nhật thông tin',
      Object.keys(patch)
        .filter((k) => k !== 'assigneeName')
        .join(', '),
    );
    b.set(aRef, aData);
    await b.commit();
  });
}

/**
 * Cập nhật tiến độ (người được giao cũng dùng được). Chỉ chứa các trường Rules cho phép.
 * @param {{status?:string, progress?:number, checklist?:object[], evidence?:object[]}} patch
 */
export async function updateTaskProgress(ws, actor, task, patch, note) {
  const p = {};
  if (patch.status !== undefined) {
    if (!TASK_STATUSES.includes(patch.status)) throw new AppError(ErrorKind.DATA, 'Trạng thái không hợp lệ.');
    p.status = patch.status;
    p.completedOn = patch.status === 'Hoàn thành' ? todayIso() : null;
  }
  if (patch.progress !== undefined) p.progress = Math.min(100, Math.max(0, Math.round(Number(patch.progress) || 0)));
  if (patch.checklist !== undefined) p.checklist = validateChecklist(patch.checklist);
  if (patch.evidence !== undefined) p.evidence = validateEvidence(patch.evidence);
  return guard(async () => {
    const b = writeBatch(db);
    b.update(doc(db, 'workspaces', ws, 'tasks', task.id), { ...p, ...stamp(actor) });
    const [aRef, aData] = activityDoc(ws, task.id, actor, note || 'Cập nhật tiến độ', p.status ? `Trạng thái: ${p.status}` : '');
    b.set(aRef, aData);
    await b.commit();
  });
}

/**
 * Tự lưu một trường văn bản có kiểm tra xung đột: nếu trên server trường đã khác giá trị gốc lúc bắt đầu sửa
 * (người khác vừa sửa), không ghi đè mà báo xung đột.
 */
export async function autosaveTaskField(ws, actor, taskId, field, baseValue, newValue, ctx) {
  if (!['title', 'description'].includes(field)) throw new AppError(ErrorKind.DATA, 'Trường không hỗ trợ tự lưu.');
  const ref = doc(db, 'workspaces', ws, 'tasks', taskId);
  return guard(async () =>
    runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new AppError(ErrorKind.DATA, 'Công việc đã bị xóa.');
      const server = snap.data()[field] ?? '';
      if (server === newValue) return { saved: false, value: server };
      if (server !== (baseValue ?? '')) throw new AppError(ErrorKind.CONFLICT, 'Nội dung vừa được người khác sửa. Bản của bạn chưa được lưu – hãy xem lại.');
      const v = validateTask({ ...snap.data(), [field]: newValue }, ctx);
      tx.update(ref, { [field]: v[field], ...stamp(actor) });
      const [aRef, aData] = activityDoc(ws, taskId, actor, field === 'title' ? 'Đổi tên công việc' : 'Sửa mô tả', field === 'title' ? v.title : '');
      tx.set(aRef, aData);
      return { saved: true, value: v[field] };
    }),
  );
}

export async function deleteTask(ws, taskId) {
  return guard(async () => {
    const b = writeBatch(db);
    b.delete(doc(db, 'workspaces', ws, 'tasks', taskId));
    await b.commit();
  });
}

export async function addComment(ws, actor, taskId, text) {
  const t = validateComment(text);
  return guard(async () => {
    const b = writeBatch(db);
    b.set(doc(collection(db, 'workspaces', ws, 'tasks', taskId, 'comments')), {
      text: t,
      authorUid: actor.uid,
      authorName: actor.name,
      createdAt: serverTimestamp(),
    });
    await b.commit();
  });
}

export async function deleteComment(ws, taskId, commentId) {
  return guard(async () => {
    const b = writeBatch(db);
    b.delete(doc(db, 'workspaces', ws, 'tasks', taskId, 'comments', commentId));
    await b.commit();
  });
}

// ---------------- Chương trình / sự kiện ----------------

export async function saveEvent(ws, actor, input, ctx, id = null) {
  const v = validateEvent(input, ctx);
  const data = { ...v, date: v.date || null, location: v.location || null, description: v.description || null };
  return guard(async () => {
    const b = writeBatch(db);
    const ref = id ? doc(db, 'workspaces', ws, 'events', id) : doc(col(ws, 'events'));
    if (id) b.update(ref, { ...data, ...stamp(actor) });
    else b.set(ref, { ...data, ...created(actor) });
    await b.commit();
    return ref.id;
  });
}

export async function deleteEvent(ws, id) {
  return guard(async () => {
    const b = writeBatch(db);
    b.delete(doc(db, 'workspaces', ws, 'events', id));
    await b.commit();
  });
}

/**
 * Nhân bản chương trình năm trước (PHAN_TICH_YEU_CAU §9: tái sử dụng kế hoạch).
 * Sao chép chương trình và các công việc thuộc chương trình; trạng thái đặt lại, ngày để trống để lập lịch mới.
 */
export async function cloneEvent(ws, actor, event, tasks, ctx, newTitle) {
  const evId = await saveEvent(ws, actor, { ...event, title: newTitle, status: 'Đang chuẩn bị', date: null }, ctx);
  let count = 0;
  for (const t of tasks) {
    await createTask(ws, actor, { ...t, eventId: evId, status: 'Chưa bắt đầu', progress: 0, startDate: null, dueDate: null }, ctx);
    count++;
  }
  return { eventId: evId, count };
}

// ---------------- Phê duyệt ----------------

export async function createApproval(ws, actor, approval) {
  return guard(async () => {
    const ref = doc(col(ws, 'approvals'));
    const b = writeBatch(db);
    b.set(ref, {
      title: approval.title,
      unitId: approval.unitId,
      eventId: approval.eventId || null,
      note: approval.note || null,
      requireSchoolLevel: approval.requireSchoolLevel,
      steps: approval.steps,
      currentStep: approval.currentStep,
      status: approval.status,
      submittedAt: approval.submittedAt || null,
      history: approval.history,
      ...created(actor),
    });
    await b.commit();
    return ref.id;
  });
}

/**
 * Ghi kết quả một bước duyệt/gửi duyệt dùng transaction: nếu hồ sơ đã bị người khác xử lý (trạng thái/bước đổi),
 * hủy thao tác để không ghi đè quyết định của người khác.
 */
export async function commitApprovalTransition(ws, actor, before, after, { asDecider }) {
  const ref = doc(db, 'workspaces', ws, 'approvals', before.id);
  return guard(async () =>
    runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new AppError(ErrorKind.DATA, 'Hồ sơ không còn tồn tại.');
      const cur = snap.data();
      if (cur.status !== before.status || cur.currentStep !== before.currentStep) {
        throw new AppError(ErrorKind.CONFLICT, 'Hồ sơ vừa được người khác xử lý. Vui lòng xem lại trạng thái mới.');
      }
      const fields = asDecider ? DECISION_FIELDS : [...DECISION_FIELDS, 'title', 'note', 'eventId', 'requireSchoolLevel'];
      const patch = {};
      for (const k of fields) if (after[k] !== undefined) patch[k] = after[k];
      tx.update(ref, { ...patch, ...stamp(actor) });
    }),
  );
}

export async function deleteApproval(ws, id) {
  return guard(async () => {
    const b = writeBatch(db);
    b.delete(doc(db, 'workspaces', ws, 'approvals', id));
    await b.commit();
  });
}

// ---------------- Thông báo từ Trường ----------------

export async function saveNotice(ws, actor, input, id = null) {
  const v = validateNotice(input);
  const data = { ...v, category: v.category || null, summary: v.summary || null, source: v.source || null, contact: v.contact || null };
  return guard(async () => {
    const b = writeBatch(db);
    if (id) b.update(doc(db, 'workspaces', ws, 'notices', id), { ...data, ...stamp(actor) });
    else b.set(doc(col(ws, 'notices')), { ...data, taskIds: [], ...created(actor) });
    await b.commit();
  });
}

export async function linkNoticeTask(ws, actor, noticeId, taskId) {
  return guard(async () => {
    const b = writeBatch(db);
    b.update(doc(db, 'workspaces', ws, 'notices', noticeId), { taskIds: arrayUnion(taskId), status: 'Đã phân công', ...stamp(actor) });
    await b.commit();
  });
}

export async function deleteNotice(ws, id) {
  return guard(async () => {
    const b = writeBatch(db);
    b.delete(doc(db, 'workspaces', ws, 'notices', id));
    await b.commit();
  });
}

// ---------------- Kinh phí ----------------

export async function proposeBudget(ws, actor, input, id = null) {
  const v = validateBudgetEntry(input);
  return guard(async () => {
    const b = writeBatch(db);
    if (id) b.update(doc(db, 'workspaces', ws, 'budget', id), { ...v, ...stamp(actor) });
    else b.set(doc(col(ws, 'budget')), { ...v, status: 'Đề xuất', decidedBy: null, ...created(actor) });
    await b.commit();
  });
}

export async function decideBudget(ws, actor, id, status) {
  if (!['Đã duyệt', 'Từ chối'].includes(status)) throw new AppError(ErrorKind.DATA, 'Quyết định không hợp lệ.');
  return guard(async () => {
    const b = writeBatch(db);
    b.update(doc(db, 'workspaces', ws, 'budget', id), { status, decidedBy: actor.uid, ...stamp(actor) });
    await b.commit();
  });
}

export async function deleteBudget(ws, id) {
  return guard(async () => {
    const b = writeBatch(db);
    b.delete(doc(db, 'workspaces', ws, 'budget', id));
    await b.commit();
  });
}

// ---------------- Tài liệu ----------------

export async function saveDoc(ws, actor, input, id = null) {
  const v = validateDoc(input);
  const data = { ...v, appliesTo: v.appliesTo || null, academicYear: v.academicYear || null };
  return guard(async () => {
    const b = writeBatch(db);
    if (id) b.update(doc(db, 'workspaces', ws, 'docs', id), { ...data, ...stamp(actor) });
    else b.set(doc(col(ws, 'docs')), { ...data, ...created(actor) });
    await b.commit();
  });
}

export async function deleteDocument(ws, id) {
  return guard(async () => {
    const b = writeBatch(db);
    b.delete(doc(db, 'workspaces', ws, 'docs', id));
    await b.commit();
  });
}

export { deleteField };

// ---------------- Trao đổi (chat) ----------------

/** Gửi tin nhắn; chỉ resolve khi máy chủ đã xác nhận. Rules kiểm tra quyền kênh và tên người gửi. */
export async function sendMessage(ws, actor, chatId, text) {
  const t = validateMessage(text);
  return guard(async () => {
    const b = writeBatch(db);
    const ref = doc(collection(db, 'workspaces', ws, 'chats', chatId, 'messages'));
    b.set(ref, { text: t, authorUid: actor.uid, authorName: actor.name, createdAt: serverTimestamp() });
    await b.commit();
    return ref.id;
  });
}

export async function deleteMessage(ws, chatId, messageId) {
  return guard(async () => {
    const b = writeBatch(db);
    b.delete(doc(db, 'workspaces', ws, 'chats', chatId, 'messages', messageId));
    await b.commit();
  });
}
