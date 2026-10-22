import { MAX_IMAGE_BYTES } from './content-constants';
export async function compressPhoto(file: File): Promise<Blob> {
  if(file.size > 40_000_000) throw new Error('This photo is over 40 MB. Choose a smaller export and try again.');
  if(!/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type)) throw new Error('Choose a JPEG, PNG, or WebP photo. Export HEIC as JPEG if your browser cannot open it.');
  const url=URL.createObjectURL(file); const image=new Image();
  try {
    image.src=url;
    try { await image.decode(); } catch { throw new Error('Your browser could not open this photo. Save it as JPEG and try again.'); }
    if(!image.naturalWidth || image.naturalWidth*image.naturalHeight>100_000_000) throw new Error('This photo has too many pixels. Choose a smaller export.');
    let longest=Math.min(2048,Math.max(image.naturalWidth,image.naturalHeight));
    for(let pass=0;pass<12;pass++) {
      const ratio=longest/Math.max(image.naturalWidth,image.naturalHeight);
      const canvas=document.createElement('canvas'); canvas.width=Math.max(1,Math.round(image.naturalWidth*ratio));canvas.height=Math.max(1,Math.round(image.naturalHeight*ratio));
      const ctx=canvas.getContext('2d'); if(!ctx)throw new Error('Photo preparation is unavailable in this browser.');
      ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
      for(const quality of [.86,.76,.66,.56]) {
        const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/webp',quality));
        if(blob && ['image/webp','image/jpeg'].includes(blob.type) && blob.size<=MAX_IMAGE_BYTES)return blob;
        // Safari versions without WebP encoding fall back to JPEG explicitly.
        if(blob?.type!=='image/webp') {
          const jpeg=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));
          if(jpeg && jpeg.size<=MAX_IMAGE_BYTES)return jpeg;
        }
      }
      longest=Math.round(longest*.8);
    }
    throw new Error('We couldn’t prepare this photo below 500 KB. Try a different image.');
  } finally { URL.revokeObjectURL(url); }
}
