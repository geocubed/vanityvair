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
export function selectPromotion(items: Promotion[], format: PromotionFormat, visit: number, offset = 0) {
  const pool = items.filter(item => item.active && item.image && item.format === format);
  return pool.length ? pool[((Math.max(0, visit) + offset) % pool.length + pool.length) % pool.length] : undefined;
}
