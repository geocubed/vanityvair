import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
export const GET: APIRoute = async ({ params, locals }) => {
  const id=params.id!;
  if(!/^[a-f0-9-]{36}$/.test(id)) return new Response('Not found',{status:404});
  const row = await env.DB.prepare(`SELECT m.* FROM media m WHERE id=? AND (
    EXISTS(SELECT 1 FROM media_refs r JOIN stories s ON s.id=r.story_id WHERE r.media_id=m.id AND r.visibility='public' AND s.deleted_at IS NULL)
    OR EXISTS(SELECT 1 FROM promotions p WHERE p.image=? AND p.active=1)
    OR EXISTS(SELECT 1 FROM gallery_images i JOIN gallery_posts g ON g.id=i.post_id WHERE i.media_id=m.id AND g.hidden=0 AND g.deleted_at IS NULL)
    OR EXISTS(SELECT 1 FROM users u WHERE u.avatar='/media/' || m.id)
    OR ?='owner' OR m.owner_email=?)`).bind(id,`/media/${id}`,locals.user?.role||'',locals.user?.email||'').first<{mime:string}>();
  if(!row) return new Response('Not found',{status:404});
  const object = await env.MEDIA.get(id);
  if(!object) return new Response('Not found',{status:404});
  return new Response(object.body as unknown as ReadableStream,{headers:{'Content-Type':row.mime,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
};
