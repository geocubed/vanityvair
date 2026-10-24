import { defineMiddleware } from 'astro:middleware';
import { env } from 'cloudflare:workers';
import {sessionUser} from './lib/site-auth';
import type { User } from './lib/types';
import {recordActivity,activityBefore} from './lib/activity';
import { promotions } from './lib/store';
export const onRequest = defineMiddleware(async (ctx, next) => {
  const path = ctx.url.pathname;
  ctx.locals.localPreview = import.meta.env.DEV && env.APP_ENV === 'local';
  ctx.locals.user = null;
  ctx.locals.friendImages = [];
  ctx.locals.usedPromotionCompanies=new Set();
  ctx.locals.promotionPlacements=new Map();
  const publicPage = ctx.request.method === 'GET' && (path === '/' || path === '/gallery' || path === '/archive' || path === '/about' || /^\/(stories|category|people)\/[^/]+\/?$/.test(path));
  if (publicPage) {
    ctx.locals.friendImages = await promotions();
  }
  if (!ctx.locals.localPreview) {
    ctx.locals.user = await sessionUser(env.DB, ctx.cookies.get(ctx.url.protocol === 'https:' ? '__Host-vv-session' : 'vv-session')?.value);
  }
  const isPrivate = path.startsWith('/editor') || path.startsWith('/api/') || path.startsWith('/preview/');
  if (isPrivate || path.startsWith('/media/')) {
    const previewRole = ctx.cookies.get('vv-preview-role')?.value;
    const email = ctx.locals.localPreview
      ? (previewRole === 'visitor' ? null : previewRole === 'contributor' ? 'maya@vanityvair.example' : 'editor@vanityvair.example')
      : null;
    if (email) ctx.locals.user = await env.DB.prepare('SELECT email,name,role,bio,slug,link,active,avatar FROM users WHERE email=? AND active=1').bind(email).first<User>();
    if(!ctx.locals.localPreview)ctx.locals.user=await sessionUser(env.DB,ctx.cookies.get(ctx.url.protocol==='https:'?'__Host-vv-session':'vv-session')?.value);
    if (isPrivate && !ctx.locals.user) {
      return path.startsWith('/api/')
        ? Response.json({ error: 'Sign in with an invited email address to continue.' }, { status: 401 })
        : ctx.locals.localPreview ? new Response('Sign in with an invited account.',{status:401}) : ctx.redirect('/sign-in',303);
    }
  }
  if (path.startsWith('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(ctx.request.method)) {
    if (ctx.request.headers.get('origin') !== ctx.url.origin) return Response.json({ error: 'Please use the editor on this site.' }, { status: 403 });
    const maxBytes = path === '/api/media' ? 500_000 : 180_000;
    if (Number(ctx.request.headers.get('content-length') || 0) > maxBytes) return Response.json({ error: 'Upload is too large. Photos must be 500 KB or smaller.' }, { status: 413 });
  }
  let activityBody:Record<string,unknown>={};
  if(path.startsWith('/api/')&&!['GET','HEAD','OPTIONS'].includes(ctx.request.method)&&ctx.request.headers.get('content-type')?.includes('application/json')){
    const reader=ctx.request.clone().body?.getReader();
    if(reader){
      const chunks:Uint8Array[]=[];let size=0;
      while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>180000){void reader.cancel();void ctx.request.body?.cancel();return Response.json({error:'Request is too large.'},{status:413});}chunks.push(value);}
      const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
      try{const parsed=JSON.parse(new TextDecoder().decode(bytes));if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))activityBody=parsed;}catch{}
    }
  }
  const before=ctx.locals.user&&path.startsWith('/api/')&&!['GET','HEAD','OPTIONS'].includes(ctx.request.method)?await activityBefore(path,activityBody):null;
  const response = await next();
  if(ctx.locals.user&&path.startsWith('/api/')){try{await recordActivity(ctx.locals.user,path,ctx.request.method,response,activityBody,before);}catch(error){console.error('Kitchen activity could not be recorded',error);}}

  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (isPrivate || path.startsWith('/media/')) response.headers.set('Cache-Control', 'private, no-store');
  if (publicPage) response.headers.set('Cache-Control', 'private, no-store');
  if (env.APP_ENV !== 'production' || isPrivate || path==='/sign-in' || path.startsWith('/auth/')) response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return response;
});
