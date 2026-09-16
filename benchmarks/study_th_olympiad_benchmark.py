#!/usr/bin/env python3
"""STUDY TH ceiling math benchmark.

Runs a deterministic, sequential suite against the live /api/solve endpoint.
Problem statements are fetched at runtime from public source repositories; the
source datasets are not vendored into this repository.

Tiers:
- GSM8K hard-selected subset
- AIME 2025 integer-answer competition math
- OlymMATH EN-EASY
- OlymMATH EN-HARD

Proof-only olympiad problems are intentionally a separate phase because exact
numeric grading cannot measure proof validity.
"""

import csv
import json
import random
import re
import time
import urllib.request
from fractions import Fraction

ENDPOINT = "https://hoc-va-choi.vercel.app/api/solve"
TIMEOUT = 90
OUTER_RETRIES = 2
SEED = 20260916

DATA_URLS = {
    "GSM8K": "https://raw.githubusercontent.com/openai/grade-school-math/master/grade_school_math/data/test.jsonl",
    "AIME_2025": "https://raw.githubusercontent.com/UCSB-AI/Soft-Thinking/main/datasets/aime2025.json",
    "OLYMMATH_EASY": "https://raw.githubusercontent.com/RUCAIBox/OlymMATH/main/data/OlymMATH-EN-EASY.jsonl",
    "OLYMMATH_HARD": "https://raw.githubusercontent.com/RUCAIBox/OlymMATH/main/data/OlymMATH-EN-HARD.jsonl",
}

TARGETS = {"GSM8K": 20, "AIME_2025": 20, "OLYMMATH_EASY": 20, "OLYMMATH_HARD": 40}


def fetch_text(url, timeout=45):
    req = urllib.request.Request(url, headers={"User-Agent": "STUDY-TH-benchmark/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8")


def parse_numeric(s):
    if s is None:
        return None
    s = str(s).strip()
    s = re.sub(r"^FINAL_ANSWER\s*:\s*", "", s, flags=re.I).strip()
    s = s.replace("$", "").replace(",", "").strip().rstrip(".")
    s = s.replace("\\left", "").replace("\\right", "")
    m = re.fullmatch(r"\\frac\{(-?\d+)\}\{(\d+)\}", s)
    if m:
        return str(Fraction(int(m.group(1)), int(m.group(2))))
    m = re.fullmatch(r"(-?\d+)\s*/\s*(\d+)", s)
    if m:
        return str(Fraction(int(m.group(1)), int(m.group(2))))
    m = re.search(r"[-+]?\d+(?:\.\d+)?", s)
    if not m:
        return None
    token = m.group(0)
    try:
        if "." in token:
            v = float(token)
            return str(int(v)) if v.is_integer() else format(v, ".12g")
        return str(int(token))
    except Exception:
        return None


def extract_answer(text):
    matches = re.findall(r"FINAL_ANSWER\s*:\s*([^\n\r]+)", str(text or ""), flags=re.I)
    return parse_numeric(matches[-1]) if matches else None


def gsm_gold(answer):
    m = re.search(r"####\s*([-+]?\d[\d,]*(?:\.\d+)?)\s*$", str(answer).strip())
    return parse_numeric(m.group(1)) if m else None


def load_dataset(name):
    raw = fetch_text(DATA_URLS[name])
    if name == "AIME_2025":
        data = json.loads(raw)
        rows = []
        for i, item in enumerate(data):
            question = ""
            prompt = item.get("prompt", [])
            if isinstance(prompt, list):
                for part in reversed(prompt):
                    if isinstance(part, dict) and part.get("value"):
                        question = str(part["value"])
                        break
            rows.append({"id": f"AIME-2025-{i+1:02d}", "question": question,
                         "gold": parse_numeric(item.get("final_answer")), "subject": "AIME"})
        return rows

    rows = [json.loads(line) for line in raw.splitlines() if line.strip()]
    out = []
    for i, item in enumerate(rows):
        if name == "GSM8K":
            out.append({"id": f"GSM8K-{i:04d}", "question": item["question"],
                        "gold": gsm_gold(item.get("answer")), "subject": "word-problem",
                        "source_answer": item.get("answer", "")})
        else:
            out.append({"id": item.get("unique_id", f"{name}-{i:04d}"),
                        "question": item.get("problem", ""),
                        "gold": parse_numeric(item.get("answer")),
                        "subject": item.get("subject", "unknown")})
    return out


def choose_rows(name, rows):
    rnd = random.Random(SEED + sum(ord(c) for c in name))
    rows = [r for r in rows if r.get("question") and r.get("gold") is not None]
    n = TARGETS[name]
    if len(rows) <= n:
        return rows

    if name == "GSM8K":
        rows.sort(key=lambda r: (len(r.get("source_answer", "")), len(r["question"])), reverse=True)
        pool = rows[: max(n * 4, n)]
        rnd.shuffle(pool)
        return pool[:n]

    if name == "AIME_2025":
        idxs = sorted(rnd.sample(range(len(rows)), n))
        return [rows[i] for i in idxs]

    groups = {}
    for r in rows:
        groups.setdefault(r.get("subject", "unknown"), []).append(r)
    subjects = sorted(groups)
    for g in groups.values():
        rnd.shuffle(g)
    chosen = []
    while len(chosen) < n:
        progressed = False
        for subject in subjects:
            if groups[subject] and len(chosen) < n:
                chosen.append(groups[subject].pop())
                progressed = True
        if not progressed:
            break
    rnd.shuffle(chosen)
    return chosen[:n]


def call_solver(item):
    prompt = (
        "Bạn đang tham gia bài kiểm tra năng lực Toán nâng cao của STUDY TH.\n"
        "Giải bài toán hoàn toàn từ dữ kiện gốc. Với bài Olympic/AIME, ưu tiên lập luận chặt chẽ, "
        "kiểm tra các trường hợp và tự tính lại kết quả trước khi kết luận.\n"
        "Không đoán đáp án. Nếu có nhiều hướng, dùng hướng chắc chắn nhất và kiểm tra chéo.\n"
        "Cuối câu trả lời BẮT BUỘC có đúng một dòng theo mẫu: FINAL_ANSWER: <số>\n\n"
        f"Bài toán:\n{item['question']}"
    )
    payload = json.dumps({"message": prompt, "subject": "Toán Olympic", "history": [],
                          "imageDataUrl": "", "deep": True}).encode("utf-8")
    started = time.time()
    last_error = None
    for attempt in range(OUTER_RETRIES + 1):
        req_started = time.time()
        req = urllib.request.Request(ENDPOINT, data=payload,
            headers={"Content-Type": "application/json", "User-Agent": "STUDY-TH-benchmark/1.0"})
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT) as response:
                data = json.loads(response.read().decode("utf-8"))
                text = str(data.get("answer", ""))
                pred = extract_answer(text)
                return {
                    "ok": True,
                    "status": "PASS" if pred == item["gold"] else ("NO_ANSWER" if pred is None else "FAIL"),
                    "pred": pred, "gold": item["gold"], "model": data.get("model"),
                    "audit": data.get("auditVerdict"), "tool": data.get("tool"),
                    "verified": data.get("verified"), "latency_sec": round(time.time() - req_started, 3),
                    "total_latency_sec": round(time.time() - started, 3), "attempts": attempt + 1,
                    "error": None,
                }
        except Exception as exc:
            last_error = repr(exc)
            if attempt < OUTER_RETRIES:
                time.sleep(1.5 * (attempt + 1))
    return {"ok": False, "status": "HTTP_ERROR", "pred": None, "gold": item["gold"],
            "model": None, "audit": None, "tool": None, "verified": False,
            "latency_sec": round(time.time() - started, 3),
            "total_latency_sec": round(time.time() - started, 3),
            "attempts": OUTER_RETRIES + 1, "error": last_error}


def summarize(rows):
    total = len(rows)
    answered = sum(r["status"] in {"PASS", "FAIL"} for r in rows)
    passed = sum(r["status"] == "PASS" for r in rows)
    http_ok = sum(r["ok"] for r in rows)
    audits = [r for r in rows if r.get("audit")]
    latencies = sorted(r.get("total_latency_sec", 0) for r in rows)
    p95 = latencies[max(0, int(0.95 * total) - 1)] if latencies else 0
    return {
        "total": total, "answered": answered, "passed": passed,
        "accuracy_on_answered_percent": round(100 * passed / answered, 2) if answered else 0,
        "pass_rate_over_all_percent": round(100 * passed / total, 2) if total else 0,
        "http_ok": http_ok, "http_ok_percent": round(100 * http_ok / total, 2) if total else 0,
        "no_answer": sum(r["status"] == "NO_ANSWER" for r in rows),
        "http_errors": sum(r["status"] == "HTTP_ERROR" for r in rows),
        "audited": len(audits),
        "audit_pass": sum(r.get("audit") == "PASS" for r in rows),
        "audit_fail": sum(r.get("audit") == "FAIL" for r in rows),
        "audit_uncertain": sum(r.get("audit") == "UNCERTAIN" for r in rows),
        "repair_engine_used": sum("Repair Engine" in str(r.get("tool")) for r in rows),
        "avg_latency_sec": round(sum(latencies) / total, 2) if total else 0,
        "p95_latency_sec": round(p95, 2),
    }


def main():
    all_results = []
    selected_counts = {}
    for name in TARGETS:
        rows = choose_rows(name, load_dataset(name))
        selected_counts[name] = len(rows)
        print(f"Loaded {name}: selected {len(rows)}")
        for item in rows:
            result = call_solver(item)
            result.update({"id": item["id"], "tier": name, "subject": item.get("subject")})
            all_results.append(result)
            print(f"[{len(all_results)}] {name} {result['status']} pred={result.get('pred')} gold={result.get('gold')} {result.get('total_latency_sec', 0):.1f}s model={result.get('model')}")

    by_tier = {tier: summarize([r for r in all_results if r["tier"] == tier]) for tier in TARGETS}
    summary = {"benchmark": "STUDY TH Olympiad Ceiling v1", "endpoint": ENDPOINT,
               "seed": SEED, "timeout_sec": TIMEOUT, "outer_retries": OUTER_RETRIES,
               "selection": selected_counts, "overall": summarize(all_results),
               "by_tier": by_tier, "results": all_results}

    with open("benchmark-olympiad-results.json", "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)
    with open("benchmark-olympiad-results.csv", "w", encoding="utf-8", newline="") as f:
        fields = ["id", "tier", "subject", "status", "pred", "gold", "model", "audit", "tool", "verified", "total_latency_sec", "attempts", "error"]
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        for row in all_results:
            w.writerow({k: row.get(k) for k in fields})
    print(json.dumps({k: v for k, v in summary.items() if k != "results"}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
