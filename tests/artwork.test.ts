import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { imageInfo } from '../src/lib/image-info';
import { cropRectangle, matchesFormat, selectPromotion } from '../src/lib/promotion';
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
  it('rotates only active artwork in the right shape and handles empty or singleton pools', () => {
    const items = [{id:'a',active:1,image:'/media/a',format:'banner'},{id:'b',active:1,image:'/media/b',format:'banner'},{id:'c',active:1,image:'/media/c',format:'poster'},{id:'d',active:0,image:'/media/d',format:'banner'},{id:'e',active:1,image:'',format:'banner'}] as Promotion[];
    expect([0,1,2].map(visit => selectPromotion(items,'banner',visit)?.id)).toEqual(['a','b','a']);
    expect(selectPromotion(items,'poster',99)?.id).toBe('c'); expect(selectPromotion([],'banner',0)).toBeUndefined();
  });
});
