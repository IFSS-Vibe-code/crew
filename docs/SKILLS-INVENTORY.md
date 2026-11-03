# Kiểm kê skills

Cài vào `~/.claude/skills/` (cấp toàn cục cho Claude Code). Máy chưa có Node/npm lúc cài nên **không dùng `npx skills`**: tôi clone repo chính thức, quét mẫu độc hại (`curl|sh`, `eval`, `base64 -d`: không thấy), rồi chép thư mục skill. Skill của người dùng/bản dựng sẵn (`synced/`) giữ nguyên.

| Nguồn | Commit | Đã cài | Bỏ qua (lý do) |
|---|---|---|---|
| mattpocock/skills | 4ae2317 | 30 (engineering, productivity, misc; gồm `setup-matt-pocock-skills`) | 8 skill `in-progress` (thử nghiệm) |
| cloudflare/security-audit-skill | c1c8a8c | `security-audit` | — |
| obra/superpowers | 2ce8aa1 | 15 (brainstorming, writing-plans, systematic-debugging, verification-before-completion…) | — |
| vercel-labs/agent-skills | 1a2c79d | 6 (`web-design-guidelines`, react-*, composition-patterns, writing-guidelines) | `deploy-to-vercel`, `vercel-cli-with-tokens`, `vercel-optimize` (xung đột ràng buộc: không chuyển nền tảng) |
| firebase/agent-skills | e61fb31 | 12 (firestore, auth, security-rules-auditor, firestore-rules-creation…) | `firebase-hosting-basics`, `firebase-app-hosting-basics` (cấm Hosting), `xcode-project-setup` (không liên quan) |
| Seokwoooo/lucian-uxui | 0067ad8 | `lucian-uxui` | — |
| Bổ sung theo yêu cầu: ui-ux-pro-max (nextlevelbuilder), ponytail (chỉ phần skill, bỏ hooks/plugin), frontend-design, senior-backend, file-organizer, theme-factory (davila7/claude-code-templates) | 713eef5 / 96608e0 / 17af17f | 17 | — |
| Panniantong/Agent-Reach | 7a38047 | Chỉ phần SKILL.md | Chương trình `agent-reach` **chưa cài** (cần Python ≥ 3.10 + `uv`; lệnh cài bị hệ thống quyền chặn) → skill chưa dùng được |

Tổng 84 skill trong thư mục. Nhận diện: danh sách skill hiện ra trong phiên làm việc sau khi cài.

## Skill thực sự đã sử dụng trong dự án này
| Skill | Cách dùng | Mức độ |
|---|---|---|
| `web-design-guidelines` | Tải bộ quy tắc mới nhất từ nguồn chính thức, đối chiếu UI và **sửa** các vi phạm xác định được (nhãn/placeholder `…`, `touch-action`, `overscroll-behavior`, `tabular-nums`, `text-wrap: balance`, safe-area, `translate="no"`, cảnh báo rời trang, tiêu đề trang) | Rà soát thủ công bởi tôi theo bộ quy tắc, không có công cụ lint tự động |
| `security-audit` | Rà soát focused (xem `SECURITY-REVIEW.md`) | **Chế độ guidance**, không chạy 6 pha/sub-agent |

**Không** đánh dấu là đã dùng: các skill còn lại (brainstorming, tdd, firebase-*, lucian-uxui, ui-ux-pro-max…). Đã cài và nhận diện nhưng tôi không gọi chúng; thiết kế UI dựa trên mockup + tự viết CSS, **không** dùng thư viện thành phần Lucian; các quy tắc Firebase theo tài liệu chính thức và kiến thức sẵn có, chưa đối chiếu với skill `firebase-*`.
