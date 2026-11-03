import { readFileSync } from 'node:fs';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, Timestamp } from 'firebase/firestore';

export const WS = 'ws1';
export const USERS = {
  owner: { uid: 'u_owner', email: 'owner@khoa.test', role: 'owner', unitIds: [] },
  approver: { uid: 'u_appr', email: 'approver@khoa.test', role: 'approver', unitIds: [] },
  manager: { uid: 'u_mgr', email: 'manager@khoa.test', role: 'manager', unitIds: ['unitA'] },
  member: { uid: 'u_mem', email: 'member@khoa.test', role: 'member', unitIds: [] },
  lecturer: { uid: 'u_lec', email: 'lecturer@khoa.test', role: 'lecturer', unitIds: ['unitB'] },
};

export async function makeEnv() {
  // Bắt buộc nạp đúng file Rules thật của dự án.
  const rules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
  if (!rules.includes('allow read, write: if false')) throw new Error('Rules không phải bản của dự án');
  return initializeTestEnvironment({ projectId: 'demo-crewwork', firestore: { rules } });
}

/** Firestore của một người dùng đã xác minh email. */
export function dbAs(env, user, { verified = true } = {}) {
  return env.authenticatedContext(user.uid, { email: user.email, email_verified: verified }).firestore();
}

const ts = Timestamp.fromMillis(Date.UTC(2026, 10, 1));
export const SETTINGS = { remindBeforeDeadlineHours: 24, approvalWaitWarnDays: 14, requireEvidenceOnComplete: true, allowConditionalPrep: true };

export function baseTask(over = {}) {
  return {
    title: 'Việc mẫu',
    description: '',
    unitId: 'unitA',
    type: 'Sự kiện',
    status: 'Chưa bắt đầu',
    priority: 'Cao',
    assigneeUid: USERS.member.uid,
    assigneeName: 'Thành viên',
    collaboratorUids: [],
    startDate: null,
    dueDate: '2026-11-20',
    eventId: null,
    progress: 0,
    checklist: [],
    evidence: [],
    seq: 1,
    createdBy: USERS.owner.uid,
    createdAt: ts,
    updatedAt: ts,
    updatedBy: USERS.owner.uid,
    completedOn: null,
    ...over,
  };
}

/** Dữ liệu nền: Workspace, thành viên, 2 Ban, bộ đếm, một công việc. */
export async function seed(env) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `workspaces/${WS}`), {
      name: 'Khoa FinTech',
      type: 'Khoa / đơn vị đào tạo',
      academicYear: '2026 – 2027',
      contactEmail: '',
      ownerUid: USERS.owner.uid,
      settings: SETTINGS,
      createdAt: ts,
      updatedAt: ts,
      updatedBy: USERS.owner.uid,
    });
    for (const u of Object.values(USERS)) {
      await setDoc(doc(db, `workspaces/${WS}/members/${u.uid}`), {
        uid: u.uid,
        email: u.email,
        displayName: u.role,
        role: u.role,
        unitIds: u.unitIds,
        joinedAt: ts,
        updatedAt: ts,
      });
    }
    for (const id of ['unitA', 'unitB']) {
      await setDoc(doc(db, `workspaces/${WS}/units/${id}`), {
        name: id,
        description: '',
        managerLabel: '',
        icon: '▤',
        createdAt: ts,
        updatedAt: ts,
        updatedBy: USERS.owner.uid,
      });
    }
    await setDoc(doc(db, `workspaces/${WS}/counters/tasks`), { next: 1 });
    await setDoc(doc(db, `workspaces/${WS}/tasks/t1`), baseTask());
    await setDoc(doc(db, `workspaces/${WS}/tasks/tB`), baseTask({ unitId: 'unitB', assigneeUid: null, assigneeName: null, seq: 2 }));
  });
}
