import sanitize from 'sanitize-html';
import { categories } from './types';
import { videoEmbed } from './video';
export { MAX_IMAGE_BYTES } from './content-constants';
export const STORAGE_CAP = 7_000_000_000;
export const slugify = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100) || 'untitled';
export const safeLink = (s: string) => {
  if (s.startsWith('/') && !s.startsWith('//') && !/[\\\s]/.test(s)) return s;
  try { const u = new URL(s); return u.protocol === 'https:' ? u.href : ''; } catch { return ''; }
};
export const mediaIds = (s: string) => [...new Set([...s.matchAll(/\/media\/([a-f0-9-]{36})/g)].map(m => m[1]))];
export function cleanBody(body: string) {
  return sanitize(body, {
    allowedTags: ['p', 'h2', 'h3', 'strong', 'em', 's', 'ul', 'ol', 'li', 'blockquote', 'br', 'a', 'img', 'iframe'],
    allowedAttributes: { a: ['href', 'target', 'rel'], img: ['src', 'alt', 'title'], iframe: ['src','title','loading','allowfullscreen','referrerpolicy','data-video'] },
    allowedSchemes: ['https'],
    transformTags: {
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
  return { title, deck: text('deck', 500), category, body: cleanBody(text('body', 150_000)), hero, hero_alt: text('hero_alt', 500), caption: text('caption', 500) };
}
export const dateLabel = (date: string) => new Intl.DateTimeFormat('en-CA', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Vancouver' }).format(new Date(date));
export const readingTime = (body: string) => Math.max(1, Math.ceil(body.replace(/<[^>]+>/g, ' ').split(/\s+/).length / 220));
