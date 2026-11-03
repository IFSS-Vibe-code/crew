// Phân loại lỗi toàn hệ thống (Master prompt §7.2). Giao diện chỉ hiển thị thông điệp thân thiện;
// chi tiết kỹ thuật chỉ ghi console ở chế độ phát triển.
import { ValidationError } from '../domain/validation.js';
import { ApprovalError } from '../domain/approvals.js';

export const ErrorKind = Object.freeze({
  CONFIG: 'config',
  DATA: 'data',
  AUTH: 'auth',
  PERMISSION: 'permission',
  NETWORK: 'network',
  QUERY: 'query',
  SYNC: 'sync',
  CONFLICT: 'conflict',
  UNKNOWN: 'unknown',
});

export class AppError extends Error {
  constructor(kind, message, cause) {
    super(message);
    this.name = 'AppError';
    this.kind = kind;
    this.cause = cause;
  }
}

const AUTH_MESSAGES = {
  'auth/invalid-credential': 'Email hoặc mật khẩu không đúng.',
  'auth/wrong-password': 'Email hoặc mật khẩu không đúng.',
  'auth/user-not-found': 'Email hoặc mật khẩu không đúng.',
  'auth/invalid-email': 'Email không hợp lệ.',
  'auth/email-already-in-use': 'Email này đã có tài khoản. Hãy đăng nhập hoặc đặt lại mật khẩu.',
  'auth/weak-password': 'Mật khẩu cần ít nhất 8 ký tự, gồm chữ và số.',
  'auth/too-many-requests': 'Thử quá nhiều lần. Vui lòng đợi một lúc rồi thử lại.',
  'auth/network-request-failed': 'Không có kết nối mạng.',
  'auth/user-disabled': 'Tài khoản đã bị khóa.',
  'auth/requires-recent-login': 'Vui lòng đăng nhập lại để tiếp tục.',
  'auth/operation-not-allowed': 'Phương thức đăng nhập chưa được bật cho hệ thống.',
};

/** Chuyển mọi lỗi về AppError có phân loại. */
export function classify(err) {
  if (err instanceof AppError) return err;
  if (err instanceof ValidationError) return new AppError(ErrorKind.DATA, err.message, err);
  if (err instanceof ApprovalError) return new AppError(ErrorKind.DATA, err.message, err);
  const code = String(err?.code || '');
  if (code.startsWith('auth/')) return new AppError(ErrorKind.AUTH, AUTH_MESSAGES[code] || 'Không thể xác thực. Vui lòng thử lại.', err);
  switch (code) {
    case 'permission-denied':
      return new AppError(ErrorKind.PERMISSION, 'Bạn không có quyền thực hiện thao tác này.', err);
    case 'unauthenticated':
      return new AppError(ErrorKind.AUTH, 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.', err);
    case 'unavailable':
    case 'deadline-exceeded':
      return new AppError(ErrorKind.NETWORK, 'Không kết nối được máy chủ. Thay đổi chưa được lưu.', err);
    case 'failed-precondition':
      return new AppError(ErrorKind.QUERY, 'Truy vấn dữ liệu chưa sẵn sàng (có thể thiếu chỉ mục). Vui lòng báo quản trị viên.', err);
    case 'resource-exhausted':
      return new AppError(ErrorKind.QUERY, 'Hệ thống đã chạm hạn mức miễn phí trong ngày. Vui lòng thử lại sau.', err);
    case 'aborted':
      return new AppError(ErrorKind.CONFLICT, 'Dữ liệu vừa được người khác cập nhật. Vui lòng xem lại và thử lại.', err);
    case 'not-found':
      return new AppError(ErrorKind.DATA, 'Dữ liệu không còn tồn tại (có thể đã bị xóa).', err);
    case 'invalid-argument':
      return new AppError(ErrorKind.DATA, 'Dữ liệu gửi lên không hợp lệ.', err);
    default:
      return new AppError(ErrorKind.UNKNOWN, 'Đã xảy ra lỗi không xác định. Vui lòng thử lại.', err);
  }
}

/** Ghi log kỹ thuật chỉ ở môi trường dev; không log dữ liệu nhạy cảm. */
export function logError(context, err) {
  if (import.meta.env?.DEV) {
    console.error(`[KhoaFlow] ${context}:`, err?.cause || err);
  }
}
