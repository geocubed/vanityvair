import {it,expect} from 'vitest';
import sharp from 'sharp';
const base=process.env.VV_TEST_URL||'http://localhost:4321';
const headers=(role='contributor')=>({Origin:base,Cookie:`vv-preview-role=${role}`});
const profile=(avatar:string)=>fetch(`${base}/api/profile`,{method:'PUT',headers:{...headers(),'Content-Type':'application/json'},body:JSON.stringify({avatar})});
it('protects portrait ownership, serves the chosen byline photo publicly, and revokes it on removal',async()=>{
 const original=await(await fetch(`${base}/api/session`,{headers:headers()})).json() as any;
 const bytes=await sharp({create:{width:80,height:80,channels:3,background:'#aabbcc'}}).jpeg().toBuffer();
 const upload=async(role:string)=>{const response=await fetch(`${base}/api/media`,{method:'POST',headers:{...headers(role),'Content-Type':'image/jpeg','X-Media-Kind':'portrait','X-Photo-Description':'Test portrait'},body:bytes});expect(response.status).toBe(201);return await response.json() as any;};
 const own=await upload('contributor');const other=await upload('owner');
 try{
  expect((await profile('https://example.com/photo.jpg')).status).toBe(400);
  expect((await profile(other.url)).status).toBe(403);
  expect((await fetch(`${base}${own.url}`,{headers:headers('visitor')})).status).toBe(404);
  expect((await profile(own.url)).status).toBe(200);
  expect((await fetch(`${base}${own.url}`,{headers:headers('visitor')})).status).toBe(200);
  expect((await fetch(`${base}/api/media/${own.id}`,{method:'DELETE',headers:headers('owner')})).status).toBe(400);
  const html=await(await fetch(`${base}/stories/a-little-film-a-very-big-night`)).text();expect(html).toContain(own.url);expect(html).toContain('byline-portrait');
  expect((await profile('')).status).toBe(200);
  expect((await fetch(`${base}${own.url}`,{headers:headers('visitor')})).status).toBe(404);
 }finally{
  await profile(original.user.avatar||'');
  for(const photo of [own,other])await fetch(`${base}/api/media/${photo.id}`,{method:'DELETE',headers:headers('owner')});
 }
});
