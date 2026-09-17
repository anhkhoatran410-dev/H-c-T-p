#!/usr/bin/env python3
"""Non-destructive black-box security regression suite for Study TH."""
from __future__ import annotations
import json, os, re, statistics, time, urllib.error, urllib.request
from dataclasses import asdict, dataclass
from typing import Any

BASE_URL = os.environ.get("BASE_URL", "https://hoc-va-choi.vercel.app").rstrip("/")
TIMEOUT = int(os.environ.get("SECURITY_TIMEOUT", "20"))
MAX_SAMPLE = 1200
SENSITIVE = re.compile(r"(?i)(stack trace|traceback|node_modules|/home/|/app/|service_role|private[_-]?key|access[_-]?token|gemini[_-]?api|google[_-]?api)")

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
    h = {"User-Agent": "study-th-security-benchmark/2.2", "Accept": "application/json, text/plain;q=0.8"}
    if headers: h.update(headers)
    if payload is not None:
        body = payload if isinstance(payload, (bytes, bytearray)) else json.dumps(payload, ensure_ascii=False).encode()
        h.setdefault("Content-Type", "application/json")
    req = urllib.request.Request(BASE_URL + path, data=body, headers=h, method=method)
    start = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            raw = r.read(MAX_SAMPLE + 1)
            return r.status, dict(r.headers.items()), raw.decode("utf-8", "replace"), int((time.perf_counter() - start) * 1000)
    except urllib.error.HTTPError as e:
        raw = e.read(MAX_SAMPLE + 1)
        return e.code, dict(e.headers.items()), raw.decode("utf-8", "replace"), int((time.perf_counter() - start) * 1000)
    except Exception as e:
        return 0, {}, "", int((time.perf_counter() - start) * 1000), repr(e)

def add(out, name, endpoint, expected, observed, ms, ok, detail=""):
    out.append(Finding(name, "PASS" if ok else "FAIL", endpoint, expected, observed, ms, detail))

def auth_tests():
    out = []
    get_protected = ("/api/admin-assistant", "/api/admin-command")
    post_protected = ("/api/admin-assistant", "/api/admin-command", "/api/admin-delete-exam", "/api/admin-delete-exams-bulk", "/api/admin-update-exam", "/api/maintenance")
    for ep in get_protected:
        s, _, t, ms, *_ = request(ep, "GET")
        add(out, "protected-get", ep, "405/401/403", str(s), ms, s in {401,403,405}, t[:240])
    for ep in ("/api/admin-health", "/api/system-incidents"):
        s, _, t, ms, *_ = request(ep, "GET")
        add(out, "protected-get", ep, "401/403", str(s), ms, s in {401,403} and not SENSITIVE.search(t), t[:240])
    for ep in post_protected:
        for label, hdrs in (("no-auth", {}), ("invalid-token", {"Authorization":"Bearer invalid.invalid"})):
            s, _, t, ms, *_ = request(ep, "POST", {"probe":"security-regression"}, hdrs)
            add(out, f"protected-post-{label}", ep, "401/403", str(s), ms, s in {401,403} and not SENSITIVE.search(t), t[:240])
    for ep in ("/api/system-control", "/api/maintenance"):
        s, _, t, ms, *_ = request(ep, "GET")
        add(out, "public-state-read", ep, "2xx", str(s), ms, 200 <= s < 300 and not SENSITIVE.search(t), t[:240])
    return out

def input_tests():
    out = []
    malformed = b"{" + b"x" * 64
    endpoints = ("/api/solve", "/api/support-ai", "/api/generate-exam", "/api/generate-flashcards")
    for ep in endpoints:
        s, _, t, ms, *_ = request(ep, "POST", malformed, {"Content-Type":"application/json"})
        ok = s in {400,401,403,413,422,429} or (s == 500 and not SENSITIVE.search(t))
        add(out, "malformed-json", ep, "4xx or sanitized 5xx", str(s), ms, ok, t[:240])
        if ep == "/api/solve":
            payload, expected = {"message":"A" * 1_250_000,"subject":"Toán","history":[]}, {400,413,422,429}
        elif ep == "/api/support-ai":
            payload, expected = {"message":"A" * 1_050_000,"subject":"","history":[]}, {400,413,422,429}
        elif ep == "/api/generate-exam":
            payload, expected = {"documentText":"A" * 500_000,"types":["mcq"]}, {400,413,422,429}
        else:
            payload, expected = {"documentText":"A" * 500_000,"sourceFiles":["test.txt"],"sourceUrls":["https://example.invalid/test.txt"]}, {400,413,422,429}
        s, _, t, ms, *_ = request(ep, "POST", payload)
        add(out, "large-input-handling", ep, "clean bounded response", str(s), ms, s in expected and not SENSITIVE.search(t), t[:240])
    return out

def header_tests():
    out = []
    s, h, _, ms, *_ = request("/", "GET")
    nh = {k.lower():v for k,v in h.items()}
    add(out, "header-content-type", "/", "present", nh.get("content-type","<missing>"), ms, bool(nh.get("content-type")))
    add(out, "header-nosniff", "/", "nosniff", nh.get("x-content-type-options","<missing>"), ms, nh.get("x-content-type-options","").lower() == "nosniff")
    add(out, "header-referrer-policy", "/", "present", nh.get("referrer-policy","<missing>"), ms, bool(nh.get("referrer-policy")))
    s, h, _, ms, *_ = request("/api/admin-assistant", "GET")
    nh = {k.lower():v for k,v in h.items()}
    cc = nh.get("cache-control","").lower()
    add(out, "header-api-cache-control", "/api/admin-assistant", "no-store/no-cache", nh.get("cache-control","<missing>"), ms, "no-store" in cc or "no-cache" in cc)
    return out

def rate_limit_test():
    out = []
    synthetic_ip = "198.51.100.77"
    statuses = []
    for _ in range(10):
        s, _, _, _, *_ = request("/api/admin-login", "POST", {"password":"security-benchmark-invalid"}, {"X-Forwarded-For":synthetic_ip})
        statuses.append(s)
    add(out, "admin-rate-limit", "/api/admin-login", "429 after threshold", ",".join(map(str,statuses)), 0, any(s == 429 for s in statuses[8:]))
    return out

def static_secret_scan():
    patterns = [
        re.compile(r"(?i)(api[_-]?key|service[_-]?role[_-]?key|admin[_-]?password|session[_-]?secret)\s*[:=]\s*['\"][^'\"]{16,}['\"]"),
        re.compile(r"AIza[0-9A-Za-z_-]{20,}"),
        re.compile(r"sk-[A-Za-z0-9]{20,}"),
    ]
    hits = []
    for root, _, files in os.walk("."):
        if any(skip in root.replace('\\','/') for skip in ("/.git", "/node_modules")): continue
        for name in files:
            if not name.endswith((".js",".ts",".mjs",".cjs",".yml",".yaml")): continue
            path = os.path.join(root, name)
            try: text = open(path, encoding="utf-8", errors="ignore").read()
            except OSError: continue
            for n, line in enumerate(text.splitlines(), 1):
                if any(p.search(line) for p in patterns): hits.append(f"{path}:{n}")
    return [Finding("static-secret-scan", "PASS" if not hits else "FAIL", "repo", "no obvious hard-coded secrets", str(len(hits)), 0, ", ".join(hits[:10]))]

def main():
    print(f"SECURITY BENCHMARK -> {BASE_URL}")
    print("Non-destructive regression mode.")
    findings = auth_tests() + input_tests() + header_tests() + rate_limit_test() + static_secret_scan()
    passed = sum(f.status == "PASS" for f in findings)
    failed = len(findings) - passed
    lats = [f.latency_ms for f in findings if f.latency_ms]
    print(f"\nRESULT: {passed}/{len(findings)} PASS | {failed} FAIL")
    if lats: print(f"Latency: avg={statistics.mean(lats):.0f}ms p95={statistics.quantiles(lats, n=20)[18]:.0f}ms")
    for f in findings:
        mark = "✓" if f.status == "PASS" else "✗"
        print(f"{mark} {f.name:28} {f.endpoint:30} expected={f.expected:28} observed={f.observed[:40]}")
        if f.detail and f.status == "FAIL": print(f"    detail: {f.detail[:300]}")
    with open("security-benchmark-results.json", "w", encoding="utf-8") as fh:
        json.dump({"base_url":BASE_URL,"generated_at":time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),"summary":{"total":len(findings),"passed":passed,"failed":failed},"findings":[asdict(f) for f in findings]}, fh, ensure_ascii=False, indent=2)
    raise SystemExit(1 if failed else 0)

if __name__ == "__main__": main()
