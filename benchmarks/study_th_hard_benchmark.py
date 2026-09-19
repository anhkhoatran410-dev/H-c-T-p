#!/usr/bin/env python3
import concurrent.futures, json, os, random, re, time, urllib.request

ENDPOINT = os.getenv('SMOKE_ENDPOINT') or 'https://hoc-va-choi.vercel.app/api/solve'
SMOKE_ONLY = os.getenv('SMOKE_ONLY') == '1'
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
    payload = json.dumps({'message':prompt,'subject':item.get('subject','Toán'),'history':[],'imageDataUrl':'','deep':item.get('group') in ('VMO','OLYMPIAD')}).encode()
    last = None
    started = time.time()
    for attempt in range(RETRIES + 1):
        req_start = time.time()
        origin = ENDPOINT.split('/api/solve',1)[0]
        req=urllib.request.Request(ENDPOINT,data=payload,headers={'Content-Type':'application/json','Origin':origin})
        try:
            with urllib.request.urlopen(req,timeout=TIMEOUT) as r:
                d=json.loads(r.read().decode()); text=str(d.get('answer',''))
                stages=d.get('stages') or {}
                return {'ok':True,'latency':time.time()-req_start,'total_latency':time.time()-started,'attempts':attempt+1,'pred':pred(text),'gold':gold(item['answer']),'model':d.get('model'),'group':item['group'],'question':item['question'],'text':text[:1800],'reasoning_tier':(d.get('reasoningTier') or {}).get('tier'),'review_skipped':bool(d.get('reviewSkipped')),'cache_hit':bool(d.get('cacheHit')),'agreement_score':d.get('agreementScore'),'solver_latency_sec':float(stages.get('solverMs') or 0)/1000 if stages.get('solverMs') is not None else None,'expert_latency_sec':float(d.get('expertLatencyMs') or 0)/1000 if d.get('expertLatencyMs') is not None else None,'review_latency_sec':float(d.get('reviewLatencyMs') or 0)/1000 if d.get('reviewLatencyMs') is not None else None}
        except Exception as e:
            last=repr(e)
            if attempt < RETRIES:
                time.sleep(min(8, 1.5*(attempt+1)))
    return {'ok':False,'latency':time.time()-started,'total_latency':time.time()-started,'attempts':RETRIES+1,'error':last,'gold':gold(item['answer']),'group':item['group'],'question':item['question']}

def percentile(values,p):
    xs=sorted(float(v) for v in values if v is not None)
    return round(xs[min(len(xs)-1,max(0,int((len(xs)-1)*p)))],3) if xs else 0

def stage_metrics(rows,key):
    vals=[r.get(key) for r in rows if r.get(key) is not None]
    return {'count':len(vals),'p50_sec':percentile(vals,.50),'p95_sec':percentile(vals,.95),'avg_sec':round(sum(vals)/len(vals),3) if vals else 0}

def stat(rows):
    graded=[r for r in rows if r.get('gold') is not None and r.get('pred') is not None]
    passed=sum(r['pred']==r['gold'] for r in graded)
    http=sum(bool(r.get('ok')) for r in rows)
    return {'total':len(rows),'graded':len(graded),'passed':passed,'accuracy_percent':round(100*passed/len(graded),2) if graded else 0,'http_ok':http,'http_ok_percent':round(100*http/len(rows),2) if rows else 0,'timeouts':sum('timeout' in str(r.get('error','')).lower() for r in rows),'review_skipped':sum(bool(r.get('review_skipped')) for r in rows),'review_skipped_percent':round(100*sum(bool(r.get('review_skipped')) for r in rows)/len(rows),2) if rows else 0,'cache_hits':sum(bool(r.get('cache_hit')) for r in rows),'cache_hit_percent':round(100*sum(bool(r.get('cache_hit')) for r in rows)/len(rows),2) if rows else 0,'solver':stage_metrics(rows,'solver_latency_sec'),'expert':stage_metrics(rows,'expert_latency_sec'),'review':stage_metrics(rows,'review_latency_sec'),'latency':stage_metrics(rows,'total_latency')}

def main():
    if SMOKE_ONLY:
        items = [
            {
                'group': 'FAST',
                'question': 'Tính 2+3*4. Cuối câu trả lời ghi đúng một dòng: FINAL_ANSWER: 14',
                'answer': '#### 14'
            },
            {
                'group': 'VMO',
                'question': 'VMO: Chứng minh rằng với mọi số thực x,y,z thỏa x+y+z=0 thì x^3+y^3+z^3=3xyz. Cuối câu trả lời ghi đúng một dòng: FINAL_ANSWER: 0',
                'answer': '#### 0'
            }
        ]
        for item in items:
            item['subject'] = 'Toán Olympic' if item['group'] == 'VMO' else 'Toán'
        results=[]
        for i,item in enumerate(items,1):
            r=call(item); r['i']=i; results.append(r)
            status='PASS' if r.get('pred')==r.get('gold') else ('NO_ANSWER' if not r.get('pred') else 'FAIL')
            print(f"[SMOKE {i}/{len(items)}] {status} {r.get('group')} {r.get('latency',0):.1f}s attempts={r.get('attempts')} model={r.get('model')}")
        summary={'endpoint':ENDPOINT,'benchmark':'STUDY TH AI preview smoke','selection':{'fast':1,'vmo':1},
                 'overall':stat(results),'avg_latency_sec':round(sum(r.get('total_latency',r.get('latency',0)) for r in results)/len(results),2)}
        print(json.dumps(summary,ensure_ascii=False,indent=2))
        with open('benchmark-hard-results.json','w',encoding='utf-8') as f: json.dump(summary,f,ensure_ascii=False,indent=2)
        if summary['overall']['http_ok_percent'] < 100:
            raise SystemExit(1)
        return
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
