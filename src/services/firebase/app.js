// Khởi tạo Firebase. Cấu hình Web là thông tin công khai theo tài liệu Firebase;
// bảo vệ dữ liệu dựa vào Authentication + Security Rules, KHÔNG dựa vào việc giấu cấu hình.
import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { initializeFirestore, memoryLocalCache, connectFirestoreEmulator } from 'firebase/firestore';
import { firebaseConfig } from '../../config/firebase-config.js';
import { AppError, ErrorKind } from '../errors.js';

const useEmulators = import.meta.env.VITE_USE_EMULATORS === 'true';

if (useEmulators && import.meta.env.PROD) {
  // Không bao giờ để bản production kết nối Emulator.
  throw new AppError(ErrorKind.CONFIG, 'Bản production không được cấu hình dùng Emulator.');
}
for (const k of ['apiKey', 'authDomain', 'projectId', 'appId']) {
  if (!firebaseConfig[k]) throw new AppError(ErrorKind.CONFIG, `Thiếu cấu hình Firebase: ${k}`);
}

const projectId = useEmulators ? 'demo-crew' : firebaseConfig.projectId;
export const app = initializeApp({ ...firebaseConfig, projectId });
export const auth = getAuth(app);
// Bộ nhớ đệm trong RAM: không lưu dữ liệu Khoa lâu dài trên máy dùng chung (xem docs/ARCHITECTURE.md).
export const db = initializeFirestore(app, { localCache: memoryLocalCache() });

if (useEmulators) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}

export const runtimeInfo = Object.freeze({ projectId, emulator: useEmulators });
