# STUDY TH Deep AI Worker

Worker bên ngoài Vercel để xử lý job Deep/VMO nền.

## Environment

- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- GEMINI_API_KEY (hoặc cấu hình key-pool hiện tại)
- AI_WORKER_ID (tùy chọn)
- AI_MAX_CONCURRENCY (mặc định 1)
- AI_JOB_LEASE_SECONDS (mặc định 120)
- AI_JOB_MAX_SECONDS (mặc định 600)
- AI_QUEUE_BUSY_RETRY_SECONDS (mặc định 5)
- AI_REAP_INTERVAL_MS (mặc định 30000)
- AI_JOB_RETENTION_DAYS (mặc định 7)
- AI_EXPERT_TIMEOUT_MS (worker: mặc định 120000)
- AI_REVIEW_TIMEOUT_MS (worker: mặc định 90000)
- AI_REPAIR_TIMEOUT_MS (worker: mặc định 30000)
- AI_EXPERT_MAX_TOKENS (worker: mặc định 16000)
- AI_REVIEW_MAX_TOKENS (worker: mặc định 16000)
- AI_WORKER_POLL_MS (mặc định 1500)

## Chạy

```bash
cd worker
node ai-worker.js
```

Hoặc build container bằng `worker/Dockerfile`.

Worker chỉ xử lý tối đa một job trong một process mặc định vì solver hiện dùng state request nội bộ. Có thể chạy nhiều worker instance; DB queue sẽ chia job qua cơ chế claim + lease.

Không đặt SUPABASE_SERVICE_ROLE_KEY ở frontend.
