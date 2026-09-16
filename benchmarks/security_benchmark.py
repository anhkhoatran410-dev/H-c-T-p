#!/usr/bin/env python3
"""Non-destructive black-box security benchmark for Study TH.

Usage:
  BASE_URL=https://hoc-va-choi.vercel.app python benchmarks/security_benchmark.py

The suite intentionally avoids credential guessing, destructive requests, data
mutation and exploit payloads. It checks authentication boundaries, method
handling, rate-limit behavior, response leakage, security headers and a small
set of oversized/malformed inputs against the project's own API.
"""
from __future__ import annotations

import json
import os
import re
import statistics
import sys
import time
import urllib.error
import urllib.request
from dataclasses import asdict, dataclass
from typing import Any

BASE_URL = os.environ.get("BASE_URL", "https://hoc-va-choi.vercel.app").rstrip("/")
TIMEOUT = int(os.environ.get("SECURITY_TIMEOUT", "20"))
MAX_BODY_SAMPLE = 1200

ADMIN_ENDPOINTS = (
    "/api/admin-assistant",
    "/api/admin-command",
    "/api/admin-tools",
    "/api/maintenance",
    "/api/system-control",
)
PUBLIC_ENDPOINTS = (
    "/api/solve",
    "/api/support-ai",
    "/api/generate-exam",
    "/api/generate-exam-multi",
    "/api/generate-flashcards",
    "/api/review-wrong",
)
SENSITIVE_WORDS = re.compile(
    r"(?i)(stack trace|traceback|node_modules|/home/|/app/|secret|service_role|"
    r"private[_-]?key|authorization|access[_-]?token|gemini[_-]?api|google[_-]?api)"
)

@dataclass
class Finding:
    name: str
    status: str
    endpoint: str
    expected: str
    observed: str
    latency_ms: int
    detail: str = ""


def request(path: str, method: str = "GET", payload: Any = None, headers: dict[str, str] | None = None):
    body = None
    req_headers = {"User-Agent": "study-th-security-benchmark/1.0", "Accept": "application/json, text/plain;q=0.8"}
    if headers:
        req_headers.update(headers)
    if payload is not None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        req_headers["Content-Type"] = "application/json"
    req = urllib.request.Request(BASE_URL + path, data=body, headers=req_headers, method=method)
    started = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            raw = resp.read(MAX_BODY_SAMPLE + 1)
            return resp.status, dict(resp.headers.items()), raw.decode("utf-8", "replace"), int((time.perf_counter() - started) * 1000)
    except urllib.error.HTTPError as exc:
        raw = exc.read(MAX_BODY_SAMPLE + 1)
        return exc.code, dict(exc.headers.items()), raw.decode("utf-8", "replace"), int((time.perf_counter() - started) * 1000)
    except Exception as exc:
        return 0, {}, "", int((time.perf_counter() - started) * 1000), repr(exc)


def result(name, endpoint, expected, observed, latency, ok, detail=""):
    return Finding(name, "PASS" if ok else "FAIL", endpoint, expected, observed, latency, detail)


def run_method_and_auth_tests() -> list[Finding]:
    out: list[Finding] = []
    for ep in ADMIN_ENDPOINTS:
        status, headers, text, ms, *rest = request(ep, "GET")
        out.append(result("admin-get-block", ep, "405/401/403", str(status), ms, status in {401, 403, 405}, text[:240]))

        status, headers, text, ms, *rest = request(ep, "POST", {"probe": "security-benchmark", "value": "no-op"})
        leaked = bool(SENSITIVE_WORDS.search(text))
        out.append(result("admin-post-no-auth", ep, "401 or 403", str(status), ms, status in {401, 403} and not leaked, "response leaked sensitive wording" if leaked else text[:240]))

        status, headers, text, ms, *rest = request(ep, "POST", {"probe": "security-benchmark"}, {"Authorization": "Bearer invalid.invalid"})
        leaked = bool(SENSITIVE_WORDS.search(text))
        out.append(result("admin-invalid-token", ep, "401 or 403", str(status), ms, status in {401, 403} and not leaked, text[:240]))
    return out


def run_error_surface_tests() -> list[Finding]:
    out: list[Finding] = []
    malformed = "{" + "x" * 64
    oversized = {"message": "A" * 256_000, "subject": "Toán", "history": []}
    for ep in ("/api/solve", "/api/support-ai", "/api/generate-exam", "/api/generate-flashcards"):
        status, headers, text, ms, *rest = request(ep, "POST", malformed, {"Content-Type": "application/json"})
        leaked = bool(SENSITIVE_WORDS.search(text))
        stable = status < 600 and status not in {502, 503, 504}
        out.append(result("malformed-json", ep, "handled 4xx without sensitive leak", str(status), ms, stable and not leaked, text[:240]))

        status, headers, text, ms, *rest = request(ep, "POST", oversized)
        leaked = bool(SENSITIVE_WORDS.search(text))
        stable = status in {400, 413, 422, 429} or (200 <= status < 300)
        out.append(result("oversized-body", ep, "4xx limit or clean handling", str(status), ms, stable and not leaked, text[:240]))
    return out


def run_header_tests() -> list[Finding]:
    out: list[Finding] = []
    status, headers, text, ms, *rest = request("/", "GET")
    normalized = {k.lower(): v for k, v in headers.items()}
    checks = {
        "content-type": "content-type" in normalized,
        "x-content-type-options": normalized.get("x-content-type-options", "").lower() == "nosniff",
        "referrer-policy": bool(normalized.get("referrer-policy")),
        "cache-control-sensitive": "no-store" in normalized.get("cache-control", "").lower() or "no-cache" in normalized.get("cache-control", "").lower(),
    }
    for key, ok in checks.items():
        out.append(result("security-header:" + key, "/", "present/safe", normalized.get(key, "<missing>"), ms, ok))
    return out


def run_rate_limit_test() -> list[Finding]:
    out: list[Finding] = []
    # Use a synthetic forwarded address so the test does not deliberately lock
    # out the browser/operator's real address. The endpoint under test uses
    # x-forwarded-for for its in-memory counter.
    synthetic_ip = "198.51.100.77"
    statuses = []
    for i in range(10):
        status, headers, text, ms, *rest = request(
            "/api/admin-login",
            "POST",
            {"password": "security-benchmark-invalid"},
            {"X-Forwarded-For": synthetic_ip},
        )
        statuses.append(status)
    limited = any(s == 429 for s in statuses[8:])
    out.append(result("admin-rate-limit", "/api/admin-login", "429 after threshold", ",".join(map(str, statuses)), 0, limited,
                      "Expected a 429 in the later attempts; invalid password itself is intentionally never a real credential."))
    return out


def run_static_secret_scan() -> list[Finding]:
    # Scan a checked-out working tree when the benchmark is run locally/CI.
    roots = ("api", "*.js", "*.ts", "*.mjs", "*.cjs", ".github")
    files: list[str] = []
    for root in roots:
        if root.startswith("."):
            if os.path.isdir(root):
                for base, dirs, names in os.walk(root):
                    for name in names:
                        if name.endswith((".yml", ".yaml", ".js", ".ts", ".mjs", ".cjs")):
                            files.append(os.path.join(base, name))
        elif os.path.isdir(root):
            for base, dirs, names in os.walk(root):
                for name in names:
                    if name.endswith((".js", ".ts", ".mjs", ".cjs")):
                        files.append(os.path.join(base, name))
        elif os.path.isfile(root):
            files.append(root)
    patterns = [
        re.compile(r"(?i)(api[_-]?key|service[_-]?role[_-]?key|admin[_-]?password|session[_-]?secret)\s*[:=]\s*['\"][^'\"]{16,}['\"]"),
        re.compile(r"AIza[0-9A-Za-z_-]{20,}"),
        re.compile(r"sk-[A-Za-z0-9]{20,}"),
    ]
    hits = []
    for path in sorted(set(files)):
        try:
            text = open(path, "r", encoding="utf-8", errors="ignore").read()
        except OSError:
            continue
        for line_no, line in enumerate(text.splitlines(), 1):
            if any(p.search(line) for p in patterns):
                hits.append(f"{path}:{line_no}")
    return [result("static-secret-scan", "repo", "no obvious hard-coded secrets", str(len(hits)), 0, not hits, ", ".join(hits[:10]))]


def main() -> int:
    print(f"SECURITY BENCHMARK -> {BASE_URL}")
    print("Non-destructive mode: no credential guessing, destructive writes, or exploit execution.")
    findings = []
    findings += run_method_and_auth_tests()
    findings += run_error_surface_tests()
    findings += run_header_tests()
    findings += run_rate_limit_test()
    findings += run_static_secret_scan()

    passed = sum(f.status == "PASS" for f in findings)
    failed = len(findings) - passed
    latencies = [f.latency_ms for f in findings if f.latency_ms > 0]
    print(f"\nRESULT: {passed}/{len(findings)} PASS | {failed} FAIL")
    if latencies:
        print(f"Latency: avg={statistics.mean(latencies):.0f}ms p95={statistics.quantiles(latencies, n=20)[18]:.0f}ms")
    for f in findings:
        marker = "✓" if f.status == "PASS" else "✗"
        print(f"{marker} {f.name:28} {f.endpoint:28} expected={f.expected:28} observed={f.observed[:40]}")
        if f.detail and f.status == "FAIL":
            print(f"    detail: {f.detail[:300]}")

    report = {
        "base_url": BASE_URL,
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "summary": {"total": len(findings), "passed": passed, "failed": failed, "pass_rate_percent": round(passed * 100 / len(findings), 2) if findings else 0},
        "findings": [asdict(f) for f in findings],
    }
    with open("security-benchmark-results.json", "w", encoding="utf-8") as fh:
        json.dump(report, fh, ensure_ascii=False, indent=2)
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
