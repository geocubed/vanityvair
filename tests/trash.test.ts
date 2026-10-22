import {it,expect} from 'vitest';
import sharp from 'sharp';
import {execFileSync} from 'node:child_process';
const base=process.env.VV_TEST_URL||'http://localhost:4321';
const headers=(role='owner')=>({Origin:base,Cookie:`vv-preview-role=${role}`});
const req=(path:string,role='owner',method='GET',body?:unknown)=>fetch(`${base}${path}`,{method,headers:{...headers(role),'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,redirect:'manual'});
const sql=(command:string)=>{if(new URL(base).hostname!=='localhost')throw new Error('Trash expiry tests require the local disposable database.');execFileSync('npx',['wrangler','d1','execute','DB','--local','--command',command],{stdio:'pipe'});};
it('trashes and restores posts/articles, enforces access and stale revisions, and expires recovery after 30 days',async()=>{
 const bytes=await sharp({create:{width:50,height:60,channels:3,background:'#998877'}}).jpeg().toBuffer();const photos:any[]=[];let post:any;let story:any;
 try{
  for(let i=0;i<2;i++){const response=await fetch(`${base}/api/media`,{method:'POST',headers:{...headers('contributor'),'Content-Type':'image/jpeg','X-Photo-Description':'Disposable Trash test photo','X-Photo-Photographer':'Test'},body:bytes});expect(response.status).toBe(201);photos.push(await response.json());}
  post=await(await req('/api/gallery','contributor','POST',{media_ids:photos.map(p=>p.id),caption:'Trash lifecycle #trashtest'})).json();expect(post.id).toBeTruthy();
  expect((await req(`/api/gallery/${post.id}`,'owner','PUT',{caption:'Updated #edited',hidden:false,media_ids:[photos[1].id,photos[0].id]})).status).toBe(200);
  const edited:any[]=await(await req('/api/gallery')).json();expect(edited.find(p=>p.id===post.id).photos[0].media_id).toBe(photos[1].id);
  expect((await req(`/api/gallery/${post.id}`,'visitor','DELETE')).status).toBe(401);
  expect((await req(`/api/gallery/${post.id}`,'contributor','DELETE')).status).toBe(200);
  expect(await(await req('/gallery','visitor')).text()).not.toContain(`moment-${post.id}`);
  for(const photo of photos){expect((await req(photo.url,'visitor')).status).toBe(404);expect((await req(`/api/media/${photo.id}`,'owner','DELETE')).status).toBe(400);}
  expect((await req(`/api/gallery/${post.id}`,'contributor','PUT',{caption:'Cannot edit trash'})).status).toBe(404);
  expect((await(await req('/api/trash','contributor')).json() as any[]).some(p=>p.id===post.id)).toBe(true);
  expect((await req(`/api/trash/gallery/${post.id}`,'contributor','POST')).status).toBe(200);
  expect((await req(photos[0].url,'visitor')).status).toBe(200);
  await req(`/api/gallery/${post.id}`,'contributor','DELETE');
  sql(`UPDATE gallery_posts SET deleted_at='${new Date(Date.now()-29*86400000).toISOString()}' WHERE id='${post.id}'`);
  expect((await req(`/api/trash/gallery/${post.id}`,'contributor','POST')).status).toBe(200);
  await req(`/api/gallery/${post.id}`,'contributor','DELETE');
  sql(`UPDATE gallery_posts SET deleted_at='${new Date(Date.now()-31*86400000).toISOString()}' WHERE id='${post.id}'`);
  expect((await req(`/api/trash/gallery/${post.id}`,'owner','POST')).status).toBe(404);
  story=await(await req('/api/stories','contributor','POST',{title:'Disposable Trash article',body:'<p>Recover this article.</p>'})).json();expect(story.id).toBeTruthy();
  story=await(await req(`/api/stories/${story.id}/publish`,'owner','POST',{revision:story.revision})).json();
  expect((await req(`/api/stories/${story.id}`,'contributor','DELETE',{revision:story.revision})).status).toBe(403);
  expect((await req(`/api/stories/${story.id}`,'owner','DELETE',{revision:story.revision-1})).status).toBe(409);
  expect((await req(`/api/stories/${story.id}`,'owner','DELETE',{revision:story.revision})).status).toBe(200);
  expect((await req(`/api/stories/${story.id}`)).status).toBe(404);
  expect((await req(`/stories/${story.slug}`,'visitor')).status).toBe(302);
  expect((await(await req('/api/trash','contributor')).json() as any[]).some(item=>item.id===story.id)).toBe(false);
  expect((await req(`/api/trash/story/${story.id}`,'contributor','POST')).status).toBe(404);
  expect((await req(`/api/trash/story/${story.id}`,'owner','POST')).status).toBe(200);
  expect((await req(`/stories/${story.slug}`,'visitor')).status).toBe(200);
  story=await(await req(`/api/stories/${story.id}`)).json();await req(`/api/stories/${story.id}`,'owner','DELETE',{revision:story.revision});
  sql(`UPDATE stories SET deleted_at='${new Date(Date.now()-31*86400000).toISOString()}' WHERE id='${story.id}'`);
  expect((await req(`/api/trash/story/${story.id}`,'owner','POST')).status).toBe(404);
 }finally{
  if(story?.id)sql(`PRAGMA foreign_keys=ON; DELETE FROM stories WHERE id='${story.id}'`);
  if(post?.id)sql(`PRAGMA foreign_keys=ON; DELETE FROM gallery_posts WHERE id='${post.id}'`);
  for(const photo of photos)await req(`/api/media/${photo.id}`,'owner','DELETE');
 }
},30000);
