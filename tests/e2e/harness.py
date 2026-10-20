import json, mimetypes, os, shutil
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright
HERE=os.path.dirname(os.path.abspath(__file__))
ROOT=os.environ.get('ROOT',os.path.abspath(os.path.join(HERE,'..','..')))
BASE_URL=os.environ.get('E2E_BASE_URL','http://study.local')
ARTIFACT_DIR=os.environ.get('E2E_ARTIFACT_DIR','/tmp/study-e2e')
os.makedirs(ARTIFACT_DIR,exist_ok=True)
def q(i,n): return {"a":i%4,"q":f"Question {n}{i}?","opts":["A1","B1","C1","D1"],"type":"mcq","front":"","back":"","answer":"","answers":[],"example":"","phonetic":"","statements":[],"explanation":"explanation"}
EXAMS=[
 {"id":"a3c85fb1","title":"Test độ nhớ · Từ Vựng Unit 1","subject":"Tiếng Anh","difficulty":"Trung bình","duration":15,"question_count":15,"status":"active","flashcard_only":False,"created_at":"2026-10-17T10:00:00Z","questions":[q(i,'x') for i in range(15)]},
 {"id":"19f916d4","title":"Từ Vựng Units 2","subject":"Tiếng Anh","difficulty":"","duration":45,"question_count":15,"status":"active","flashcard_only":False,"questions":[q(i,"y") for i in range(15)]},
 {"id":"6c43cd86","title":"Unit 4","subject":"Tiếng Anh","difficulty":"","duration":0,"question_count":3,"status":"active","flashcard_only":True,"created_at":"2026-10-15T10:00:00Z","questions":[{"back":"người dân","type":"flashcard","front":"resident","source":"Unit 4.pdf","example":"The local residents...","phonetic":"n","explanation":""},{"back":"thuộc về đô thị","type":"flashcard","front":"urban","source":"Unit 4.pdf","example":"Air pollution...","phonetic":"adj","explanation":""},{"back":"sự giải trí","type":"flashcard","front":"leisure","source":"Unit 4.pdf","example":"Make the most","phonetic":"n","explanation":""}]}
]
MOCK={"calls":[],"tables":{"exams":EXAMS,"support_accounts":[{"id":"acc1","name":"Kỹ thuật","handle":"tech","avatar":"🛠️","description":"Lỗi kỹ thuật","bot_enabled":True,"is_active":True},{"id":"acc2","name":"Hỗ trợ chung","handle":"gen","avatar":"💬","description":"Chung","bot_enabled":False,"is_active":True}],"support_threads":[],"support_messages":[],"support_bot_rules":[],"user_devices":[]},"rpc":{}}
LOG={"console":[],"reqs":[]}
def serve(route,request):
 u=urlparse(request.url);host=u.netloc;path=u.path
 if 'cdn.jsdelivr.net' in host and 'supabase' in path:return route.fulfill(status=200,content_type='application/javascript',body=open(os.path.join(HERE,'fake_supabase.js')).read())
 if host.endswith('supabase.co'):
  qs=parse_qs(u.query)
  if '/rest/v1/exams' in path:
   if request.method=='POST':
    raw=request.post_data or '{}';LOG['reqs'].append(('SUPABASE','POST',path,raw))
    try:
     payload=json.loads(raw);rows=payload if isinstance(payload,list) else [payload]
     if not rows or any(not isinstance(x,dict) for x in rows):raise ValueError('invalid payload')
     EXAMS.extend(dict(x) for x in rows)
    except (TypeError,ValueError):return route.fulfill(status=400,content_type='application/json',body='{"error":"invalid json or payload"}')
    return route.fulfill(status=201,content_type='application/json',body='[]')
   rows=[dict(e) for e in EXAMS if e.get('status')=='active']
   if qs.get('flashcard_only')==['eq.true']:rows=[e for e in rows if e.get('flashcard_only')]
   if 'id' in qs:rows=[e for e in rows if e.get('id')==qs['id'][0].replace('eq.','')]
   if 'select' in qs and 'questions' not in qs['select'][0] and qs['select'][0]!='*':rows=[{k:v for k,v in e.items() if k!='questions'} for e in rows]
   return route.fulfill(status=200,content_type='application/json',body=json.dumps(rows))
  LOG['reqs'].append(('SUPABASE',request.method,path,request.post_data or ''));return route.fulfill(status=200,content_type='application/json',body='[]')
 if host not in ('study.local','localhost','127.0.0.1'):return route.abort()
 if path.startswith('/api/'):
  LOG['reqs'].append(('API',request.method,path+('?'+u.query if u.query else '')))
  if path.startswith('/api/admin-login'):return route.fulfill(status=200,content_type='application/json',body='{"ok":true}')
  if path=='/api/attempts':return route.fulfill(status=200,content_type='application/json',body='{"attempts":[]}')
  if path=='/api/submit-attempt':return route.fulfill(status=200,content_type='application/json',body='{"ok":true,"attempt":{"id":"att1","score":60,"correct":9,"total":15,"wrong_indexes":[1,2],"created_at":"2026-10-17T15:00:00Z","exam_title":"x"}}')
  return route.fulfill(status=200,content_type='application/json',body='{}')
 fp=ROOT+(path+'index.html' if path.endswith('/') else path)
 if os.path.isfile(fp):return route.fulfill(status=200,content_type=mimetypes.guess_type(fp)[0] or 'text/plain',body=open(fp,'rb').read())
 return route.fulfill(status=404,body='not found')
def run(fn):
 with sync_playwright() as p:
  exe=os.environ.get('PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH') or shutil.which('chromium') or shutil.which('chromium-browser') or shutil.which('google-chrome')
  opts={'headless':True}
  if exe:opts['executable_path']=exe
  b=p.chromium.launch(**opts);ctx=b.new_context(viewport={'width':1280,'height':900},locale='vi-VN')
  ctx.add_init_script("window.__MOCK__="+json.dumps({"calls":[],"tables":MOCK['tables'],"rpc":{}})+";")
  ctx.add_init_script("window.__MOCK__.rpc={lookup_student_login:(a)=>({ok:true,user:{id:'u1',full_name:a.p_name,student_code:a.p_code}}),validate_preview_access:()=>false,get_registration_code:()=> '670943'};")
  ctx.route('**/*',serve);pg=ctx.new_page()
  pg.on('console',lambda m:LOG['console'].append((m.type,m.text[:220])) if m.type in ('error','warning') else None)
  pg.on('pageerror',lambda e:LOG['console'].append(('PAGEERROR',str(e)[:260])))
  try:fn(pg)
  finally:b.close()
