import {it,expect} from 'vitest';
const base=process.env.VV_TEST_URL||'http://localhost:4321';
const req=(path:string,method:string,body:unknown)=>fetch(`${base}/api/${path}`,{method,headers:{Origin:base,Cookie:'vv-preview-role=owner','Content-Type':'application/json'},body:JSON.stringify(body)});
it('saves an article date, publishes it, and preserves the live date during draft changes',async()=>{
 const data={title:`Date check ${Date.now()}`,body:'<p>Disposable date check.</p>',post_date:'2025-12-31'};
 let response=await req('stories','POST',data);expect(response.status).toBe(201);let story:any=await response.json();
 try{
  expect(story.published_at).toBe('2025-12-31T12:00:00.000Z');
  response=await req(`stories/${story.id}/publish`,'POST',{revision:story.revision});expect(response.status).toBe(200);story=await response.json();
  expect(JSON.parse(story.published_json).published_at).toBe('2025-12-31T12:00:00.000Z');
  response=await req(`stories/${story.id}`,'PUT',{...data,revision:story.revision,post_date:'2026-02-30'});expect(response.status).toBe(400);
  response=await req(`stories/${story.id}`,'PUT',{...data,revision:story.revision,post_date:'2026-01-01'});expect(response.status).toBe(200);story=await response.json();
  expect(story.published_at).toBe('2026-01-01T12:00:00.000Z');expect(JSON.parse(story.published_json).published_at).toBe('2025-12-31T12:00:00.000Z');
  response=await req(`stories/${story.id}/publish`,'POST',{revision:story.revision});expect(response.status).toBe(200);story=await response.json();expect(JSON.parse(story.published_json).published_at).toBe('2026-01-01T12:00:00.000Z');
 }finally{await req(`stories/${story.id}`,'DELETE',{revision:story.revision});}
});
