import {describe,it,expect} from 'vitest';
const base=process.env.VV_TEST_URL||'http://localhost:4321';
const req=(path:string,role='owner',method='GET',body?:unknown)=>fetch(`${base}${path}`,{method,headers:{Origin:base,Cookie:`vv-preview-role=${role}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
describe('homepage spotlight',()=>{
  it('restricts selection to the owner and live stories, preserves drafts, and falls back after unpublishing',async()=>{
    const before=await(await req('/api/homepage')).json() as {story_id:string};
    let story:any;
    try{
      expect((await req('/api/homepage','contributor')).status).toBe(403);
      expect((await req('/api/homepage','contributor','PUT',{story_id:''})).status).toBe(403);
      story=await(await req('/api/stories','owner','POST',{title:'Spotlight test '+crypto.randomUUID(),body:'<p>Live copy</p>'})).json();
      expect((await req('/api/homepage','owner','PUT',{story_id:story.id})).status).toBe(400);
      story=await(await req(`/api/stories/${story.id}/publish`,'owner','POST',{revision:story.revision})).json();
      expect((await req('/api/homepage','owner','PUT',{story_id:story.id})).status).toBe(200);
      const liveTitle=story.title;
      story=await(await req(`/api/stories/${story.id}`,'owner','PUT',{...story,title:'Unapproved spotlight headline',revision:story.revision})).json();
      let home=await(await req('/')).text();expect(home).toContain(liveTitle);expect(home).not.toContain('Unapproved spotlight headline');
      story=await(await req(`/api/stories/${story.id}/unpublish`,'owner','POST',{revision:story.revision})).json();
      home=await(await req('/')).text();expect(home).not.toContain(liveTitle);expect(home).not.toContain('Unapproved spotlight headline');
    }finally{
      await req('/api/homepage','owner','PUT',before);
      if(story?.id)await req(`/api/stories/${story.id}`,'owner','DELETE',{revision:story.revision});
    }
  });
});

it('privately previews an unsaved hero selection without changing the homepage setting',async()=>{
 const headers={Cookie:'vv-preview-role=owner'};
 const before=await(await fetch(`${base}/api/homepage`,{headers})).json() as {story_id:string};
 const stories=await(await fetch(`${base}/api/stories`,{headers})).json() as any[];
 const choice=stories.find(story=>story.published_json&&story.id!==before.story_id);
 expect(choice).toBeTruthy();
 const response=await fetch(`${base}/preview/homepage?story=${choice.id}`,{headers});expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toContain('no-store');expect(response.headers.get('x-robots-tag')).toContain('noindex');
 const html=await response.text();expect(html).toContain('PRIVATE HOMEPAGE PREVIEW');expect(html).toMatch(new RegExp(`<h1[^>]*>[\\s\\S]*?${choice.slug}`));
 expect(await(await fetch(`${base}/api/homepage`,{headers})).json()).toEqual(before);
 expect((await fetch(`${base}/preview/homepage?story=${choice.id}`,{headers:{Cookie:'vv-preview-role=contributor'}})).status).toBe(404);
 expect((await fetch(`${base}/preview/homepage?story=missing`,{headers})).status).toBe(404);
 const automatic=await fetch(`${base}/preview/homepage?story=`,{headers});expect(automatic.status).toBe(200);
 const publicPage=await(await fetch(`${base}/?story=${choice.id}`)).text();expect(publicPage).not.toContain('PRIVATE HOMEPAGE PREVIEW');
});
