from harness import *
MOCK['tables']['support_threads']=[{"id":"t1","device_id":"mock-device","student_name":"Nguyễn Văn B","status":"open","updated_at":"2026-10-17T15:49:25Z","account_id":"acc1","last_message":"hi","unread_admin":1,"unread_user":0,"support_accounts":{"name":"Kỹ thuật","avatar":"🛠️"}}]
MOCK['tables']['support_messages']=[{"id":"m1","thread_id":"t1","sender":"user","message":"hi","created_at":"2026-10-17T15:49:25Z"}]
def flow(pg):
 pg.goto(BASE_URL+'/admin/');pg.wait_for_timeout(2500)
 assert pg.title()
 assert pg.locator('body').inner_text()
 return {"title":pg.title(),"body_text":pg.locator('body').inner_text()[:300]}
