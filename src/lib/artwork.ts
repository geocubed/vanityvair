import { MAX_IMAGE_BYTES } from './content-constants';
import { artworkSizes, cropRectangle } from './promotion';
import type { PromotionFormat } from './types';
export async function loadArtwork(file: File) {
  if (file.size > 40_000_000) throw new Error('Choose an image under 40 MB.');
  if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type)) throw new Error('Choose a JPEG, PNG, or WebP image.');
  const url = URL.createObjectURL(file);
  const image = new Image(); image.src = url;
  try {
    await image.decode();
    if (!image.naturalWidth || image.naturalWidth * image.naturalHeight > 100_000_000) throw new Error('Choose an image with fewer than 100 million pixels.');
    return { image, release: () => URL.revokeObjectURL(url) };
  } catch { URL.revokeObjectURL(url); throw new Error('This image could not be opened. Try saving it as a JPEG.'); }
}
export function drawArtwork(canvas: HTMLCanvasElement, image: HTMLImageElement, format: PromotionFormat, x = 50, y = 50, zoom = 100) {
  const size = artworkSizes[format]; canvas.width = size.width; canvas.height = size.height;
  const crop = cropRectangle(image.naturalWidth, image.naturalHeight, format, x, y, zoom);
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Image preparation is unavailable in this browser.');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, canvas.width, canvas.height);
}
export async function compressArtwork(source: HTMLCanvasElement): Promise<Blob> {
  for (let pass = 0; pass < 10; pass++) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(4, Math.round(source.width * .85 ** pass)); canvas.height = Math.max(4, Math.round(source.height * .85 ** pass));
    canvas.getContext('2d')!.drawImage(source, 0, 0, canvas.width, canvas.height);
    for (const quality of [.94, .86, .78, .68]) {
      let blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', quality));
      if (blob?.type !== 'image/webp') blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
      if (blob && ['image/webp', 'image/jpeg'].includes(blob.type) && blob.size <= MAX_IMAGE_BYTES) return blob;
    }
  }
  throw new Error('We couldn’t prepare this image below 500 KB. Try a simpler image.');
}
