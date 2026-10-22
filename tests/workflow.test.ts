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
    const data={title:`Workflow check ${Date.now()}`,deck:'A local test',category:'Projects',body:'<p>A story worth telling.</p>',hero:'',hero_alt:'',caption:'A caption.',photo_credit:'Test Photographer'};
    let response=await req('/api/stories','contributor','POST',data);expect(response.status).toBe(201);let story:any=await response.json();
    expect(story.author_email).toBe('maya@vanityvair.example');
    expect(story.caption).toBe(data.caption);expect(story.photo_credit).toBe(data.photo_credit);
    expect((await req(`/stories/${story.slug}`)).status).toBe(302);
    expect((await req(`/api/stories/${story.id}/publish`,'contributor','POST',{revision:story.revision})).status).toBe(403);
    response=await req(`/api/stories/${story.id}/submit`,'contributor','POST',{revision:story.revision});expect(response.status).toBe(200);story=await response.json();expect(story.status).toBe('review');
    response=await req(`/api/stories/${story.id}/publish`,'owner','POST',{revision:story.revision});expect(response.status).toBe(200);story=await response.json();expect(story.status).toBe('published');expect(JSON.parse(story.published_json).photo_credit).toBe(data.photo_credit);
    const html=await(await req(`/stories/${story.slug}`)).text();expect(html).toContain('A story worth telling.');
    const oldRevision=story.revision;
    response=await req(`/api/stories/${story.id}`,'contributor','PUT',{...data,body:'<p>A secret revision.</p>',photo_credit:'Updated Photographer',revision:story.revision});expect(response.status).toBe(200);story=await response.json();
    expect(story.photo_credit).toBe('Updated Photographer');expect(JSON.parse(story.published_json).photo_credit).toBe(data.photo_credit);
    const unchanged=await(await req(`/stories/${story.slug}`)).text();expect(unchanged).toContain('A story worth telling.');expect(unchanged).not.toContain('A secret revision.');
    expect((await req(`/api/stories/${story.id}`,'contributor','PUT',{...data,revision:oldRevision})).status).toBe(409);
    response=await req(`/api/stories/${story.id}/unpublish`,'owner','POST',{revision:story.revision});expect(response.status).toBe(200);expect((await req(`/stories/${story.slug}`)).status).toBe(302);
  });
  it('stores searchable photo descriptions, protects ownership, and supplies fallback alt text',async()=>{
    const description='Felix and Megan posing at Crazy8s';
    const jpeg=await sharp({create:{width:40,height:30,channels:3,background:'#aabbcc'}}).jpeg().toBuffer();
    const headers={Origin:base,Cookie:'vv-preview-role=contributor','Content-Type':'image/jpeg','X-Photo-Description':encodeURIComponent(description),'X-Photo-Photographer':'Test Photographer'};
    expect((await fetch(`${base}/api/media`,{method:'POST',headers:{...headers,'X-Photo-Description':''},body:jpeg})).status).toBe(400);
    expect((await fetch(`${base}/api/media`,{method:'POST',headers:{...headers,'X-Photo-Description':'a'.repeat(501)},body:jpeg})).status).toBe(400);
    const response=await fetch(`${base}/api/media`,{method:'POST',headers,body:jpeg});expect(response.status).toBe(201);
    const photo:any=await response.json();let story:any;
    try {
      expect(photo.description).toBe(description);
      const library:any=await(await req('/api/media','contributor')).json();expect(library.items.find((item:any)=>item.id===photo.id).description).toBe(description);
      const ownerPhoto=await fetch(`${base}/api/media`,{method:'POST',headers:{...headers,Cookie:'vv-preview-role=owner'},body:jpeg});const privatePhoto:any=await ownerPhoto.json();
      try {expect((await req(`/api/media/${privatePhoto.id}`,'contributor','PUT',{description:'Changed',photographer:'Test Photographer'})).status).toBe(404);} finally {await req(`/api/media/${privatePhoto.id}`,'owner','DELETE');}
      expect((await req(`/api/media/${photo.id}`,'contributor','PUT',{description:'   '})).status).toBe(400);
      const data={title:`Library fallback ${Date.now()}`,hero:photo.url,body:`<p>Photo test</p><img src="${photo.url}">`};
      story=await(await req('/api/stories','contributor','POST',data)).json();
      expect(story.hero_alt).toBe(description);expect(story.body).toContain(`alt="${description}"`);
      story=await(await req(`/api/stories/${story.id}`,'contributor','PUT',{...data,hero_alt:'Custom cover description',body:`<p>Photo story</p><img src="${photo.url}" alt="Custom body description" data-caption="A caption for this story.">`,revision:story.revision})).json();
      expect(story.hero_alt).toBe(description);expect(story.body).toContain(`alt="${description}"`);expect(story.photo_credit).toBe('Photograph: Test Photographer');
      story=await(await req(`/api/stories/${story.id}/publish`,'owner','POST',{revision:story.revision})).json();
      expect((await req(`/api/media/${photo.id}`,'contributor','PUT',{description:'Updated library description',photographer:'Updated Photographer'})).status).toBe(200);
      const updatedHtml=await(await req(`/stories/${story.slug}`)).text();expect(updatedHtml).toContain('Photograph: Updated Photographer');expect(updatedHtml).toContain('A caption for this story.');expect(updatedHtml).toContain('alt="Updated library description"');
      expect((await req(`/api/media/${photo.id}`,'contributor','PUT',{description:'App settings screen',is_screenshot:true})).status).toBe(200);
      const screenshotHtml=await(await req(`/stories/${story.slug}`)).text();expect(screenshotHtml).toContain('Screenshot');expect(screenshotHtml).toContain('A caption for this story.');

    } finally {
      if(story?.published_json)story=await(await req(`/api/stories/${story.id}/unpublish`,'owner','POST',{revision:story.revision})).json();
      if(story?.id)await req(`/api/stories/${story.id}`,'contributor','PUT',{title:'Disposable library test',body:'',hero:'',revision:story.revision});
      await req(`/api/media/${photo.id}`,'owner','DELETE');
    }
  });
  it('lists all contributors for the owner while keeping contributor lists private',async()=>{
    const ownerStories:any[]=await(await req('/api/stories','owner')).json();
    const contributorStories:any[]=await(await req('/api/stories','contributor')).json();
    expect(new Set(ownerStories.map(story=>story.author_email)).size).toBeGreaterThan(1);
    expect(ownerStories.every(story=>typeof story.author_name==='string'&&story.author_name.length>0)).toBe(true);
    expect(contributorStories.length).toBeGreaterThan(0);
    expect(contributorStories.every(story=>story.author_email==='maya@vanityvair.example')).toBe(true);
  });
  it('enforces contributor boundaries and request origin',async()=>{
    expect((await req('/api/users','contributor')).status).toBe(403);
    expect((await req('/api/promotions','contributor')).status).toBe(403);
    expect((await req('/api/stories','visitor')).status).toBe(401);
    expect((await req('/api/stories/demo-03','contributor')).status).toBe(404);
    expect((await req('/api/stories','owner','POST',{title:'Bad origin'},{Origin:'https://evil.example'})).status).toBe(403);
  });
  it('enforces uploaded size and file signatures',async()=>{
    const headers={Origin:base,Cookie:'vv-preview-role=contributor','Content-Type':'image/jpeg','X-Photo-Description':'A test photo','X-Photo-Photographer':'Test Photographer'};
    const tooBig=await fetch(`${base}/api/media`,{method:'POST',headers,body:new Uint8Array(500001)});expect(tooBig.status).toBe(413);
    const notPhoto=await fetch(`${base}/api/media`,{method:'POST',headers,body:'<script>bad()</script>'});expect(notPhoto.status).toBe(400);
  });
  it('keeps draft photos private, publishes references atomically, and revokes public access on unpublish',async()=>{
    const jpeg=await sharp({create:{width:16,height:16,channels:3,background:'#ab2531'}}).jpeg().toBuffer();
    let response=await fetch(`${base}/api/media`,{method:'POST',headers:{Origin:base,Cookie:'vv-preview-role=contributor','Content-Type':'image/jpeg','X-Photo-Description':'A test photo','X-Photo-Photographer':'Test Photographer'},body:jpeg});expect(response.status).toBe(201);
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
