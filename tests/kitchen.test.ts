import {describe,it,expect} from 'vitest';
import sharp from 'sharp';
const base=process.env.VV_TEST_URL||'http://localhost:4321';
const req=(path:string,role='owner',method='GET',body?:unknown)=>fetch(`${base}${path}`,{method,redirect:'manual',headers:{Origin:base,Cookie:`vv-preview-role=${role}`,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
describe('Kitchen companies and activity',()=>{
 it('canonicalizes company names, associates artwork, and restricts previews',async()=>{
  const name=`Kitchen test ${crypto.randomUUID()}`;
  expect((await req('/api/companies','contributor','POST',{name})).status).toBe(403);
  const company=await(await req('/api/companies','owner','POST',{name})).json() as any;
  const duplicate=await(await req('/api/companies','owner','POST',{name:name.toUpperCase()})).json() as any;
  expect(duplicate.id).toBe(company.id);
  const bytes=await sharp({create:{width:160,height:640,channels:3,background:'#ddd'}}).webp().toBuffer();
  const uploaded=await fetch(`${base}/api/media`,{method:'POST',headers:{Origin:base,Cookie:'vv-preview-role=owner','Content-Type':'image/webp','X-Media-Kind':'artwork','X-Photo-Description':'Test poster metadata'},body:bytes});
  expect(uploaded.status).toBe(201);const photo=await uploaded.json() as any;const id=crypto.randomUUID();
  try{
   const ad={id,company_id:company.id,image:photo.url,format:'poster',alt:'Test poster metadata',active:false};
   expect((await req('/api/promotions','owner','POST',ad)).status).toBe(200);
   const items=await(await req('/api/promotions')).json() as any[];expect(items.find(item=>item.id===id)).toMatchObject({company_id:company.id,name,active:0});
   const preview=await req(`/preview/ads/${id}`);expect(preview.status).toBe(200);expect(preview.headers.get('x-robots-tag')).toContain('noindex');const html=await preview.text();expect(html).toContain('PRIVATE AD PREVIEW');expect(html).toContain(photo.url);expect(html).toContain('article-friend-rail');
   expect((await req(`/preview/ads/${id}`,'contributor')).status).toBe(404);
   expect((await req('/api/promotions','owner','POST',{...ad,company_id:'missing'})).status).toBe(400);
  }finally{await req(`/api/promotions/${id}`,'owner','DELETE');await req(`/api/media/${photo.id}`,'owner','DELETE');}
 });
 it('tracks actual article edits and actor, filters activity, and scopes unread markers to each user',async()=>{
  const title=`Kitchen log test ${crypto.randomUUID()}`;let story:any;
  try{
   story=await(await req('/api/stories','contributor','POST',{title,body:'<p>Original</p>'})).json();
   story=await(await req(`/api/stories/${story.id}`,'contributor','PUT',{...story,deck:'A new introduction',revision:story.revision})).json();
   const activity=await(await req(`/api/activity?kind=article&target=${story.id}`)).json() as any;
   const edit=activity.items.find((item:any)=>item.action==='Updated');expect(edit).toMatchObject({actor_email:'maya@vanityvair.example',title});expect(edit.summary).toContain('introduction');expect(edit.summary).not.toContain('story text');
   const own=await(await req('/api/activity','contributor')).json() as any;expect(own.items.every((item:any)=>item.actor_email==='maya@vanityvair.example'||item.kind==='website')).toBe(true);
   expect((await req('/api/activity/read','contributor','POST',{seq:own.latest+100})).status).toBe(400);
   expect((await req('/api/activity/read','contributor','POST',{seq:own.latest})).status).toBe(200);
   expect((await(await req('/api/activity/unread','contributor')).json() as any).unread).toBe(0);
   expect((await req(`/api/stories/${story.id}`,'contributor','PUT',{...story,revision:0})).status).toBe(409);
   expect((await(await req('/api/activity/unread','contributor')).json() as any).unread).toBe(0);
   story=await(await req(`/api/stories/${story.id}`,'contributor','PUT',{...story,deck:'Another edit',revision:story.revision})).json();
   expect((await(await req('/api/activity/unread','contributor')).json() as any).unread).toBe(1);
   const website=await(await req('/api/activity?kind=website','contributor')).json() as any;expect(website.items.some((item:any)=>item.action==='Site update')).toBe(true);
  }finally{if(story?.id)await req(`/api/stories/${story.id}`,'contributor','DELETE',{revision:story.revision});}
 });
});
