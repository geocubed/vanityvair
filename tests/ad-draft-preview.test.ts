import {it,expect} from 'vitest';
const base=process.env.VV_TEST_URL||'http://localhost:4321';
it('previews either unsaved shape privately without adding a promotion',async()=>{
 const headers={Cookie:'vv-preview-role=owner'};
 const before=await(await fetch(`${base}/api/promotions`,{headers})).json() as unknown[];
 for(const format of ['banner','poster']){
  const response=await fetch(`${base}/preview/ads/draft?format=${format}`,{headers});expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toContain('no-store');expect(response.headers.get('x-robots-tag')).toContain('noindex');
  const html=await response.text();expect(html).toMatch(new RegExp(`<aside[^>]+friend-${format}`));
 }
 const denied=await fetch(`${base}/preview/ads/draft`,{headers:{Cookie:'vv-preview-role=contributor'}});expect(denied.status).toBe(404);
 expect((await(await fetch(`${base}/api/promotions`,{headers})).json() as unknown[]).length).toBe(before.length);
});
