import { html, run, toast } from './kit.js';
import * as authSvc from '../services/firebase/auth.js';
import { getState } from '../state/store.js';
import { runtimeInfo } from '../services/firebase/app.js';

let mode = 'signin';

const brand = html`<div class="brand" style="padding:0"><div class="brandmark">K</div><div><strong translate="no">KhoaFlow</strong><small>WORKSPACE MANAGEMENT</small></div></div>`;

export function authScreen() {
  const signup = mode === 'signup';
  return html`<div class="authwrap"><main class="authcard">
    ${brand}
    <h1>${signup ? 'Tạo tài khoản' : 'Đăng nhập'}</h1>
    <p class="lead">${signup ? 'Dùng email của bạn. Hệ thống sẽ gửi thư xác minh trước khi bạn được vào Workspace.' : 'Đăng nhập để xem và xử lý công việc của Khoa.'}</p>
    <form id="authForm" novalidate>
      ${signup ? html`<div class="field"><label for="a_name">Họ và tên</label><input class="input" id="a_name" name="name" autocomplete="name" maxlength="100" required /></div>` : ''}
      <div class="field"><label for="a_email">Email</label><input class="input" id="a_email" name="email" type="email" autocomplete="email" required /></div>
      <div class="field"><label for="a_pw">Mật khẩu</label><input class="input" id="a_pw" name="password" type="password" autocomplete="${signup ? 'new-password' : 'current-password'}" required />
        ${signup ? html`<div class="hint">Tối thiểu 8 ký tự, gồm chữ và số.</div>` : ''}</div>
      <div class="err" id="authErr" role="alert" style="margin-bottom:10px"></div>
      <button class="btn primary" type="submit">${signup ? 'Tạo tài khoản' : 'Đăng nhập'}</button>
    </form>
    <div class="authswitch">
      ${signup ? html`Đã có tài khoản? <button class="textlink" data-mode="signin">Đăng nhập</button>` : html`Chưa có tài khoản? <button class="textlink" data-mode="signup">Đăng ký</button> · <button class="textlink" id="forgot">Quên mật khẩu</button>`}
    </div>
    ${runtimeInfo.emulator ? html`<p class="notice error" style="margin-top:14px">Đang chạy với Firebase Emulator (chế độ thử nghiệm).</p>` : ''}
  </main></div>`;
}

export function bindAuth(root, rerender) {
  root.querySelectorAll('[data-mode]').forEach((b) =>
    b.addEventListener('click', () => {
      mode = b.dataset.mode;
      rerender();
    }),
  );
  const form = root.querySelector('#authForm');
  const err = root.querySelector('#authErr');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    err.textContent = '';
    const f = Object.fromEntries(new FormData(form));
    if (!f.email || !f.password) {
      err.textContent = 'Vui lòng nhập email và mật khẩu.';
      return;
    }
    run(
      form.querySelector('button[type=submit]'),
      async () => {
        if (mode === 'signup') await authSvc.signUp({ email: f.email, password: f.password, displayName: f.name });
        else await authSvc.signIn(f.email, f.password);
      },
      {
        onError: (ex) => {
          err.textContent = ex.message;
          return true;
        },
      },
    );
  });
  root.querySelector('#forgot')?.addEventListener('click', async () => {
    const email = form.elements.email.value.trim();
    if (!email) {
      err.textContent = 'Nhập email của bạn ở ô trên rồi bấm "Quên mật khẩu".';
      return;
    }
    await run(null, () => authSvc.resetPassword(email), { ok: 'Nếu email tồn tại, hệ thống đã gửi thư đặt lại mật khẩu.' });
  });
}

export function verifyScreen() {
  const u = getState().user;
  return html`<div class="authwrap"><main class="authcard">
    ${brand}
    <h1>Xác minh email</h1>
    <p class="lead">Chúng tôi đã gửi thư xác minh tới <b>${u.email}</b>. Hãy mở thư, bấm vào liên kết, rồi quay lại đây.</p>
    <div class="err" id="vErr" role="alert" style="margin-bottom:10px"></div>
    <button class="btn primary" id="vCheck">Tôi đã xác minh</button>
    <div class="authswitch"><button class="textlink" id="vResend">Gửi lại thư xác minh</button> · <button class="textlink" id="vOut">Đăng xuất</button></div>
  </main></div>`;
}

export function bindVerify(root) {
  const err = root.querySelector('#vErr');
  root.querySelector('#vCheck').addEventListener('click', (e) =>
    run(
      e.currentTarget,
      async () => {
        const ok = await authSvc.refreshVerification();
        if (!ok) throw new Error('Email chưa được xác minh. Hãy kiểm tra hộp thư (cả mục Spam).');
        location.reload();
      },
      {
        onError: (ex) => {
          err.textContent = ex.message;
          return true;
        },
      },
    ),
  );
  root.querySelector('#vResend').addEventListener('click', () => run(null, () => authSvc.resendVerification(), { ok: 'Đã gửi lại thư xác minh.' }));
  root.querySelector('#vOut').addEventListener('click', () => authSvc.signOut().catch((e) => toast(e.message, 'error')));
}
