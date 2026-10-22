import type {D1Database} from '@cloudflare/workers-types';
import type {User} from './types';
const encoder=new TextEncoder();
const hex=(bytes:ArrayBuffer)=>Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,'0')).join('');
export const newToken=()=>hex(crypto.getRandomValues(new Uint8Array(32)).buffer);
export const tokenHash=async(value:string)=>hex(await crypto.subtle.digest('SHA-256',encoder.encode(value)));
// Workers caps PBKDF2 at 100,000 iterations. A separate server-side HMAC pepper
// protects password verifiers if a database backup alone is compromised.
export async function passwordHash(password:string,pepper:string,salt=newToken()) {
 if(!pepper)throw new Error('Sign-in is not configured.');
 if(password.length<14||password.length>128)throw new Error('Use a password or passphrase of 14–128 characters.');
 const key=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);
 const derived=await crypto.subtle.deriveBits({name:'PBKDF2',salt:encoder.encode(salt),iterations:100000,hash:'SHA-256'},key,256);
 const hmac=await crypto.subtle.importKey('raw',encoder.encode(pepper),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return `v1:${salt}:${hex(await crypto.subtle.sign('HMAC',hmac,derived))}`;
}
export async function verifyPassword(password:string,stored:string,pepper:string){
 if(!/^v1:[a-f0-9]{64}:[a-f0-9]{64}$/.test(stored)||password.length<14||password.length>128)return false;
 const actual=await passwordHash(password,pepper,stored.split(':')[1]);
 // Compare fixed-size digests through Web Crypto rather than early-return equality.
 const key=await crypto.subtle.importKey('raw',encoder.encode(pepper),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
 const signature=await crypto.subtle.sign('HMAC',key,encoder.encode(actual));
 return crypto.subtle.verify('HMAC',key,signature,encoder.encode(stored));
}
export async function sessionUser(db:D1Database,token:string|undefined){
 if(!token||!/^[a-f0-9]{64}$/.test(token))return null;
 return db.prepare(`SELECT u.email,u.name,u.role,u.bio,u.slug,u.link,u.active,u.avatar FROM users u JOIN auth_sessions s ON s.email=u.email WHERE s.token_hash=? AND s.expires_at>? AND u.active=1`).bind(await tokenHash(token),Date.now()).first<User>();
}
export async function allowAttempt(db:D1Database,key:string,max=10){
 const now=Date.now();
 const row=await db.prepare(`INSERT INTO auth_limits(key,attempts,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN expires_at<=? THEN 1 ELSE attempts+1 END,expires_at=CASE WHEN expires_at<=? THEN excluded.expires_at ELSE expires_at END RETURNING attempts`).bind(await tokenHash(key),now+15*60*1000,now,now).first<{attempts:number}>();
 return !!row&&row.attempts<=max;
}
export async function issueInvite(db:D1Database,email:string){
 const token=newToken();
 await db.batch([db.prepare('DELETE FROM auth_invites WHERE email=?').bind(email),db.prepare('INSERT INTO auth_invites(token_hash,email,expires_at) VALUES(?,?,?)').bind(await tokenHash(token),email,Date.now()+24*60*60*1000)]);
 return token;
}
export const userColumns='email,name,role,bio,slug,link,active,avatar';
