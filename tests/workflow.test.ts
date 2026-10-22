import {describe,it,expect} from 'vitest';
import sharp from 'sharp';
// Run against `npm run dev`. These requests only change disposable local demo data.
const base=process.env.VV_TEST_URL||'http://localhost:4321';
async function req(path:string,role='owner',method='GET',body?:unknown,extra:Record<string,string>={}){
  const response=await fetch(`${base}${path}`,{method,headers:{Origin:base,Cookie:`vv-preview-role=${role}`,...(body?{'Content-Type':'application/json'}:{}),...extra},body:body?JSON.stringify(body):undefined,redirect:'manual'});
  return response;
}
describe('local editorial workflow',()=>{
  it('creates, submits, publishes, revises safely, rejects stale saves, and unpublishes',async()=>{
    const data={title:`Workflow check ${Date.now()}`,deck:'A local test',category:'Projects',body:'<p>A story worth telling.</p>',hero:'',hero_alt:'',caption:''};
    let response=await req('/api/stories','contributor','POST',data);expect(response.status).toBe(201);let story:any=await response.json();
    expect(story.author_email).toBe('maya@vanityvair.example');
    expect((await req(`/stories/${story.slug}`)).status).toBe(302);
    expect((await req(`/api/stories/${story.id}/publish`,'contributor','POST',{revision:story.revision})).status).toBe(403);
    response=await req(`/api/stories/${story.id}/submit`,'contributor','POST',{revision:story.revision});expect(response.status).toBe(200);story=await response.json();expect(story.status).toBe('review');
    response=await req(`/api/stories/${story.id}/publish`,'owner','POST',{revision:story.revision});expect(response.status).toBe(200);story=await response.json();expect(story.status).toBe('published');
    const html=await(await req(`/stories/${story.slug}`)).text();expect(html).toContain('A story worth telling.');
    const oldRevision=story.revision;
    response=await req(`/api/stories/${story.id}`,'contributor','PUT',{...data,body:'<p>A secret revision.</p>',revision:story.revision});expect(response.status).toBe(200);story=await response.json();
    const unchanged=await(await req(`/stories/${story.slug}`)).text();expect(unchanged).toContain('A story worth telling.');expect(unchanged).not.toContain('A secret revision.');
    expect((await req(`/api/stories/${story.id}`,'contributor','PUT',{...data,revision:oldRevision})).status).toBe(409);
    response=await req(`/api/stories/${story.id}/unpublish`,'owner','POST',{revision:story.revision});expect(response.status).toBe(200);expect((await req(`/stories/${story.slug}`)).status).toBe(302);
  });
  it('enforces contributor boundaries and request origin',async()=>{
    expect((await req('/api/users','contributor')).status).toBe(403);
    expect((await req('/api/promotions','contributor')).status).toBe(403);
    expect((await req('/api/stories','visitor')).status).toBe(401);
    expect((await req('/api/stories/demo-03','contributor')).status).toBe(404);
    expect((await req('/api/stories','owner','POST',{title:'Bad origin'},{Origin:'https://evil.example'})).status).toBe(403);
  });
  it('enforces uploaded size and file signatures',async()=>{
    const headers={Origin:base,Cookie:'vv-preview-role=contributor','Content-Type':'image/jpeg'};
    const tooBig=await fetch(`${base}/api/media`,{method:'POST',headers,body:new Uint8Array(500001)});expect(tooBig.status).toBe(413);
    const notPhoto=await fetch(`${base}/api/media`,{method:'POST',headers,body:'<script>bad()</script>'});expect(notPhoto.status).toBe(400);
  });
  it('keeps draft photos private, publishes references atomically, and revokes public access on unpublish',async()=>{
    const jpeg=await sharp({create:{width:16,height:16,channels:3,background:'#ab2531'}}).jpeg().toBuffer();
    let response=await fetch(`${base}/api/media`,{method:'POST',headers:{Origin:base,Cookie:'vv-preview-role=contributor','Content-Type':'image/jpeg'},body:jpeg});expect(response.status).toBe(201);
    const photo:any=await response.json();
    expect((await req(photo.url,'visitor')).status).toBe(404);expect((await req(photo.url,'contributor')).status).toBe(200);
    const data={title:`Private photo check ${Date.now()}`,category:'Achievements',body:'<p>Photo privacy verification.</p>',hero:photo.url,hero_alt:'A red test image'};
    response=await req('/api/stories','contributor','POST',data);let story:any=await response.json();expect(response.status).toBe(201);
    response=await req(`/api/stories/${story.id}/publish`,'owner','POST',{revision:story.revision});story=await response.json();expect(response.status).toBe(200);
    expect((await req(photo.url,'visitor')).status).toBe(200);
    expect((await req(`/api/media/${photo.id}`,'owner','DELETE')).status).toBe(400);
    response=await req(`/api/stories/${story.id}/unpublish`,'owner','POST',{revision:story.revision});expect(response.status).toBe(200);
    expect((await req(photo.url,'visitor')).status).toBe(404);
    expect((await req(`/preview/${story.id}`,'visitor')).status).toBe(401);
  });
  it('finds published stories, category pages, and promotions without exposing draft content',async()=>{
    const response=await req('/archive?q=borrowed');expect(response.status).toBe(200);expect(await response.text()).toContain('A little film. A very big night.');
    expect((await req('/category/projects')).status).toBe(200);
    expect(await(await req('/')).text()).toContain('Good Company Studio');
    expect((await req('/404')).status).toBe(404);
  });
});
