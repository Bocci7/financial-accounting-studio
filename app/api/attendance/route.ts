import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../chatgpt-auth';
export const dynamic='force-dynamic';
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const clean=(v:unknown,max=100)=>typeof v==='string'?v.trim().slice(0,max):'';
async function sign(secret:string,tick:number){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);const signature=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(String(tick)));return tick+'.'+Array.from(new Uint8Array(signature)).map(b=>b.toString(16).padStart(2,'0')).join('');}
async function valid(secret:string,token:string){const tick=Number(token.split('.')[0]),now=Math.floor(Date.now()/30000);return Number.isInteger(tick)&&tick<=now&&tick>=now-1&&token===await sign(secret,tick);}
type Session={id:string;owner_id:string;title:string;group_name:string;secret:string;created_at:number;expires_at:number;closed:number};
const safe=(s:Session)=>({id:s.id,title:s.title,groupName:s.group_name,createdAt:s.created_at,expiresAt:s.expires_at,closed:!!s.closed});
export async function GET(request:Request){
 try{
 const user=await getChatGPTUser();if(!user)return json({error:'Sign in with ChatGPT to continue.'},401);
 if(!env.DB)return json({error:'Attendance database is not connected.'},503);
 const url=new URL(request.url),action=url.searchParams.get('action'),id=url.searchParams.get('id')||'';
 if(action==='list'){const {results}=await env.DB.prepare('SELECT id,title,group_name,created_at,expires_at,closed,(SELECT COUNT(*) FROM attendance a WHERE a.session_id=s.id) AS count FROM sessions s WHERE owner_id=? ORDER BY created_at DESC LIMIT 100').bind(user.userId).all();return json({sessions:results});}
 const session=await env.DB.prepare('SELECT * FROM sessions WHERE id=?').bind(id).first<Session>();
 if(!session)return json({error:'Class session not found.'},404);
 if(action==='join'){if(session.closed||session.expires_at<Date.now())return json({error:'Attendance is closed.'},410);if(!await valid(session.secret,url.searchParams.get('token')||''))return json({error:'QR code expired. Scan the current code on the teacher’s screen.'},410);return json({session:safe(session)});}
 if(session.owner_id!==user.userId)return json({error:'Only the teacher who created this class can view its records.'},403);
 const {results}=await env.DB.prepare('SELECT student_id,name,group_name,checked_at FROM attendance WHERE session_id=? ORDER BY checked_at').bind(id).all();
 return json({session:safe(session),records:results,token:await sign(session.secret,Math.floor(Date.now()/30000))});
 }catch(e){console.error('Attendance GET failed',e);return json({error:'Could not load attendance. Please retry.'},500);}
}
export async function POST(request:Request){
 try{
 const user=await getChatGPTUser();if(!user)return json({error:'Sign in with ChatGPT to continue.'},401);
 if(!env.DB)return json({error:'Attendance database is not connected.'},503);
 if(Number(request.headers.get('content-length')||0)>10000)return json({error:'Request too large.'},413);
 const raw=await request.text();if(raw.length>10000)return json({error:'Request too large.'},413);const parsed:unknown=JSON.parse(raw);if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))return json({error:'Invalid request.'},400);const body=parsed as Record<string,unknown>,action=body.action;
 if(action==='create'){
 const title=clean(body.title),group=clean(body.groupName,60),duration=Number(body.duration);
 if(!title||!group||![10,30,60,120].includes(duration))return json({error:'Enter a class title, group and a valid duration.'},400);
 const recent=await env.DB.prepare('SELECT COUNT(*) AS n FROM sessions WHERE owner_id=? AND created_at>?').bind(user.userId,Date.now()-3600000).first<{n:number}>();if((recent?.n||0)>=20)return json({error:'Class creation limit reached. Try again later.'},429);
 const id=crypto.randomUUID(),secret=crypto.randomUUID()+crypto.randomUUID(),now=Date.now();
 await env.DB.prepare('INSERT INTO sessions(id,owner_id,title,group_name,secret,created_at,expires_at,closed) VALUES(?,?,?,?,?,?,?,0)').bind(id,user.userId,title,group,secret,now,now+duration*60000).run();
 return json({id},201);
 }
 const id=clean(body.id),s=await env.DB.prepare('SELECT * FROM sessions WHERE id=?').bind(id).first<Session>();
 if(!s)return json({error:'Class session not found.'},404);
 if(action==='close'){if(s.owner_id!==user.userId)return json({error:'Not authorized.'},403);await env.DB.prepare('UPDATE sessions SET closed=1 WHERE id=? AND owner_id=?').bind(id,user.userId).run();return json({ok:true});}
 if(action!=='checkin')return json({error:'Unknown action.'},400);
 if(s.closed||s.expires_at<Date.now())return json({error:'Attendance is closed.'},410);
 if(!await valid(s.secret,clean(body.token,200)))return json({error:'QR expired. Scan the current code on the teacher’s screen.'},410);
 const name=clean(body.name),studentId=clean(body.studentId,40).toUpperCase();
 if(name.length<2||!/^[-A-Z0-9_]{2,40}$/.test(studentId))return json({error:'Enter your full name and student ID (letters, numbers, hyphen or underscore).'},400);
 try{
 const result=await env.DB.prepare('INSERT INTO attendance(id,session_id,user_id,student_id,name,group_name,checked_at) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM sessions WHERE id=? AND closed=0 AND expires_at>?)').bind(crypto.randomUUID(),id,user.userId,studentId,name,s.group_name,Date.now(),id,Date.now()).run();
 if(!result.meta.changes)return json({error:'Attendance has closed.'},410);
 }catch(e){if(String(e).includes('UNIQUE'))return json({error:'This student ID or account has already checked in.'},409);throw e;}
 return json({ok:true,title:s.title,checkedAt:Date.now()},201);
 }catch(e){console.error('Attendance POST failed',e);return json({error:'Could not save attendance. Please retry.'},500);}
}
