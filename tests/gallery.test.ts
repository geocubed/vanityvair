import {it,expect} from 'vitest';
import sharp from 'sharp';
import {execFileSync} from 'node:child_process';
// Local disposable preview data only, like the editorial workflow tests.
const base=process.env.VV_TEST_URL||'http://localhost:4321';
const headers=(role='contributor')=>({Origin:base,Cookie:`vv-preview-role=${role}`});
const request=(path:string,role='contributor',method='GET',body?:unknown)=>fetch(`${base}${path}`,{method,headers:{...headers(role),'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
it('publishes a photo, escapes captions, enforces ownership, and revokes public media on hiding',async()=>{
 const bytes=await sharp({create:{width:120,height:160,channels:3,background:'#ccbbaa'}}).jpeg().toBuffer();
 const response=await fetch(`${base}/api/media`,{method:'POST',headers:{...headers(),'Content-Type':'image/jpeg','X-Photo-Description':'Disposable Gallery workflow image','X-Photo-Photographer':'Test photographer'},body:bytes});expect(response.status).toBe(201);const photo:any=await response.json();
 const otherResponse=await fetch(`${base}/api/media`,{method:'POST',headers:{...headers('owner'),'Content-Type':'image/jpeg','X-Photo-Description':'Private owner test','X-Photo-Photographer':'Test'},body:bytes});const other:any=await otherResponse.json();
 const extraResponse=await fetch(`${base}/api/media`,{method:'POST',headers:{...headers(),'Content-Type':'image/jpeg','X-Photo-Description':'Disposable carousel second image','X-Photo-Photographer':'Test photographer'},body:bytes});expect(extraResponse.status).toBe(201);const extra:any=await extraResponse.json();
 let post:any;let ownerPost:any;
 try{
  expect((await request('/api/gallery','visitor','POST',{media_id:photo.id})).status).toBe(401);
  const forbidden=await request('/api/gallery','contributor','POST',{media_id:other.id});expect(forbidden.status,await forbidden.text()).toBe(400);
  expect((await request('/api/gallery','contributor','POST',{media_id:photo.id,caption:'a'.repeat(1001)})).status).toBe(400);
  expect((await request(photo.url,'visitor')).status).toBe(404);
  expect((await request('/api/gallery','contributor','POST',{media_ids:[photo.id,other.id]})).status).toBe(400);
  expect((await request('/api/gallery','contributor','POST',{media_ids:[photo.id,photo.id]})).status).toBe(400);
  expect((await request('/api/gallery','contributor','POST',{media_ids:Array(11).fill(photo.id)})).status).toBe(400);
  const beforePreview:any[]=await(await request('/api/gallery','contributor')).json();
  const preview=await request('/api/gallery/preview','contributor','POST',{media_ids:[extra.id,photo.id],caption:'Just previewing #test'});expect(preview.status).toBe(200);
  const previewData:any=await preview.json();expect(previewData.photos.map((item:any)=>item.media_id)).toEqual([extra.id,photo.id]);
  expect((await request(extra.url,'visitor')).status).toBe(404);
  expect((await(await request('/api/gallery','contributor')).json() as any[]).length).toBe(beforePreview.length);
  expect((await request('/api/gallery/preview','contributor','POST',{media_ids:[other.id]})).status).toBe(400);
  const ownerCreated=await request('/api/gallery','owner','POST',{media_id:other.id,caption:'Owner test'});expect(ownerCreated.status).toBe(201);ownerPost=await ownerCreated.json();
  expect((await request(`/api/gallery/${ownerPost.id}`,'contributor','PUT',{hidden:true})).status).toBe(404);
  expect((await request('/api/gallery','contributor')).status).toBe(200);
  const contributorPosts:any[]=await(await request('/api/gallery','contributor')).json();expect(contributorPosts.some(item=>item.id===ownerPost.id)).toBe(false);
  const created=await request('/api/gallery','contributor','POST',{media_ids:[photo.id,extra.id],caption:'A little moment. <script>alert(1)</script> #ShotOniPhone #TestGallery'});expect(created.status).toBe(201);post=await created.json();
  expect((await request(photo.url,'visitor')).status).toBe(200);
  expect((await request(extra.url,'visitor')).status).toBe(200);
  const tagged=await(await request('/gallery?tag=shotoniphone','visitor')).text();expect(tagged).toContain(`moment-${post.id}`);expect(tagged).toContain('Photo 2 of 2');expect(tagged).toContain('/gallery?tag=shotoniphone');
  expect(await(await request('/gallery?tag=shotoniphon','visitor')).text()).not.toContain(`moment-${post.id}`);
  const listed:any[]=await(await request('/api/gallery','contributor')).json();expect(listed.find(item=>item.id===post.id).photos.map((item:any)=>item.media_id)).toEqual([photo.id,extra.id]);
  const html=await(await request('/gallery','visitor')).text();expect(html).toContain(photo.url);expect(html).toContain('&lt;script&gt;');expect(html.match(/<p[^>]*class="moment-caption"[^>]*>(.*?)<\/p>/gs)?.join('')).not.toContain('<script>alert(1)</script>');
  expect((await request(`/api/media/${photo.id}`,'owner','DELETE')).status).toBe(400);
  expect((await request(`/api/media/${extra.id}`,'owner','DELETE')).status).toBe(400);
  expect((await request(`/api/gallery/${post.id}`,'owner','PUT',{caption:'Updated by the editor. #newtag'})).status).toBe(200);
  expect(await(await request('/gallery?tag=shotoniphone','visitor')).text()).not.toContain(`moment-${post.id}`);
  expect(await(await request('/gallery?tag=newtag','visitor')).text()).toContain(`moment-${post.id}`);
  expect((await request(`/api/gallery/${post.id}`,'contributor','PUT',{hidden:true})).status).toBe(200);
  expect(await(await request('/gallery','visitor')).text()).not.toContain(`id="moment-${post.id}"`);
  expect((await request(photo.url,'visitor')).status).toBe(404);
  expect((await request(extra.url,'visitor')).status).toBe(404);
  expect(await(await request('/gallery?tag=newtag','visitor')).text()).not.toContain(`moment-${post.id}`);
  expect((await request(`/api/gallery/${post.id}`,'owner','PUT',{hidden:false})).status).toBe(200);
  expect((await request(photo.url,'visitor')).status).toBe(200);
 }finally{
  for(const record of [post,ownerPost])if(record)await request(`/api/gallery/${record.id}`,'owner','PUT',{hidden:true});
  if(new URL(base).hostname==='localhost'){
   for(const photoId of [photo.id,other.id,extra.id]){
    if(!/^[a-f0-9-]{36}$/.test(photoId))continue;
    execFileSync('npx',['wrangler','d1','execute','DB','--local','--command',`PRAGMA foreign_keys=ON; DELETE FROM gallery_posts WHERE media_id='${photoId}' OR id IN (SELECT post_id FROM gallery_images WHERE media_id='${photoId}');`],{stdio:'pipe'});
    await request(`/api/media/${photoId}`,'owner','DELETE');
   }
  }
 }
});
