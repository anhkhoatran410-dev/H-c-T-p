from harness import *
import json
import t_admin
def flow_student(pg):
 pg.goto(BASE_URL+'/')
 pg.wait_for_selector('#fxName',timeout=20000)
 pg.fill('#fxName','Student Example')
 pg.fill('#fxCode','670943')
 pg.click('#fxAuthSubmit')
 pg.wait_for_timeout(800)
 if not pg.locator('body').inner_text(): raise AssertionError('Student page is blank')
 return {'student_page':True}
def flow_register(pg):
 pg.goto(BASE_URL+'/')
 pg.wait_for_selector('#fxName',timeout=15000)
 pg.click('[data-auth-mode="register"]')
 pg.fill('#fxName','New Student')
 pg.fill('#fxEmail','new-student@example.com')
 pg.fill('#fxPassword','ExamplePass123')
 pg.click('#fxAuthSubmit')
 pg.wait_for_selector('.fx-register-success',timeout=10000)
 if pg.locator('#fxCreatedStudentCode').count(): raise AssertionError('Code visible before email confirmation')
 if pg.evaluate("window.__MOCK__.calls.some(c=>c.rpc==='get_registration_code')"): raise AssertionError('Code RPC called before confirmation')
 return {'pending_confirmation':True,'code_hidden':True}
def flow_confirmed(pg):
 pg.goto(BASE_URL+'/?email_confirmed=1#access_token=mock&type=signup')
 pg.wait_for_timeout(2500)
 if not pg.locator('#fxCreatedStudentCode').count():
  panel=pg.locator('.fx-register-success')
  detail=panel.inner_text() if panel.count() else pg.locator('body').inner_text()
  raise AssertionError('Confirmation code did not render. UI says: '+detail[:500].replace('\\n',' | '))
 code=pg.locator('#fxCreatedStudentCode').inner_text()
 if len(code)!=6 or not code.isdigit(): raise AssertionError('Invalid code after confirmation: '+code)
 return {'code_after_confirmation':True}
def flow_admin(pg):
 pg.goto(BASE_URL+'/admin/')
 pg.wait_for_timeout(2000)
 if not pg.locator('body').inner_text(): raise AssertionError('Admin page is blank')
 return {'admin_page':True}
def flow_exam_attempt(pg):
 pg.goto(BASE_URL+'/')
 pg.wait_for_selector('#fxName',timeout=20000)
 pg.fill('#fxName','Student Example')
 pg.fill('#fxCode','670943')
 pg.click('#fxAuthSubmit')
 pg.wait_for_selector('.fx-stats',timeout=12000)
 pg.click('[data-nav="tests"]')
 pg.wait_for_selector('[data-exam]',timeout=12000)
 pg.locator('[data-exam]').first.click()
 pg.wait_for_selector('.fx-exam-question',timeout=12000)
 count=pg.locator('.fx-exam-question').count()
 if count<1: raise AssertionError('Exam opened with zero questions')
 for i in range(count):
  choice=pg.locator(f'[data-exam-choice-q="{i}"][data-exam-choice="{i%4}"]')
  if choice.count(): choice.first.check()
 pg.click('[data-exam-submit]')
 pg.wait_for_timeout(700)
 posts=[r for r in LOG['reqs'] if r and r[0]=='API' and r[1]=='POST' and r[2]=='/api/attempts?route=submit']
 if not posts: raise AssertionError('Submitting an exam did not call POST /api/attempts?route=submit')
 direct=pg.evaluate("window.__MOCK__.calls.some(c=>c.t==='user_attempts' && c.op==='insert')")
 if direct: raise AssertionError('Client bypassed /api/submit-attempt and wrote user_attempts directly')
 if not pg.locator('#app').inner_text().strip(): raise AssertionError('App is blank after exam submission')
 return {'questions':count,'submit_api_called':True,'direct_attempt_insert':False}
failed=[]
for name,fn in [('student',flow_student),('exam_attempt',flow_exam_attempt),('register',flow_register),('confirmed',flow_confirmed),('admin',flow_admin),('admin_support',t_admin.flow)]:
 LOG['reqs'].clear();LOG['console'].clear()
 try:
  out={};run(lambda pg:out.update(fn(pg)))
  page_errors=[entry for entry in LOG['console'] if entry and entry[0]=='PAGEERROR']
  if page_errors: raise AssertionError('Uncaught browser page error(s): '+repr(page_errors[:3]))
  print(name,'PASS',json.dumps(out,ensure_ascii=False))
 except Exception as e:
  failed.append(name);print(name,'FAIL',str(e)[:500].replace('\\n',' '))
  page_errors=[entry for entry in LOG['console'] if entry and entry[0]=='PAGEERROR']
  if page_errors: print('page errors',json.dumps(page_errors[:3],ensure_ascii=False))
 if any(x[0]=='PAGEERROR' for x in LOG['console']):print('page errors',LOG['console'][:3])
if failed: raise SystemExit('Failed: '+', '.join(failed))
