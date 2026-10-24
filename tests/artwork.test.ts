import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { imageInfo } from '../src/lib/image-info';
import { cropRectangle, matchesFormat, randomPromotion, detectFormat } from '../src/lib/promotion';
import type { Promotion } from '../src/lib/types';
describe('image artwork validation', () => {
  it('reads real JPEG and all common WebP dimensions from encoded bytes', async () => {
    const image = sharp({create:{width:640,height:80,channels:3,background:'#e9e3d7'}});
    for (const buffer of [await image.clone().jpeg().toBuffer(), await image.clone().webp().toBuffer(), await image.clone().webp({lossless:true}).toBuffer()]) {
      expect(imageInfo(buffer)).toMatchObject({width:640,height:80});
    }
    const alpha = await sharp({create:{width:800,height:1200,channels:4,background:'#00000000'}}).webp().toBuffer();
    expect(imageInfo(alpha)).toMatchObject({width:800,height:1200});
  });
  it('rejects truncated or disguised files', () => {
    for (const bytes of [new Uint8Array(),new Uint8Array([255,216,255]),new TextEncoder().encode('<svg>not an uploaded photo</svg>')]) expect(() => imageInfo(bytes)).toThrow();
  });
  it('keeps edge and zoom crops inside the source with the selected ratio', () => {
    for (const format of ['banner','poster'] as const) for (const x of [-100,0,50,100,200]) for (const zoom of [100,180,250]) {
      const crop = cropRectangle(2400,1600,format,x,100,zoom);
      expect(crop.sx).toBeGreaterThanOrEqual(0); expect(crop.sy).toBeGreaterThanOrEqual(0);
      expect(crop.sx + crop.sw).toBeLessThanOrEqual(2400.001); expect(crop.sy + crop.sh).toBeLessThanOrEqual(1600.001);
      expect(matchesFormat(crop.sw,crop.sh,format)).toBe(true);
    }
    expect(matchesFormat(1600,400,'banner')).toBe(true);
    expect(matchesFormat(400,1600,'poster')).toBe(true);
    expect(matchesFormat(1600,200,'banner')).toBe(false);
    expect(matchesFormat(800,1200,'poster')).toBe(false);
  });
  it('randomly samples companies and avoids repeats across formats when alternatives exist',()=>{
    const items=[{id:'a',company_id:'one',name:'One',active:1,image:'/a',format:'banner'},{id:'b',company_id:'one',name:'One',active:1,image:'/b',format:'poster'},{id:'c',company_id:'two',name:'Two',active:1,image:'/c',format:'poster'},{id:'d',company_id:'three',name:'Three',active:0,image:'/d',format:'poster'}] as Promotion[];
    const used=new Set<string>();
    expect(randomPromotion(items,'banner',used,()=>0)?.id).toBe('a');
    expect(randomPromotion(items,'poster',used,()=>0)?.id).toBe('c');
    expect(randomPromotion(items,'poster',used,()=>0)?.id).toBe('b');
    expect(randomPromotion([],'banner',used)).toBeUndefined();
    expect(detectFormat(1600,400)).toBe('banner');expect(detectFormat(400,1600)).toBe('poster');
  });
});
