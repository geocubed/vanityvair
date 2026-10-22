import { defineMiddleware } from 'astro:middleware';
import { env } from 'cloudflare:workers';
import {sessionUser} from './lib/site-auth';
import type { User } from './lib/types';
import { promotions } from './lib/store';
export const onRequest = defineMiddleware(async (ctx, next) => {
  const path = ctx.url.pathname;
  ctx.locals.localPreview = import.meta.env.DEV && env.APP_ENV === 'local';
  ctx.locals.user = null;
  ctx.locals.friendImages = [];
  ctx.locals.editionVisit = 0;
  const publicPage = ctx.request.method === 'GET' && (path === '/' || path === '/gallery' || path === '/archive' || path === '/about' || /^\/(stories|category|people)\/[^/]+\/?$/.test(path));
  if (publicPage) {
    const previous = Number(ctx.cookies.get('vv-edition')?.value || 0);
    const visit = Number.isSafeInteger(previous) && previous >= 0 ? previous : 0;
    ctx.locals.editionVisit = visit;
    ctx.locals.friendImages = await promotions();
    // A session counter, not a visitor identifier. Only the selected image is sent.
    ctx.cookies.set('vv-edition', String((visit + 1) % 1_000_000_000), { path: '/', httpOnly: true, sameSite: 'lax', secure: ctx.url.protocol === 'https:' });
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
  const response = await next();
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (isPrivate || path.startsWith('/media/')) response.headers.set('Cache-Control', 'private, no-store');
  if (publicPage) response.headers.set('Cache-Control', 'private, no-store');
  if (env.APP_ENV !== 'production' || isPrivate || path==='/sign-in' || path.startsWith('/auth/')) response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return response;
});
