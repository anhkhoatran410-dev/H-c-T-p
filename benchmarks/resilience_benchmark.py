#!/usr/bin/env python3
"""Bounded real-world resilience probe for Study TH. Non-destructive only."""
from __future__ import annotations

import concurrent.futures
import json
import os
import re
import statistics
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, asdict
from typing import Any

BASE_URL = os.environ.get("BASE_URL", "https://hoc-va-choi.vercel.app").rstrip("/")
TIMEOUT = int(os.environ.get("RESILIENCE_TIMEOUT", "15"))
WORKERS = int(os.environ.get("RESILIENCE_WORKERS", "8"))
SENSITIVE = re.compile(
    r"(?i)(stack trace|traceback|node_modules|/home/|/app/|service_role|private[_-]?key|access[_-]?token|gemini[_-]?api|google[_-]?api|generativelanguage|ai\.google\.dev|quota|billing|rate.?limit)"
)

@dataclass
class Probe:
    suite: str
    endpoint: str
    status: int
    latency_ms: int
    ok: bool
    detail: str = ""


def request(path: str, method: str = "GET", payload: Any = None, headers: dict[str, str] | None = None):
    body = None
    hdrs = {"User-Agent": "study-th-resilience-benchmark/1.0", "Accept": "application/json, text/plain;q=0.8"}
    if headers:
        hdrs.update(headers)
    if payload is not None:
        body = payload if isinstance(payload, (bytes, bytearray)) else json.dumps(payload, ensure_ascii=False).encode()
        hdrs.setdefault("Content-Type", "application/json")
    req = urllib.request.Request(BASE_URL + path, data=body, headers=hdrs, method=method)
    start = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            raw = r.read(16001)
            return r.status, raw.decode("utf-8", "replace"), int((time.perf_counter() - start) * 1000), ""
    except urllib.error.HTTPError as e:
        raw = e.read(16001)
        return e.code, raw.decode("utf-8", "replace"), int((time.perf_counter() - start) * 1000), ""
    except Exception as e:
        return 0, "", int((time.perf_counter() - start) * 1000), repr(e)


def safe_body(text: str) -> bool:
    return len(text) <= 16000 and not SENSITIVE.search(text)


def run_one(item):
    suite, path, method, payload, headers, allowed = item
    status, text, ms, err = request(path, method, payload, headers)
    ok = bool(status in allowed and safe_body(text) and not err)
    detail = err or (text[:300] if not ok else "")
    return Probe(suite, path, status, ms, ok, detail)


def main():
    print(f"RESILIENCE BENCHMARK -> {BASE_URL}")
    print("Bounded, non-destructive burst test; no valid AI generation requests are sent.")

    items = []
    protected = ["/api/admin-health", "/api/system-incidents", "/api/admin-assistant", "/api/admin-command"]
    ai = ["/api/solve", "/api/support-ai", "/api/generate-exam", "/api/generate-flashcards"]

    # 24 concurrent reads against protected/admin surfaces. These must reject without auth.
    for i in range(24):
        endpoint = protected[i % len(protected)]
        # admin-command is intentionally removed as a live route; 404 is the expected closed-surface result.
        allowed = {404} if endpoint == "/api/admin-command" else {401, 403, 405}
        items.append(("protected-burst", endpoint, "GET", None, {}, allowed))

    # Malformed JSON probes must terminate before any AI provider call.
    malformed = b"{" + b"x" * 64
    for ep in ai:
        for _ in range(3):
            items.append(("malformed-burst", ep, "POST", malformed, {"Content-Type": "application/json"}, {400, 401, 403, 413, 415, 422, 429, 500, 502, 503, 504}))

    # Cross-origin probes must be denied before AI execution when APP_ORIGIN is configured.
    # A sanitized 503 is also a bounded/defensive outcome when the service is unavailable;
    # the benchmark separately fails on 2xx, timeouts, or sensitive-data leakage.
    bad_origin_allowed = {400, 401, 403, 405, 415, 429, 503}
    for ep in ai:
        for _ in range(2):
            items.append(("bad-origin-burst", ep, "POST", {"message": "security probe"}, {"Origin": "https://evil.example"}, bad_origin_allowed))

    # Method probes verify direct file-path bypasses remain closed after routing rewrites.
    for ep in ("/api/generate-exam.js", "/api/generate-flashcards.js", "/api/solve.js"):
        for _ in range(2):
            items.append(("method-burst", ep, "GET", None, {}, {401, 403, 404, 405}))

    started = time.perf_counter()
    with concurrent.futures.ThreadPoolExecutor(max_workers=WORKERS) as pool:
        results = list(pool.map(run_one, items))
    elapsed = int((time.perf_counter() - started) * 1000)

    probes = len(results)
    passed = sum(p.ok for p in results)
    failed = probes - passed
    lats = [p.latency_ms for p in results]
    p95 = statistics.quantiles(lats, n=20)[18] if len(lats) >= 20 else max(lats)
    by_status = {}
    for p in results:
        by_status[str(p.status)] = by_status.get(str(p.status), 0) + 1

    print(f"RESULT: {passed}/{probes} PASS | {failed} FAIL")
    print(f"Burst wall time: {elapsed}ms | avg={statistics.mean(lats):.0f}ms p95={p95:.0f}ms")
    print("Statuses:", ", ".join(f"{k}={v}" for k, v in sorted(by_status.items())))
    for p in results:
        if not p.ok:
            print(f"FAIL {p.suite} {p.endpoint} status={p.status} latency={p.latency_ms}ms detail={p.detail[:300]}")

    with open("resilience-benchmark-results.json", "w", encoding="utf-8") as fh:
        json.dump({
            "base_url": BASE_URL,
            "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "summary": {"total": probes, "passed": passed, "failed": failed, "workers": WORKERS, "wall_time_ms": elapsed, "avg_ms": round(statistics.mean(lats), 1), "p95_ms": round(p95, 1)},
            "statuses": by_status,
            "probes": [asdict(p) for p in results],
        }, fh, ensure_ascii=False, indent=2)

    raise SystemExit(1 if failed else 0)


if __name__ == "__main__":
    main()
