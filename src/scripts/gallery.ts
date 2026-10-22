import '../styles/gallery-carousel.css';
import {galleryGrid,mountGalleryManager} from './gallery-manager';
import {mountCarousel} from './gallery-carousel';
import {captionParts} from '../lib/gallery-tags';
import {photoCredit} from '../lib/photo-metadata';
import type {GalleryPhoto} from '../lib/gallery';
import {openPhotoLibrary,type Photo} from './photo-library';
import type {PhotoMetadata} from '../lib/photo-metadata';
import type {GalleryPost} from '../lib/gallery';
import type {User} from '../lib/types';
const esc=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
type Options={main:HTMLElement;user:User;api:(path:string,init?:RequestInit)=>Promise<any>;upload:(file:File,metadata:PhotoMetadata)=>Promise<Photo>;toast:(message:string,error?:boolean)=>void;busy:(delta:number)=>void};
export async function mountGallery(options:Options){
 const {main,user,api,upload,toast,busy}=options;
 const posts:GalleryPost[]=await api('gallery');
 const key=`vv-gallery-draft:${user.email}`;
 let draft:{media_ids:string[];caption:string}={media_ids:[],caption:''};
 try{const saved=JSON.parse(localStorage.getItem(key)||'null');if(saved&&typeof saved.caption==='string'){const ids=Array.isArray(saved.media_ids)?saved.media_ids:saved.media_id?[saved.media_id]:[];draft={caption:saved.caption.slice(0,1000),media_ids:[...new Set<string>(ids.filter((id:unknown)=>typeof id==='string'&&/^[a-f0-9-]{36}$/.test(id)))].slice(0,10)};}}catch{}
 const persist=()=>{try{localStorage.setItem(key,JSON.stringify(draft));}catch{}};
 main.innerHTML=`<div class="desk-heading"><div><span class="eyebrow category">THE LITTLE THINGS</span><h1>Post a moment.</h1><p>A photo and a few words. No headline required.</p></div><a class="text-link" href="/gallery" target="_blank" rel="noopener">View Gallery ↗</a></div><form id="gallery-compose" class="admin-card gallery-compose"><div class="gallery-compose-author"><img class="contributor-portrait" src="${esc(user.avatar||'/profile-placeholder.svg')}" alt="" width="40" height="40" /><strong>${esc(user.name)}</strong></div><div id="gallery-selected"></div><button type="button" class="button secondary" id="gallery-choose">Add photos ＋</button><div class="form-group" style="margin-top:24px"><label class="form-label" for="gallery-caption">A few words · optional</label><textarea class="form-textarea" id="gallery-caption" maxlength="1000" placeholder="What’s the story? Add #shotoniphone or another hashtag.">${esc(draft.caption)}</textarea><small id="gallery-count"></small><p class="gallery-tag-hint">Hashtags in your caption become links to more posts with that tag.</p></div><p class="desk-note">Posting makes this photo and caption public immediately. You can edit the caption or hide the post below. Your unfinished post is saved on this browser.</p><div class="gallery-compose-actions"><button class="button secondary" id="gallery-preview" type="button">Preview post</button><button class="button" id="gallery-publish">Post to Gallery ↗</button></div><p id="gallery-post-status" role="status" aria-live="polite"></p></form><h2 class="gallery-manage-heading">${user.role==='owner'?'Everyone’s moments.':'Your moments.'}</h2><div class="gallery-manage-list">${galleryGrid(posts)}</div>`;
 const selected=main.querySelector<HTMLElement>('#gallery-selected')!;
 function selection(){
  selected.innerHTML=draft.media_ids.map((id,index)=>`<div class="gallery-selection"><img src="/media/${esc(id)}" alt="Selected photo ${index+1}" /><span>${index+1}${index===0?' · Cover':''}</span><div>${index>0?`<button type="button" data-move="${index}" data-direction="-1" aria-label="Move photo ${index+1} earlier">←</button>`:''}${index<draft.media_ids.length-1?`<button type="button" data-move="${index}" data-direction="1" aria-label="Move photo ${index+1} later">→</button>`:''}<button type="button" data-remove-photo="${index}" aria-label="Remove photo ${index+1}">×</button></div></div>`).join('');
  selected.querySelectorAll<HTMLButtonElement>('[data-remove-photo]').forEach(button=>button.addEventListener('click',()=>{draft.media_ids.splice(Number(button.dataset.removePhoto),1);persist();selection();}));
  selected.querySelectorAll<HTMLButtonElement>('[data-move]').forEach(button=>button.addEventListener('click',()=>{const from=Number(button.dataset.move);const to=from+Number(button.dataset.direction);[draft.media_ids[from],draft.media_ids[to]]=[draft.media_ids[to],draft.media_ids[from]];persist();selection();}));
  const choose=main.querySelector<HTMLButtonElement>('#gallery-choose')!;choose.disabled=draft.media_ids.length>=10;choose.textContent=`Add photos ＋ · ${draft.media_ids.length} / 10`;
 }
 selection();
 const caption=main.querySelector<HTMLTextAreaElement>('#gallery-caption')!;
 const count=()=>main.querySelector('#gallery-count')!.textContent=`${caption.value.length} / 1,000`;
 count();caption.addEventListener('input',()=>{draft.caption=caption.value;persist();count();});
 main.querySelector('#gallery-choose')!.addEventListener('click',()=>void openPhotoLibrary({api,upload,select:photo=>{if(draft.media_ids.includes(photo.id)){toast('That photo is already in this post.',true);return;}if(draft.media_ids.length>=10){toast('A post can have up to 10 photos.',true);return;}draft.media_ids.push(photo.id);persist();selection();}}));
 main.querySelector<HTMLButtonElement>('#gallery-preview')!.addEventListener('click',async()=>{
  if(!draft.media_ids.length){toast('Choose a photo to preview first.',true);return;}
  const button=main.querySelector<HTMLButtonElement>('#gallery-preview')!;button.disabled=true;busy(1);
  try{
   const {photos}:{photos:GalleryPhoto[]}=await api('gallery/preview',{method:'POST',body:JSON.stringify(draft)});
   const dialog=document.createElement('dialog');dialog.className='gallery-preview-dialog';dialog.setAttribute('aria-labelledby','gallery-preview-title');
   const date=new Date().toLocaleDateString('en-CA',{month:'short',day:'numeric',year:'numeric',timeZone:'America/Vancouver'});
   dialog.innerHTML=`<div class="gallery-preview-heading"><div><span class="eyebrow category">PRIVATE PREVIEW · NOT POSTED</span><h2 id="gallery-preview-title">Your moment.</h2></div><button type="button" class="back-button" id="close-gallery-preview">Back to editing ×</button></div><article class="gallery-preview-post"><header class="gallery-preview-author"><img class="contributor-portrait" src="${esc(user.avatar||'/profile-placeholder.svg')}" alt="" width="36" height="36" /><div><strong>${esc(user.name)}</strong><time>${esc(date)}</time></div></header><div class="moment-carousel" role="region" aria-roledescription="carousel" aria-label="Post photos"><div class="carousel-frame"><div class="carousel-track" tabindex="0" aria-label="Photos. Swipe or use left and right arrow keys.">${photos.map((photo,index)=>`<button class="carousel-slide" type="button" data-credit="${esc(photoCredit(photo))}" aria-label="Photo ${index+1} of ${photos.length}"><img src="/media/${esc(photo.media_id)}" alt="${esc(photo.description)}" /></button>`).join('')}</div>${photos.length>1?`<span class="carousel-count" aria-live="polite">1 / ${photos.length}</span>`:''}</div>${photos.length>1?`<div class="carousel-dots" aria-label="Choose a photo">${photos.map((_,index)=>`<button type="button" data-slide="${index}" aria-label="Photo ${index+1} of ${photos.length}"${index===0?' aria-current="true"':''}></button>`).join('')}</div>`:''}<p class="moment-credit">${esc(photoCredit(photos[0]))}</p></div>${draft.caption?`<p class="gallery-preview-caption">${captionParts(draft.caption).map(part=>part.tag?`<span class="gallery-preview-hashtag">${esc(part.text)}</span>`:esc(part.text)).join('')}</p>`:''}</article>`;
   document.body.append(dialog);dialog.showModal();
   const dispose=mountCarousel(dialog.querySelector('.moment-carousel')!,undefined,0,dialog);
   dialog.querySelector('#close-gallery-preview')!.addEventListener('click',()=>dialog.close());
   dialog.addEventListener('close',()=>{dispose();dialog.remove();button.focus();},{once:true});
   dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});
  }catch(error){toast((error as Error).message,true);}finally{busy(-1);button.disabled=false;}
 });
 main.querySelector<HTMLFormElement>('#gallery-compose')!.addEventListener('submit',async event=>{
  event.preventDefault();if(!draft.media_ids.length){toast('Choose a photo first.',true);return;}
  busy(1);const controls=main.querySelectorAll<HTMLInputElement|HTMLButtonElement|HTMLTextAreaElement>('#gallery-compose input,#gallery-compose button,#gallery-compose textarea');controls.forEach(el=>el.disabled=true);
  try{await api('gallery',{method:'POST',body:JSON.stringify(draft)});try{localStorage.removeItem(key);}catch{}await mountGallery(options);toast('Posted. Your moment is in the Gallery.');}catch(error){toast((error as Error).message,true);}finally{busy(-1);controls.forEach(el=>el.disabled=false);}
 });
 mountGalleryManager({main,posts,api,toast,busy,upload,refresh:()=>mountGallery(options)});
}
