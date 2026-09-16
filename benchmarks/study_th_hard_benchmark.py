#!/usr/bin/env python3
import concurrent.futures, json, random, re, time, urllib.request

ENDPOINT = 'https://hoc-va-choi.vercel.app/api/solve'
DATA_URL = 'https://raw.githubusercontent.com/openai/grade-school-math/master/grade_school_math/data/test.jsonl'
N_HARD = 25
N_CHALLENGE = 15
# Reliability rerun after backend retry/fallback optimization (2026-09-16).
# Keep one request in flight at a time so the benchmark measures solver reliability, not burst throttling.
WORKERS = 1
TIMEOUT = 60
RETRIES = 4
SEED = 20260916

KEYWORDS = ['remaining', 'left', 'difference', 'less than', 'more than', 'before', 'after', 'unless', 'except', 'not', 'each', 'per', 'total', 'average', 'twice', 'percent', 'percentage', 'ratio', 'probability']

def load_rows():
    with urllib.request.urlopen(DATA_URL, timeout=30) as r:
        return [json.loads(x) for x in r.read().decode().splitlines() if x.strip()]

def norm(s):
    s = str(s).replace(',', '').strip()
    try:
        v = float(s)
        return str(int(v)) if v.is_integer() else str(v).rstrip('0').rstrip('.')
    except Exception:
        return s

def gold(solution):
    m = re.search(r"####\s*([-+]?\d[\d,]*(?:\.\d+)?)\s*$", solution.strip())
    return norm(m.group(1)) if m else None

def pred(text):
    m = re.findall(r"FINAL_ANSWER\s*:\s*([-+]?\d[\d,]*(?:\.\d+)?)", text, flags=re.I)
    return norm(m[-1]) if m else None

def hard_key(item):
    return (len(item.get('answer','')), len(item.get('question','')))

def challenge_key(item):
    q = item['question'].lower()
    hits = sum(q.count(k) for k in KEYWORDS)
    return (hits, len(item.get('answer','')), len(q))

def select(rows):
    rnd = random.Random(SEED); rows = list(rows); rnd.shuffle(rows)
    hard = sorted(rows, key=hard_key, reverse=True)
    chosen_hard = hard[:N_HARD]; used = {x['question'] for x in chosen_hard}
    rest = [x for x in rows if x['question'] not in used]
    chosen_challenge = sorted(rest, key=challenge_key, reverse=True)[:N_CHALLENGE]
    return [{'group':'HARD',**x} for x in chosen_hard] + [{'group':'CHALLENGE',**x} for x in chosen_challenge]

def call(item):
    prompt = item['question'] + "\n\nGiải cẩn thận từ dữ kiện đến kết luận. Cuối câu trả lời ghi đúng một dòng: FINAL_ANSWER: <số>"
    payload = json.dumps({'message':prompt,'subject':'Toán','history':[],'imageDataUrl':'','deep':False}).encode()
    last = None
    started = time.time()
    for attempt in range(RETRIES + 1):
        req_start = time.time()
        req=urllib.request.Request(ENDPOINT,data=payload,headers={'Content-Type':'application/json'})
        try:
            with urllib.request.urlopen(req,timeout=TIMEOUT) as r:
                d=json.loads(r.read().decode()); text=str(d.get('answer',''))
                return {'ok':True,'latency':time.time()-req_start,'total_latency':time.time()-started,'attempts':attempt+1,'pred':pred(text),'gold':gold(item['answer']),'model':d.get('model'),'group':item['group'],'question':item['question'],'text':text[:1800]}
        except Exception as e:
            last=repr(e)
            if attempt < RETRIES:
                time.sleep(min(8, 1.5*(attempt+1)))
    return {'ok':False,'latency':time.time()-started,'total_latency':time.time()-started,'attempts':RETRIES+1,'error':last,'gold':gold(item['answer']),'group':item['group'],'question':item['question']}

def stat(rows):
    graded=[r for r in rows if r.get('gold') is not None and r.get('pred') is not None]
    passed=sum(r['pred']==r['gold'] for r in graded)
    http=sum(bool(r.get('ok')) for r in rows)
    return {'total':len(rows),'graded':len(graded),'passed':passed,'accuracy_percent':round(100*passed/len(graded),2) if graded else 0,'http_ok':http,'http_ok_percent':round(100*http/len(rows),2) if rows else 0}

def main():
    items=select(load_rows()); results=[]
    with concurrent.futures.ThreadPoolExecutor(max_workers=WORKERS) as ex:
        futures=[ex.submit(call,x) for x in items]
        for i,f in enumerate(futures,1):
            r=f.result(); r['i']=i; results.append(r)
            status='PASS' if r.get('pred')==r.get('gold') else ('NO_ANSWER' if not r.get('pred') else 'FAIL')
            print(f"[{i}/{len(items)}] {status} {r.get('group')} {r.get('latency',0):.1f}s attempts={r.get('attempts')} model={r.get('model')}")
    summary={'endpoint':ENDPOINT,'benchmark':'STUDY TH hard + challenge','selection':{'hard':N_HARD,'challenge':N_CHALLENGE},'overall':stat(results),'hard':stat([r for r in results if r.get('group')=='HARD']),'challenge':stat([r for r in results if r.get('group')=='CHALLENGE']),'avg_latency_sec':round(sum(r.get('total_latency',r.get('latency',0)) for r in results)/len(results),2) if results else 0,'results':results}
    print(json.dumps({k:v for k,v in summary.items() if k!='results'},ensure_ascii=False,indent=2))
    with open('benchmark-hard-results.json','w',encoding='utf-8') as f: json.dump(summary,f,ensure_ascii=False,indent=2)

if __name__=='__main__': main()
