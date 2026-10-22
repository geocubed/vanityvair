import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
const base=process.env.VV_TEST_URL||'http://localhost:4321';
async function request(path:string,method='GET',body?:unknown,role='owner',visit=0) {
  return fetch(`${base}${path}`,{method,headers:{Origin:base,Cookie:`vv-preview-role=${role}; vv-edition=${visit}`,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
}
describe('owner image promotions',()=>{
  it('validates artwork, protects management, pauses public media, and deletes a rotation entry',async()=>{
    const buffer=await sharp({create:{width:640,height:80,channels:3,background:'#dce3ca'}}).webp().toBuffer();
    const uploaded=await fetch(`${base}/api/media`,{method:'POST',headers:{Origin:base,Cookie:'vv-preview-role=owner','Content-Type':'image/webp'},body:buffer});
    expect(uploaded.status).toBe(201);const photo:any=await uploaded.json();
    const id=crypto.randomUUID();const data={id,name:'Disposable artwork integration check',format:'banner',alt:'A pale green test banner.',url:'',image:photo.url,active:true};
    try {
      expect((await request('/api/promotions','POST',{...data,format:'poster'})).status).toBe(400);
      expect((await request('/api/promotions','POST',data,'contributor')).status).toBe(403);
      expect((await request('/api/promotions','POST',data)).status).toBe(200);
      expect((await request(photo.url,'GET',undefined,'visitor')).status).toBe(200);
      expect((await request(`/api/media/${photo.id}`,'DELETE')).status).toBe(400);
      expect((await request(`/api/promotions/${id}/visibility`,'POST',{active:false},'contributor')).status).toBe(403);
      expect((await request(`/api/promotions/${id}/visibility`,'POST',{active:false})).status).toBe(200);
      expect((await request(photo.url,'GET',undefined,'visitor')).status).toBe(404);
      expect((await request(photo.url)).status).toBe(200);
      expect((await request(`/api/promotions/${id}/visibility`,'POST',{active:true})).status).toBe(200);
      expect((await request(photo.url,'GET',undefined,'visitor')).status).toBe(200);
    } finally {
      await request(`/api/promotions/${id}`,'DELETE');
      await request(`/api/media/${photo.id}`,'DELETE');
    }
    expect((await request(photo.url,'GET',undefined,'visitor')).status).toBe(404);
  });
  it('advances server-selected images on refresh without sending the whole rotation',async()=>{
    const first=await request('/','GET',undefined,'visitor',0);const a=await first.text();
    const second=await request('/','GET',undefined,'visitor',1);const b=await second.text();
    const image=(html:string)=>html.match(/<aside[^>]+friend-banner[\s\S]*?<img[^>]+src="([^"]+)"/)?.[1];
    expect(first.headers.get('set-cookie')).toContain('vv-edition=1');
    expect(second.headers.get('set-cookie')).toContain('vv-edition=2');
    expect(image(a)).toBeTruthy();expect(image(a)).not.toBe(image(b));
    expect(a).not.toContain('promo-banner-card');
  });
});
