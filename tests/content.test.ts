import {describe,it,expect} from 'vitest';
import {cleanBody,articleBody,safeLink,validateStory,mediaIds,slugify,MAX_IMAGE_BYTES} from '../src/lib/content';
import {accessEmail,canEdit} from '../src/lib/auth';
import type {User} from '../src/lib/types';
import {validatePhotoMetadata} from '../src/lib/photo-metadata';
import {videoEmbed} from '../src/lib/video';
describe('untrusted contributor content',()=>{
  it('removes scripts, events, unsafe links and foreign image URLs',()=>{
    const cleaned=cleanBody('<script>alert(1)</script><p onclick="bad()">Good <strong>news</strong></p><a href="javascript:bad()">bad</a><img src="https://tracker.test/x"><img src="/media/12345678-1234-1234-1234-123456789abc" onerror="bad()">');
    expect(cleaned).toContain('<strong>news</strong>');expect(cleaned).not.toMatch(/script|onclick|onerror|javascript|tracker/);expect(cleaned).toContain('/media/12345678-1234-1234-1234-123456789abc');
  });
  it('rejects ambiguous redirect URLs and keeps HTTPS and local links',()=>{
    for(const link of ['javascript:bad()','http://example.com','//evil.test','/\\evil.test','data:text/html,hi'])expect(safeLink(link)).toBe('');
    expect(safeLink('/about#promotions')).toBe('/about#promotions');expect(safeLink('https://example.com')).toBe('https://example.com/');
  });
  it('validates categories and limits headline length',()=>{
    expect(()=>validateStory({title:'Hello',category:'Gossip'})).toThrow();expect(()=>validateStory({title:''})).toThrow();expect(validateStory({title:'a'.repeat(200),category:''}).title).toHaveLength(180);expect(MAX_IMAGE_BYTES).toBe(500000);
  });
  it('keeps caption and photo credit separate and limits both fields',()=>{
    expect(validateStory({title:'Photo',caption:'  A quiet moment.  ',photo_credit:'  Jane Doe  '})).toMatchObject({caption:'A quiet moment.',photo_credit:'Jane Doe'});
    expect(validateStory({title:'Photo',photo_credit:'a'.repeat(600)}).photo_credit).toHaveLength(500);
    expect(validateStory({title:'Legacy',caption:'Existing caption'}).photo_credit).toBe('');
  });
  it('uses library descriptions only when image alt text is missing',()=>{
    const src='/media/12345678-1234-1234-1234-123456789abc';
    expect(cleanBody(`<img src="${src}">`,{[src]:'Felix and Megan at Crazy8s'})).toContain('alt="Felix and Megan at Crazy8s"');
    expect(cleanBody(`<img src="${src}" alt="Custom description">`,{[src]:'Library description'})).toContain('alt="Custom description"');
  });
  it('requires photo descriptions and photographer credit or Screenshot',()=>{
    expect(()=>validatePhotoMetadata({description:'A photo'})).toThrow();
    expect(()=>validatePhotoMetadata({description:'',is_screenshot:true})).toThrow();
    expect(validatePhotoMetadata({description:'App settings',is_screenshot:true})).toEqual({description:'App settings',photographer:'',is_screenshot:1});
    expect(validatePhotoMetadata({description:'Felix and Megan',photographer:'Jane Doe'}).photographer).toBe('Jane Doe');
  });
  it('renders per-story body captions and library credits without interpreting caption HTML',()=>{
    const src='/media/12345678-1234-1234-1234-123456789abc';
    const body=cleanBody(`<img src="${src}" data-caption="A &amp; B &lt;script&gt;" alt="Untrusted" data-photo-credit="Fake">`,{[src]:{description:'Two people',photographer:'Jane Doe',is_screenshot:0}});
    expect(body).toContain('alt="Two people"');expect(body).not.toContain('Fake');
    const html=articleBody(body);expect(html).toContain('<figure class="body-photo">');expect(html).toContain('Photograph: Jane Doe');expect(html).toContain('A &amp; B &lt;script&gt;');expect(html).not.toContain('<script>');
  });
  it('extracts unique media references',()=>{expect(mediaIds('/media/12345678-1234-1234-1234-123456789abc /media/12345678-1234-1234-1234-123456789abc')).toHaveLength(1);});
  it('builds readable stable slugs',()=>{expect(slugify('Café: A very big night!')).toBe('cafe-a-very-big-night');});
  it('allows only canonical YouTube and Vimeo embeds',()=>{
    expect(videoEmbed('https://youtu.be/dQw4w9WgXcQ')).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(videoEmbed('https://vimeo.com/123456789')).toBe('https://player.vimeo.com/video/123456789');
    expect(cleanBody('<iframe src="https://evil.test/steal"></iframe>')).not.toContain('iframe');
    expect(cleanBody('<iframe data-video="true" src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"></iframe>')).toContain('youtube-nocookie.com');
  });
});
describe('editorial identity',()=>{
  const contributor={email:'one@example.com',role:'contributor'} as User;
  it('limits contributors to their own stories',()=>{expect(canEdit(contributor,{author_email:'one@example.com'})).toBe(true);expect(canEdit(contributor,{author_email:'two@example.com'})).toBe(false);expect(canEdit({...contributor,role:'owner'},{author_email:'two@example.com'})).toBe(true);});
  it('fails closed on missing settings, missing or invalid tokens',async()=>{expect(await accessEmail(new Request('https://example.com'),'','')).toBe(null);expect(await accessEmail(new Request('https://example.com'),'demo.cloudflareaccess.com','aud')).toBe(null);expect(await accessEmail(new Request('https://example.com',{headers:{'Cf-Access-Jwt-Assertion':'fake'}}),'demo.cloudflareaccess.com','aud')).toBe(null);});
});
