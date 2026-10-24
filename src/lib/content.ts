import sanitize from 'sanitize-html';
import { formatPhotoCredit, photoCredit, type PhotoMetadata } from './photo-metadata';
import { categories } from './types';
import { videoEmbed } from './video';
export { MAX_IMAGE_BYTES } from './content-constants';
export const STORAGE_CAP = 300_000_000;
export const slugify = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100) || 'untitled';
export const safeLink = (s: string) => {
  if (s.startsWith('/') && !s.startsWith('//') && !/[\\\s]/.test(s)) return s;
  try { const u = new URL(s); return u.protocol === 'https:' ? u.href : ''; } catch { return ''; }
};
export const mediaIds = (s: string) => [...new Set([...s.matchAll(/\/media\/([a-f0-9-]{36})/g)].map(m => m[1]))];
export function cleanBody(body: string, descriptions: Record<string,string | PhotoMetadata> = {}) {
  return sanitize(body, {
    allowedTags: ['p', 'h2', 'h3', 'strong', 'em', 's', 'ul', 'ol', 'li', 'blockquote', 'br', 'a', 'img', 'iframe'],
    allowedAttributes: { a: ['href', 'target', 'rel'], img: ['src', 'alt', 'title','data-caption','data-photo-credit','data-size','data-align'], iframe: ['src','title','loading','allowfullscreen','referrerpolicy','data-video'] },
    allowedSchemes: ['https'],
    transformTags: {
      img: (_tag, attrs) => {
        const metadata = descriptions[attrs.src];
        return {tagName:'img',attribs:{...attrs,'data-size':['small','medium','large','full'].includes(attrs['data-size'])?attrs['data-size']:'full','data-align':['left','right'].includes(attrs['data-align'])?attrs['data-align']:'none','data-caption':(attrs['data-caption'] || '').slice(0,500),alt:typeof metadata === 'object' ? metadata.description || attrs.alt || '' : attrs.alt?.trim() ? attrs.alt : metadata || '', 'data-photo-credit':typeof metadata === 'object' ? photoCredit(metadata) : attrs['data-photo-credit'] || ''}};
      },
      a: (_tag, attrs) => ({ tagName: 'a', attribs: { href: safeLink(attrs.href || ''), rel: 'noopener noreferrer' } }),
      iframe: (_tag, attrs) => ({tagName:'iframe',attribs:{src:videoEmbed(attrs.src||''),title:'Embedded video','data-video':'true',loading:'lazy',allowfullscreen:'',referrerpolicy:'strict-origin-when-cross-origin'}}),
    },
    exclusiveFilter: (frame) => (frame.tag === 'img' && !/^\/media\/[a-f0-9-]{36}$/.test(frame.attribs.src || '')) || (frame.tag==='iframe' && !videoEmbed(frame.attribs.src||'')),
  });
}
export function validateStory(input: Record<string, unknown>) {
  const text = (k: string, max: number) => typeof input[k] === 'string' ? (input[k] as string).trim().slice(0, max) : '';
  const title = text('title', 180);
  if (!title) throw new Error('Give your story a title first.');
  const category = text('category', 30);
  if (category && !categories.includes(category as any)) throw new Error('Choose one of the three categories.');
  const hero = text('hero', 500);
  if (hero && !/^\/media\/[a-f0-9-]{36}$/.test(hero) && !/^https:\/\/images\.unsplash\.com\//.test(hero)) throw new Error('Choose an uploaded photo.');
  return { title, deck: text('deck', 500), category, body: cleanBody(text('body', 150_000)), hero, hero_alt: text('hero_alt', 500), caption: text('caption', 500), photo_credit: text('photo_credit', 500) };
}
export const dateLabel = (date: string) => new Intl.DateTimeFormat('en-CA', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Vancouver' }).format(new Date(date));
export const readingTime = (body: string) => Math.max(1, Math.ceil(body.replace(/<[^>]+>/g, ' ').split(/\s+/).length / 220));

export function articleBody(body: string) {
  // Attribute values come from sanitized HTML. Keep their escaping intact when creating figures.
  return cleanBody(body).replace(/<img\b[^>]*>/g, image => {
    const attr = (name:string) => image.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`))?.[1] || '';
    const caption=captionMarkup(attr('data-caption'),true); const credit=formatPhotoCredit(attr('data-photo-credit'));
    return `<figure class="body-photo" data-size="${attr('data-size')}" data-align="${attr('data-align')}">${image}${caption || credit ? `<figcaption><span class="body-photo-caption">${caption}</span><span class="photo-credit">${credit}</span></figcaption>` : ''}</figure>`;
  });
}

// Captions support only paired asterisks for emphasis; HTML is always escaped.
export function captionMarkup(text:string, escaped=false):string{
  const safe=escaped?text:text.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
  return safe.replace(/\*([^*\n]+)\*/g,'<em>$1</em>');
}
