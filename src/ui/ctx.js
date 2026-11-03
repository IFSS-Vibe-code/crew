// Truy cập nhanh dữ liệu dẫn xuất từ state cho các trang.
import { getState } from '../state/store.js';

export const S = () => getState();
export const wsId = () => getState().wsId;
export const me = () => getState().me;

export function actor() {
  const { user, me: m } = getState();
  return { uid: user.uid, name: m?.displayName || user.displayName || user.email };
}
export function unitMap() {
  return new Map(getState().units.map((u) => [u.id, u]));
}
export const unitName = (id) => unitMap().get(id)?.name || '(Đã xóa)';
export function memberMap() {
  return new Map(getState().members.map((m) => [m.uid, m]));
}
export const memberName = (uid) => (uid ? memberMap().get(uid)?.displayName || null : null);

/** Ngữ cảnh cho validation & repo. */
export function vctx() {
  return { unitIds: getState().units.map((u) => u.id), memberName };
}

/** Các Ban mà tôi được tạo việc / chương trình / hồ sơ. */
export function myManageableUnits() {
  const { me: m, units } = getState();
  if (!m) return [];
  if (m.role === 'owner') return units;
  if (m.role === 'manager') return units.filter((u) => (m.unitIds || []).includes(u.id));
  return [];
}

export function isLoaded(...keys) {
  const { loaded } = getState();
  return keys.every((k) => loaded[k]);
}
export function firstError(...keys) {
  const { errors } = getState();
  for (const k of keys) if (errors[k]) return errors[k];
  return null;
}
