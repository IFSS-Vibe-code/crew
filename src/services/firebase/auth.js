import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  updateProfile,
  signOut as fbSignOut,
} from 'firebase/auth';
import { auth } from './app.js';
import { AppError, ErrorKind, classify } from '../errors.js';

export function onAuth(cb) {
  return onAuthStateChanged(auth, cb);
}

/** Mật khẩu tối thiểu 8 ký tự, có chữ và số. */
export function passwordProblem(pw) {
  if (typeof pw !== 'string' || pw.length < 8) return 'Mật khẩu cần ít nhất 8 ký tự.';
  if (!/[A-Za-zÀ-ỹ]/.test(pw) || !/\d/.test(pw)) return 'Mật khẩu cần có cả chữ và số.';
  return null;
}

export async function signIn(email, password) {
  try {
    return (await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password)).user;
  } catch (e) {
    throw classify(e);
  }
}

export async function signUp({ email, password, displayName }) {
  const name = String(displayName || '').trim();
  if (!name || name.length > 100) throw new AppError(ErrorKind.DATA, 'Vui lòng nhập họ tên (tối đa 100 ký tự).');
  const p = passwordProblem(password);
  if (p) throw new AppError(ErrorKind.DATA, p);
  try {
    const cred = await createUserWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
    await updateProfile(cred.user, { displayName: name });
    await sendEmailVerification(cred.user, { url: location.href.split('#')[0] });
    return cred.user;
  } catch (e) {
    throw classify(e);
  }
}

export async function resendVerification() {
  if (!auth.currentUser) throw new AppError(ErrorKind.AUTH, 'Chưa đăng nhập.');
  try {
    await sendEmailVerification(auth.currentUser, { url: location.href.split('#')[0] });
  } catch (e) {
    throw classify(e);
  }
}

/** Tải lại trạng thái xác minh email và làm mới token để Rules nhận email_verified. */
export async function refreshVerification() {
  const u = auth.currentUser;
  if (!u) return false;
  await u.reload();
  if (u.emailVerified) await u.getIdToken(true);
  return u.emailVerified;
}

export async function resetPassword(email) {
  try {
    await sendPasswordResetEmail(auth, email.trim().toLowerCase());
  } catch (e) {
    throw classify(e);
  }
}

export async function signOut() {
  await fbSignOut(auth);
}
