import type { APIRoute } from 'astro';
import type { D1PreparedStatement } from '@cloudflare/workers-types';
import { env } from 'cloudflare:workers';
import { MAX_IMAGE_BYTES, STORAGE_CAP, validateStory, slugify, mediaIds, safeLink } from '../../lib/content';
import { canEdit } from '../../lib/auth';
import { workingStory, checkMedia, refStatements } from '../../lib/store';
import { imageInfo } from '../../lib/image-info';
import { matchesFormat } from '../../lib/promotion';
import type { Promotion, PromotionFormat } from '../../lib/types';

const error = (message: string, status = 400) => Response.json({ error: message }, { status });
async function limitedBytes(request: Request, max: number) {
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = []; let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) { await reader.cancel(); throw new Error('Upload is too large. Photos must be 500 KB or smaller.'); }
    chunks.push(value);
  }
  const all = new Uint8Array(total); let offset = 0;
  for (const part of chunks) { all.set(part, offset); offset += part.length; }
  return all;
}
export const ALL: APIRoute = async ({ request, params, locals, cookies }) => {
  const user = locals.user!;
  const parts = (params.path || '').split('/');
  const [resource, id, action] = parts;
  const method = request.method;
  const owner = () => { if (user.role !== 'owner') throw new Error('Only the editor can do that.'); };
  try {
    if (resource === 'session' && method === 'GET') return Response.json({ user, localPreview: locals.localPreview });
    if (resource === 'preview-role' && method === 'POST' && locals.localPreview) {
      const body = JSON.parse(new TextDecoder().decode(await limitedBytes(request, 500)));
      cookies.set('vv-preview-role', body.role === 'contributor' ? 'contributor' : 'owner', { path: '/', httpOnly: true, sameSite: 'strict' });
      return Response.json({ ok: true });
    }
    if (resource === 'stories') {
      if (!id && method === 'GET') {
        const query = user.role === 'owner' ? 'SELECT * FROM stories ORDER BY updated_at DESC' : 'SELECT * FROM stories WHERE author_email=? ORDER BY updated_at DESC';
        const statement = env.DB.prepare(query);
        return Response.json((await (user.role === 'owner' ? statement : statement.bind(user.email)).all()).results);
      }
      const body = method !== 'GET' ? JSON.parse(new TextDecoder().decode(await limitedBytes(request, 180_000))) : {};
      if (!id && method === 'POST') {
        const data = validateStory(body); const storyId = crypto.randomUUID(); const now = new Date().toISOString();
        const ids = mediaIds(`${data.hero} ${data.body}`); await checkMedia(ids, user);
        const slug = `${slugify(data.title)}-${storyId.slice(0, 6)}`;
        await env.DB.batch([
          env.DB.prepare('INSERT INTO stories(id,slug,title,deck,category,body,hero,hero_alt,caption,author_email,created_at,updated_at,save_token) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(storyId,slug,data.title,data.deck,data.category,data.body,data.hero,data.hero_alt,data.caption,user.email,now,now,storyId),
          ...refStatements(storyId, ids, 'draft', storyId),
        ]);
        return Response.json(await workingStory(storyId), { status: 201 });
      }
      const story = await workingStory(id);
      if (!story || !canEdit(user, story)) return error('Story not found.', 404);
      if (method === 'GET') return Response.json(story);
      if (Number(body.revision) !== story.revision) return error('This story changed in another tab. Copy your text, then reload before saving.', 409);
      const token = crypto.randomUUID(); const now = new Date().toISOString();
      let statements: D1PreparedStatement[] = [];
      if (method === 'PUT' && !action) {
        const data = validateStory(body);
        const ids = mediaIds(`${data.hero} ${data.body}`); await checkMedia(ids, user);
        statements = [env.DB.prepare("UPDATE stories SET title=?,deck=?,category=?,body=?,hero=?,hero_alt=?,caption=?,status='draft',revision=revision+1,updated_at=?,save_token=? WHERE id=? AND revision=?").bind(data.title,data.deck,data.category,data.body,data.hero,data.hero_alt,data.caption,now,token,id,body.revision), ...refStatements(id,ids,'draft',token)];
      } else if (method === 'POST' && action) {
        if (action === 'submit') {
          if (!story.body.replace(/<[^>]+>/g, '').trim()) return error('Add a little writing before submitting.');
          statements = [env.DB.prepare("UPDATE stories SET status='review',revision=revision+1,updated_at=?,save_token=? WHERE id=? AND revision=?").bind(now,token,id,body.revision)];
        } else {
          owner();
          if (action === 'publish') {
            if (!story.body.replace(/<[^>]+>/g, '').trim()) return error('The story needs some writing first.');
            if (story.hero && !story.hero_alt.trim()) return error('Add a description for the cover photo before publishing.');
            const ids = mediaIds(`${story.hero} ${story.body}`); await checkMedia(ids,user);
            const publicStory = { ...story, published_at: story.published_at || now, published_json: undefined, status: 'published' };
            statements = [env.DB.prepare("UPDATE stories SET published_json=?,published_at=?,status='published',revision=revision+1,updated_at=?,save_token=? WHERE id=? AND revision=?").bind(JSON.stringify(publicStory),publicStory.published_at,now,token,id,body.revision),...refStatements(id,ids,'public',token)];
          } else if (action === 'unpublish') {
            statements = [env.DB.prepare("UPDATE stories SET published_json=NULL,published_at=NULL,status='draft',revision=revision+1,updated_at=?,save_token=? WHERE id=? AND revision=?").bind(now,token,id,body.revision), ...refStatements(id,[],'public',token)];
          } else if (action === 'return') {
            statements = [env.DB.prepare("UPDATE stories SET status='draft',revision=revision+1,updated_at=?,save_token=? WHERE id=? AND revision=?").bind(now,token,id,body.revision)];
          }
        }
      }
      if (!statements.length) return error('Unknown story action.',405);
      const result = await env.DB.batch(statements);
      if (!result[0].meta.changes) return error('Another save happened first. Copy your text and reload.',409);
      return Response.json(await workingStory(id));
    }
    if (resource === 'media') {
      if (method === 'GET') {
        const items = user.role === 'owner'
          ? await env.DB.prepare("SELECT m.*, ((SELECT COUNT(*) FROM media_refs r WHERE r.media_id=m.id) + (SELECT COUNT(*) FROM promotions p WHERE p.image='/media/' || m.id)) AS uses FROM media m ORDER BY created_at DESC LIMIT 200").all()
          : await env.DB.prepare('SELECT * FROM media WHERE owner_email=? ORDER BY created_at DESC LIMIT 200').bind(user.email).all();
        const usage = await env.DB.prepare('SELECT bytes FROM storage_usage WHERE id=1').first<{bytes:number}>();
        return Response.json({ items: items.results, bytes: usage?.bytes || 0, cap: STORAGE_CAP });
      }
      if (method === 'POST') {
        const bytes = await limitedBytes(request, MAX_IMAGE_BYTES);
        const { width, height, mime } = imageInfo(bytes);
        if (!width || !height || width * height > 100_000_000) return error('This image has too many pixels. Choose a smaller image.');
        const mediaId = crypto.randomUUID();
        const name = (request.headers.get('x-file-name') || 'Photo').slice(0,180);
        await env.DB.prepare('INSERT INTO media(id,owner_email,bytes,mime,name,created_at,width,height) VALUES(?,?,?,?,?,?,?,?)').bind(mediaId,user.email,bytes.byteLength,mime,name,new Date().toISOString(),width,height).run();
        try { await env.MEDIA.put(mediaId,bytes, { httpMetadata:{contentType:mime} }); }
        catch (e) { await env.DB.prepare('DELETE FROM media WHERE id=?').bind(mediaId).run(); throw e; }
        return Response.json({ id: mediaId, url: `/media/${mediaId}`, bytes: bytes.byteLength },{status:201});
      }
      if (method === 'DELETE' && id) {
        owner();
        const deleted = await env.DB.prepare("DELETE FROM media WHERE id=? AND NOT EXISTS(SELECT 1 FROM media_refs WHERE media_id=?) AND NOT EXISTS(SELECT 1 FROM promotions WHERE image=?) RETURNING id").bind(id,id,`/media/${id}`).first();
        if (!deleted) return error('This photo is in use. Remove it from stories and promotions first.');
        await env.MEDIA.delete(id);
        return Response.json({ok:true});
      }
    }
    if (resource === 'users') {
      owner();
      if (method === 'GET') return Response.json((await env.DB.prepare('SELECT * FROM users ORDER BY role DESC,name').all()).results);
      if (method === 'POST') {
        const body = JSON.parse(new TextDecoder().decode(await limitedBytes(request,10_000)));
        const email = String(body.email || '').trim().toLowerCase(); const name = String(body.name || '').trim().slice(0,100);
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !name) return error('Enter a name and valid email.');
        if (email === user.email) return error('The owner account stays active.');
        await env.DB.prepare("INSERT INTO users(email,name,role,slug,bio,link,active) VALUES(?,?,'contributor',?,?,?,1) ON CONFLICT(email) DO UPDATE SET name=excluded.name,bio=excluded.bio,link=excluded.link,active=excluded.active WHERE users.role!='owner'").bind(email,name,`${slugify(name)}-${crypto.randomUUID().slice(0,5)}`,String(body.bio || '').slice(0,500),safeLink(String(body.link || ''))).run();
        return Response.json({ok:true, note:'Also add this email to the Cloudflare Access allow-list before their first sign-in.'});
      }
      if (method === 'DELETE' && id) {
        await env.DB.prepare("UPDATE users SET active=0 WHERE email=? AND role!='owner'").bind(decodeURIComponent(id)).run();
        return Response.json({ok:true});
      }
    }
    if (resource === 'promotions') {
      owner();
      if (method === 'GET') return Response.json((await env.DB.prepare('SELECT * FROM promotions ORDER BY position,id').all()).results);
      if (method === 'POST' && id && action === 'visibility') {
        const b = JSON.parse(new TextDecoder().decode(await limitedBytes(request, 1000)));
        const row = await env.DB.prepare('SELECT * FROM promotions WHERE id=?').bind(id).first<Promotion>();
        if (!row) return error('This ad no longer exists.', 404);
        if (b.active === true && (!row.image || !row.alt)) return error('Add artwork and an image description before activating this ad.');
        await env.DB.prepare('UPDATE promotions SET active=? WHERE id=?').bind(b.active === true ? 1 : 0, id).run();
        return Response.json({ok:true});
      }
      if (method === 'POST') {
        const b = JSON.parse(new TextDecoder().decode(await limitedBytes(request,10_000)));
        const rawUrl=String(b.url || '').trim(); const url=rawUrl ? safeLink(rawUrl) : '';
        const name=String(b.name || '').trim().slice(0,100); const alt=String(b.alt || '').trim().slice(0,500);
        if (!name || !alt || (rawUrl && !url)) return error('Add a business name, image description, and a valid HTTPS or site link if you want one.');
        if (!['banner','poster'].includes(b.format)) return error('Choose Banner or Poster.');
        const format = b.format as PromotionFormat;
        const image=String(b.image||''); if(!/^\/media\/[a-f0-9-]{36}$/.test(image)) return error('Upload an image for this ad.');
        await checkMedia(mediaIds(image),user);
        const mediaId=mediaIds(image)[0];
        const media=await env.DB.prepare('SELECT width,height FROM media WHERE id=?').bind(mediaId).first<{width:number;height:number}>();
        if (!media || !matchesFormat(media.width,media.height,format)) return error('Upload and crop this image to the selected shape before saving.');
        const result = await env.DB.prepare("INSERT INTO promotions(id,name,headline,description,url,image,active,position,format,alt) SELECT ?,?,'','',?,?,?,?,?,? FROM media WHERE id=? ON CONFLICT(id) DO UPDATE SET name=excluded.name,url=excluded.url,image=excluded.image,active=excluded.active,position=excluded.position,format=excluded.format,alt=excluded.alt").bind(b.id||crypto.randomUUID(),name,url,image,b.active===false||b.active===0?0:1,Math.max(0,Math.min(10000,Number(b.position)||0)),format,alt,mediaId).run();
        if (!result.meta.changes) return error('This image is no longer available. Upload it again.',409);
        return Response.json({ok:true});
      }
      if(method==='DELETE' && id) { await env.DB.prepare('DELETE FROM promotions WHERE id=?').bind(id).run(); return Response.json({ok:true, note:'Ad deleted. Its image stays in Photo library for reuse or removal.'}); }
    }
    return error('Not found.',404);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Something went wrong. Your writing is still here; try again.';
    if (message.includes('Storage limit')) return error('The media library has reached its 7 GB safety limit. Ask the editor to free up space.',413);
    if (/D1_|R2_|SQLITE|constraint|fetch failed/i.test(message)) { console.error(e); return error('The storage service is unavailable. Your writing is still here. Please retry shortly.',503); }
    return error(message,message==='Only the editor can do that.'?403:400);
  }
};
