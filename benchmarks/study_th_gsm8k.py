#!/usr/bin/env python3
import concurrent.futures, json, random, re, time, urllib.request

ENDPOINT = 'https://hoc-va-choi.vercel.app/api/solve'
DATA_URL = 'https://raw.githubusercontent.com/openai/grade-school-math/master/grade_school_math/data/test.jsonl'
N = 50
WORKERS = 4
TIMEOUT = 45
SEED = 20260916


def load_data():
    with urllib.request.urlopen(DATA_URL, timeout=20) as r:
        rows = [json.loads(x) for x in r.read().decode().splitlines() if x.strip()]
    rnd = random.Random(SEED)
    rnd.shuffle(rows)
    return rows[:N]


def gold_answer(solution):
    m = re.search(r"####\s*([-+]?\d[\d,]*(?:\.\d+)?)\s*$", solution.strip())
    if not m:
        return None
    return normalize(m.group(1))


def normalize(s):
    s = s.replace(',', '').strip()
    try:
        v = float(s)
        if v.is_integer():
            return str(int(v))
        return str(v).rstrip('0').rstrip('.')
    except Exception:
        return s


def model_answer(text):
    m = re.findall(r"FINAL_ANSWER\s*:\s*([-+]?\d[\d,]*(?:\.\d+)?)", text, flags=re.I)
    if m:
        return normalize(m[-1])
    nums = re.findall(r"[-+]?\d[\d,]*(?:\.\d+)?", text)
    return normalize(nums[-1]) if nums else None


def call(item):
    prompt = item['question'] + "\n\nĐây là benchmark chấm tự động. Giải bài cẩn thận nhưng gọn. Cuối câu trả lời bắt buộc ghi đúng một dòng: FINAL_ANSWER: <số>"
    payload = json.dumps({'message': prompt, 'subject': 'Toán', 'history': [], 'imageDataUrl': '', 'deep': False}).encode()
    req = urllib.request.Request(ENDPOINT, data=payload, headers={'Content-Type': 'application/json'})
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            d = json.loads(r.read().decode())
            text = str(d.get('answer', ''))
            return {'ok': True, 'latency': time.time()-t0, 'pred': model_answer(text), 'gold': gold_answer(item['answer']), 'model': d.get('model'), 'text': text[:1200]}
    except Exception as e:
        return {'ok': False, 'latency': time.time()-t0, 'error': repr(e), 'gold': gold_answer(item['answer'])}


def main():
    items = load_data()
    results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=WORKERS) as ex:
        futs = [ex.submit(call, x) for x in items]
        for i, f in enumerate(futs, 1):
            r = f.result(); r['i'] = i; results.append(r)
            print(f"[{i}/{len(items)}] {'PASS' if r.get('pred') == r.get('gold') else 'FAIL'} {r.get('latency', 0):.1f}s model={r.get('model')}")
    graded = [r for r in results if r.get('gold') is not None and r.get('pred') is not None]
    passed = sum(r['pred'] == r['gold'] for r in graded)
    print(f"\nSCORE={passed}/{len(graded)} = {(100*passed/len(graded)) if graded else 0:.2f}%")
    print(f"HTTP_OK={sum(r.get('ok') for r in results)}/{len(results)}")
    with open('benchmark-results.json', 'w', encoding='utf-8') as f:
        json.dump({'endpoint': ENDPOINT, 'n': len(results), 'graded': len(graded), 'passed': passed, 'accuracy_percent': (100*passed/len(graded)) if graded else 0, 'results': results}, f, ensure_ascii=False, indent=2)


if __name__ == '__main__':
    main()
