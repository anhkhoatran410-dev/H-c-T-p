# STUDY TH — AI & Security Status

Cập nhật: 2026-09-22

## Trạng thái mô hình AI hiện tại

STUDY TH không sử dụng một model duy nhất cho mọi tác vụ. Kiến trúc hiện tại là pipeline định tuyến + fallback + kiểm chứng:

### 1. Solve thông thường
- Provider chính: Google Gemini qua `GEMINI_MODEL` và `GEMINI_FALLBACK_MODELS`.
- Các model mặc định trong solve fallback hiện gồm `gemini-3.8-flash`, `gemini-3.7-flash`, `gemini-3.6-flash`, `gemini-3.5-flash-lite`.
- Có pool API key Gemini để phân phối tải/lỗi.
- Có fallback trực tiếp Gemini khi solver legacy lỗi.
- Có OpenAI Responses API fallback qua `OPENAI_SOLVER_MODEL` (mặc định trong code: `gpt-5`) khi Gemini pipeline không giải được.

### 2. Reasoning / bài khó
- Solver tự phân loại tier theo loại bài, môn, mức khó và cờ Deep.
- Bài Deep/VMO/Olympiad có đường xử lý riêng, timeout/budget cao hơn.
- Deep có thể đưa vào job queue với Supabase-backed job store, idempotency key, worker lease và retry.
- Có cache cho một số request xác định, chỉ cache khi kết quả đã finalized và không ở trạng thái degraded/timeout/review-skipped.

### 3. Multi-Expert Reasoning (MER)
- Bài Olympic/Deep có thể đi qua `mer-engine.js`.
- MER tạo nhiều expert độc lập rồi tổng hợp.
- Không coi độ giống văn bản là bằng chứng đúng; kết quả cuối phải dựa trên đáp án/kiểm chứng và các tín hiệu đánh giá của pipeline.

### 4. Verification
- Bài toán thông thường có thể dùng Wolfram/CAS để kiểm tra khi phù hợp.
- Bài Olympic có LLM reviewer độc lập: reviewer được yêu cầu tự giải từ đề gốc rồi đối chiếu lời giải ứng viên.
- Verdict hiện có: PASS / FAIL / UNCERTAIN.
- Khi cần, có Repair Engine để giải lại toàn bộ thay vì vá một dòng.

### 5. Vision / multimodal
- Solve hỗ trợ ảnh đầu vào.
- Generate Exam và Flashcards hỗ trợ PDF/ảnh và text nguồn.
- Generate Exam tạo MCQ, Đúng/Sai, Trả lời ngắn và Flashcard; có validation schema sau khi model trả JSON.
- Flashcard có dedupe theo front và validation dữ liệu đầu ra.

### 6. Streaming / long-running jobs
- `/api/solve` hỗ trợ SSE streaming với stage events.
- Deep jobs dùng `/api/solve-job` + `/api/solve-job-status`.
- Job store dùng Supabase RPC; có claim/lease/concurrency và max attempts.

## Security hiện tại

### API boundary
- Method allowlist.
- Bắt buộc JSON cho các endpoint AI chính.
- Body-size limit.
- Same-origin check.
- Request ID.
- Cache-Control no-store.
- Security headers: CSP-related browser hardening through X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy, COOP/CORP và HSTS ở Vercel config.
- API responses đặt no-store.

### Rate limiting / abuse defense
- Local rate limiting.
- Distributed rate limiting qua Upstash Redis khi cấu hình.
- Intrusion Shield với score/quarantine/block.
- Adaptive cost challenge.
- Agent-threat defense.
- Emergency AI lockdown.

### Prompt / input security
- Chặn các mẫu prompt injection có độ tin cậy cao.
- Giới hạn prompt/history.
- NFKC normalization và loại control characters.
- Semantic conversation guard cho nhiều tín hiệu jailbreak.
- DLP redaction cho email, điện thoại VN, ID, JWT, API key, AWS key, private key, bearer token.
- Source URL của Generate Exam/Flashcards bị giới hạn vào Storage host/path cho phép.

### Output security
- Response guard giới hạn kích thước.
- Chặn private key, API key, JWT, bearer token và secret/env material trong output.
- Không trả lỗi provider/internal stack trực tiếp cho client ở các guarded generation paths.
- AI audit log có request ID, endpoint, outcome, latency và metadata cần thiết.

### Admin / system controls
- Admin login/tools tồn tại.
- System-control routes dùng cho maintenance, incidents và AI lockdown.
- Public maintenance status có GET; các thao tác ghi hệ thống/admin được bảo vệ ở API layer.
- Admin tools được route qua `/api/admin-tools`.

## Phần đã có nhưng cần tiếp tục kiểm thử

- End-to-end test để chắc chắn nút “Giải” không rơi về trang chủ khi request lỗi.
- Test toàn bộ solve matrix: text, image, math thường, math Olympic, follow-up, streaming, Deep job.
- Kiểm tra MER trong các bài mà các expert có thể cùng sai.
- Kiểm thử rate-limit/quarantine trên production.
- Kiểm tra Supabase RPC/RLS và quyền service-role boundary.
- Kiểm thử source URL abuse, oversized document và malformed media.
- Xác nhận mọi endpoint admin write đều đi qua auth trước khi truy cập dữ liệu.
- Thêm automated regression/security tests và theo dõi CI trước khi coi hệ thống production-ready.

## Phần chưa nên coi là hoàn thiện

- Chưa có bằng chứng từ repo rằng toàn bộ security controls đã được kiểm thử end-to-end trên production.
- Không nên ghi “AI chính xác tuyệt đối” hoặc “security tuyệt đối”; pipeline hiện có nhiều lớp kiểm chứng/giảm rủi ro nhưng vẫn cần benchmark và adversarial tests.
