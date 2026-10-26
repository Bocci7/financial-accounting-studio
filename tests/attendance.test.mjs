import test from 'node:test';import assert from 'node:assert/strict';
const base=process.env.TEST_BASE_URL;
test('attendance create → signed check-in → duplicate → persistent record → closed session',{skip:!base},async()=>{
 const u=new URL(base);assert.ok(['localhost','127.0.0.1'].includes(u.hostname),'This fixture must only run against a local test server.');
 const auth=await fetch(base+'/signin-with-chatgpt?return_to=/',{redirect:'manual'}),cookie=auth.headers.get('set-cookie').split(';')[0];
 const url=base+'/api/attendance';
 const post=async body=>{const r=await fetch(url,{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify(body)});return{status:r.status,data:await r.json()};};
 assert.equal((await fetch(url+'?action=list')).status,401);
 const c=await post({action:'create',title:'Automated QA session',groupName:'QA',duration:10});assert.equal(c.status,201);
 const id=c.data.id;const details=()=>fetch(url+'?id='+id,{headers:{Cookie:cookie}}).then(r=>r.json());
 let d=await details();assert.equal(d.records.length,0);
 assert.equal((await post({action:'checkin',id,token:'invalid',name:'QA Student',studentId:'QA-001'})).status,410);
 assert.equal((await post({action:'checkin',id,token:d.token,name:'QA Student',studentId:'QA-001'})).status,201);
 assert.equal((await post({action:'checkin',id,token:d.token,name:'QA Student',studentId:'QA-001'})).status,409);
 d=await details();assert.equal(d.records.length,1);assert.equal(d.records[0].student_id,'QA-001');
 assert.equal((await post({action:'close',id})).status,200);
 assert.equal((await post({action:'checkin',id,token:d.token,name:'Other Student',studentId:'QA-002'})).status,410);
});
