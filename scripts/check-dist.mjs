// Kiểm tra bản build production: không chứa Emulator/localhost, không nhúng secret, đúng project Firebase.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const EXPECTED_PROJECT = 'khoaflow-ifss-2026';
const files = [];
const walk = (d) => readdirSync(d).forEach((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : files.push(join(d, n))));
walk('dist');

const problems = [];
const all = files.filter((f) => /\.(js|html|css)$/.test(f)).map((f) => [f, readFileSync(f, 'utf8')]);
for (const [f, t] of all) {
  if (/127\.0\.0\.1:(?:8080|9099)|localhost:(?:8080|9099|5173)/.test(t)) problems.push(`${f}: tham chiếu Emulator/localhost`);
  if (/BEGIN (?:RSA |EC )?PRIVATE KEY|"type":\s*"service_account"|\bgh[pousr]_[A-Za-z0-9]{20,}/.test(t)) problems.push(`${f}: nghi ngờ secret`);
}
const js = all
  .filter(([f]) => f.endsWith('.js'))
  .map(([, t]) => t)
  .join('\n');
if (!js.includes(EXPECTED_PROJECT)) problems.push(`Bản build không chứa projectId ${EXPECTED_PROJECT}`);
const html = all.find(([f]) => f.endsWith('index.html'))?.[1] || '';
if (/http:\/\/127\.0\.0\.1|ws:\/\/127\.0\.0\.1/.test(html)) problems.push('CSP của bản build cho phép localhost');
if (!/Content-Security-Policy/.test(html)) problems.push('Thiếu Content-Security-Policy');
if (problems.length) {
  console.error('Bản build không đạt:\n' + problems.join('\n'));
  process.exit(1);
}
console.log(`Bản build hợp lệ (${files.length} file).`);
