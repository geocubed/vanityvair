import type { Promotion, PromotionFormat } from './types';
export const artworkSizes = { banner: { width: 1600, height: 400 }, poster: { width: 400, height: 1600 } } as const;
export function cropRectangle(width: number, height: number, format: PromotionFormat, x = 50, y = 50, zoom = 100) {
  const target = artworkSizes[format];
  const ratio = target.width / target.height;
  let sw = Math.min(width, height * ratio) / (Math.max(100, Math.min(250, zoom)) / 100);
  const sh = sw / ratio;
  return { sx: (width - sw) * Math.max(0, Math.min(100, x)) / 100, sy: (height - sh) * Math.max(0, Math.min(100, y)) / 100, sw, sh };
}
export function matchesFormat(width: number, height: number, format: PromotionFormat) {
  const target = artworkSizes[format];
  return width > 0 && height > 0 && Math.abs(width / height - target.width / target.height) < 0.015;
}
export const companyKey=(item:Promotion)=>item.company_id||item.name.trim().toLocaleLowerCase();
export function randomPromotion(items:Promotion[],format:PromotionFormat,used:Set<string>,random= Math.random){
 const eligible=items.filter(item=>item.active&&item.image&&item.format===format);
 const fresh=eligible.filter(item=>!used.has(companyKey(item)));
 const pool=fresh.length?fresh:eligible;
 // Sample companies first, so companies with more artwork do not dominate.
 const companies=[...new Set(pool.map(companyKey))];
 if(!companies.length)return undefined;
 const company=companies[Math.min(companies.length-1,Math.floor(random()*companies.length))];
 const artwork=pool.filter(item=>companyKey(item)===company);
 const selected=artwork[Math.min(artwork.length-1,Math.floor(random()*artwork.length))];used.add(company);return selected;
}
export const detectFormat=(width:number,height:number):PromotionFormat=>width>=height?'banner':'poster';
