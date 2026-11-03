// Quét secret trong các file được Git theo dõi (hoặc toàn bộ cây thư mục nếu chưa có Git). Thoát mã 1 nếu thấy.
// Lưu ý: Firebase Web API key (AIza...) KHÔNG phải secret theo tài liệu Firebase và được phép nằm trong src/config/firebase-config.js.
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const PATTERNS = [
  ['Khóa riêng PEM', /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/],
  ['Service-account Google', /"type"\s*:\s*"service_account"/],
  ['GitHub token', /\b(?:ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]{20,}/],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
  ['Slack token', /\bxox[baprs]-[A-Za-z0-9-]{10,}/],
  ['OAuth refresh token Google', /\b1\/\/[0-9A-Za-z_-]{40,}/],
  ['Mật khẩu gán cứng', /(?:password|passwd|secret|token)\s*[:=]\s*['"][^'"\s]{12,}['"]/i],
];
const ALLOW_FILES = new Set(['scripts/scan-secrets.mjs']);
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'test-results', 'playwright-report', '.firebase']);

function listFiles() {
  try {
    return execFileSync('git', ['ls-files', '-co', '--exclude-standard'], { encoding: 'utf8' }).split('\n').filter(Boolean);
  } catch {
    const out = [];
    const walk = (d) => {
      for (const n of readdirSync(d)) {
        if (SKIP_DIRS.has(n)) continue;
        const p = join(d, n);
        statSync(p).isDirectory() ? walk(p) : out.push(relative('.', p));
      }
    };
    walk('.');
    return out;
  }
}

const hits = [];
for (const f of listFiles()) {
  if (ALLOW_FILES.has(f) || /\.(png|jpe?g|gif|ico|pdf|zip|woff2?)$/i.test(f) || f === 'package-lock.json') continue;
  let text;
  try {
    text = readFileSync(f, 'utf8');
  } catch {
    continue;
  }
  for (const [name, re] of PATTERNS) {
    const m = re.exec(text);
    if (m) hits.push(`${f}: ${name}`); // không in nội dung khớp để tránh làm lộ secret vào log
  }
}
if (hits.length) {
  console.error('Phát hiện nghi ngờ secret:\n' + hits.join('\n'));
  process.exit(1);
}
console.log('Không phát hiện secret trong mã nguồn.');
