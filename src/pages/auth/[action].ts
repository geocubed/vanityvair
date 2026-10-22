import type {APIRoute} from 'astro';
import {env} from 'cloudflare:workers';
import {allowAttempt,newToken,passwordHash,tokenHash,verifyPassword} from '../../lib/site-auth';
export const POST:APIRoute=async({request,params,cookies})=>{
 const fail=(error:string,status=400)=>Response.json({error},{status,headers:{'Cache-Control':'no-store'}});
 if(request.headers.get('origin')!==new URL(request.url).origin)return fail('Please sign in on this website.',403);
 if(!env.AUTH_PEPPER)return fail('Sign-in is not configured yet.',503);
 let text='';const reader=request.body?.getReader();if(!reader)return fail('Please complete the form.');
 for(;;){const {done,value}=await reader.read();if(done)break;text+=new TextDecoder().decode(value);if(text.length>5000){await reader.cancel();return fail('Form too large.',413);}}
 const secure=new URL(request.url).protocol==='https:';const cookieName=secure?'__Host-vv-session':'vv-session';
 try{
  if(params.action==='logout'){
   const token=cookies.get(cookieName)?.value;
   if(token)await env.DB.prepare('DELETE FROM auth_sessions WHERE token_hash=?').bind(await tokenHash(token)).run();
   cookies.delete(cookieName,{path:'/'});return Response.json({ok:true});
  }
  const body=JSON.parse(text);const ip=request.headers.get('cf-connecting-ip')||'local';
  if(!await allowAttempt(env.DB,`ip:${ip}`,30))return fail('Too many attempts. Please wait 15 minutes.',429);
  let email='';
  if(params.action==='login'){
   email=String(body.email||'').trim().toLowerCase();
   if(!await allowAttempt(env.DB,`email:${email}`))return fail('Too many attempts. Please wait 15 minutes.',429);
   const user=await env.DB.prepare('SELECT password_hash FROM users WHERE email=? AND active=1').bind(email).first<{password_hash:string}>();
   const stored=user?.password_hash||`v1:${'0'.repeat(64)}:${'0'.repeat(64)}`;
   const valid=await verifyPassword(String(body.password||''),stored,env.AUTH_PEPPER);
   if(!user||!valid)return fail('Email or password not recognised.',401);
  }else if(params.action==='join'){
   const token=String(body.token||'');if(!/^[a-f0-9]{64}$/.test(token))return fail('This invitation has expired or has already been used.',401);
   const hash=await tokenHash(token);
   const invite=await env.DB.prepare('SELECT i.email FROM auth_invites i JOIN users u ON u.email=i.email WHERE i.token_hash=? AND i.expires_at>? AND u.active=1').bind(hash,Date.now()).first<{email:string}>();
   if(!invite)return fail('This invitation has expired or has already been used.',401);
   const password=await passwordHash(String(body.password||''),env.AUTH_PEPPER);
   const result=await env.DB.batch([
    env.DB.prepare('UPDATE users SET password_hash=? WHERE email=? AND EXISTS(SELECT 1 FROM auth_invites WHERE token_hash=? AND expires_at>?)').bind(password,invite.email,hash,Date.now()),
    env.DB.prepare('DELETE FROM auth_invites WHERE token_hash=? RETURNING email').bind(hash),
    env.DB.prepare('DELETE FROM auth_sessions WHERE email=? AND changes()>0').bind(invite.email)
   ]);
   if(!result[1].results.length)return fail('This invitation has already been used.',401);
   email=invite.email;
  }else return fail('Not found.',404);
  const token=newToken();await env.DB.prepare('INSERT INTO auth_sessions(token_hash,email,expires_at) VALUES(?,?,?)').bind(await tokenHash(token),email,Date.now()+7*86400000).run();
  cookies.set(cookieName,token,{path:'/',secure,httpOnly:true,sameSite:'lax',maxAge:7*86400});
  await env.DB.batch([env.DB.prepare('DELETE FROM auth_sessions WHERE expires_at<?').bind(Date.now()),env.DB.prepare('DELETE FROM auth_limits WHERE expires_at<?').bind(Date.now()),env.DB.prepare('DELETE FROM auth_invites WHERE expires_at<?').bind(Date.now())]);
  return Response.json({ok:true},{headers:{'Cache-Control':'no-store'}});
 }catch{return fail('Unable to sign in. Use a 14–128 character password or passphrase, then try again.');}
};
