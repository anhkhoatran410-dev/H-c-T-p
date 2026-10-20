from harness import *
import json
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
 pg.wait_for_selector('#fxCreatedStudentCode',timeout=15000)
 code=pg.locator('#fxCreatedStudentCode').inner_text()
 if len(code)!=6 or not code.isdigit(): raise AssertionError('Invalid code after confirmation')
 return {'code_after_confirmation':True}
def flow_admin(pg):
 pg.goto(BASE_URL+'/admin/')
 pg.wait_for_timeout(2000)
 if not pg.locator('body').inner_text(): raise AssertionError('Admin page is blank')
 return {'admin_page':True}
failed=[]
for name,fn in [('student',flow_student),('register',flow_register),('confirmed',flow_confirmed),('admin',flow_admin)]:
 LOG['reqs'].clear();LOG['console'].clear()
 try:
  out={};run(lambda pg:out.update(fn(pg)));print(name,'PASS',json.dumps(out,ensure_ascii=False))
 except Exception as e:
  failed.append(name);print(name,'FAIL',str(e)[:300])
 if any(x[0]=='PAGEERROR' for x in LOG['console']):print('page errors',LOG['console'][:3])
if failed: raise SystemExit('Failed: '+', '.join(failed))
