import { Editor, Node as TiptapNode, mergeAttributes } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import ImageExtension from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { compressPhoto } from '../lib/compress';
import { videoEmbed } from '../lib/video';
import type {Story,User} from '../lib/types';
import { mountAds, canLeaveAds, disposeAds, adsUnsaved } from './ads';

const main=document.querySelector<HTMLElement>('#desk-main')!;
const toastEl=document.querySelector<HTMLElement>('#toast')!;
const escape=(value:unknown)=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const Video=TiptapNode.create({name:'videoEmbed',group:'block',atom:true,addAttributes(){return{src:{default:''}};},parseHTML(){return[{tag:'iframe[data-video]'}];},renderHTML({HTMLAttributes}){return ['iframe',mergeAttributes(HTMLAttributes,{'data-video':'true',title:'Embedded video',loading:'lazy',allowfullscreen:'',referrerpolicy:'strict-origin-when-cross-origin'})];}});
let user:User; let stories:Story[]=[];let current:Story|null=null;let editor:Editor|null=null;let dirty=false;let generation=0;
let timer:ReturnType<typeof setTimeout>|undefined;let toastTimer:ReturnType<typeof setTimeout>;let saving:Promise<boolean>|null=null;
let hero='';let uploading=0;let localPreview=false;
const formatBytes=(n:number)=>n>=1e9?`${(n/1e9).toFixed(2)} GB`:n>=1e6?`${(n/1e6).toFixed(1)} MB`:`${Math.ceil(n/1000)} KB`;
const fileLabel=(name:string)=>{try{return decodeURIComponent(name);}catch{return name;}};
function toast(message:string,isError=false){toastEl.textContent=message;toastEl.classList.toggle('error',isError);toastEl.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>toastEl.hidden=true,isError?12000:5500);}
async function api(path:string,init:RequestInit={}){
  const response=await fetch(`/api/${path}`,{...init,headers:{...(init.body && typeof init.body==='string'?{'Content-Type':'application/json'}:{}),...init.headers}});
  let data:any;try{data=await response.json();}catch{throw new Error('Connection interrupted. Your writing is still here; please retry.');}
  if(!response.ok)throw new Error(data.error||'Please try again in a moment.');return data;
}
const json=(data:unknown)=>JSON.stringify(data);
const statusLabel=(s:Story)=>s.status==='review'?'For review':s.status==='published'?'Published':s.published_json?'Draft changes · live version safe':'Draft';
const date=(s:string)=>new Date(s).toLocaleDateString('en-CA',{month:'short',day:'numeric'});
function heading(kicker:string,title:string,description:string,button=''){return `<div class="desk-heading"><div><span class="eyebrow category">${kicker}</span><h1>${title}</h1><p>${description}</p></div>${button}</div>`;}
function backupKey(){return `vv-recovery:${user.email}:${current?.id||'new'}`;}
function values(){return {title:(main.querySelector<HTMLTextAreaElement>('#story-title')?.value||'').trim(),deck:main.querySelector<HTMLTextAreaElement>('#story-deck')?.value||'',category:main.querySelector<HTMLSelectElement>('#story-category')?.value||'',body:editor?.getHTML()||'',hero,hero_alt:main.querySelector<HTMLInputElement>('#hero-alt')?.value||'',caption:main.querySelector<HTMLInputElement>('#hero-caption')?.value||''};}
function persist(){try{localStorage.setItem(backupKey(),json({...values(),revision:current?.revision||0}));}catch{/* Saving to server remains available if browser storage is full. */}}
function saveState(message:string){const el=main.querySelector('#save-state');if(el)el.textContent=message;}
function changed(){dirty=true;generation++;saveState('Unsaved changes');persist();clearTimeout(timer);timer=setTimeout(()=>void save(),1800);wordCount();}
function wordCount(){const text=editor?.getText().trim()||'';const count=text?text.split(/\s+/).length:0;const el=main.querySelector('#word-count');if(el)el.textContent=`${count} words · ${Math.max(1,Math.ceil(count/220))} min read`;}
async function save():Promise<boolean>{
  clearTimeout(timer);
  if(saving){const ok=await saving;if(!ok)return false;if(dirty)return save();return true;}
  if(!dirty)return true;
  const data=values();if(!data.title){saveState('Add a title to save');return false;}
  const capture=generation;saveState('Saving…');
  saving=(async()=>{
    try{
      const previousKey=backupKey();
      const saved:Story=await api(current?`stories/${current.id}`:'stories',{method:current?'PUT':'POST',body:json({...data,revision:current?.revision})});
      current=saved;history.replaceState(null,'',`/editor?story=${saved.id}`);
      if(capture===generation){dirty=false;try{localStorage.removeItem(previousKey);localStorage.removeItem(backupKey());}catch{}saveState('All changes saved');}
      else{persist();saveState('Saving latest changes…');}
      const status=main.querySelector('.editor-status-bar>span');if(status)status.textContent=statusLabel(saved);
      updatePreviewLink();return true;
    }catch(e){saveState('Not saved · retry');toast((e as Error).message,true);return false;}
    finally{saving=null;}
  })();
  const ok=await saving;if(ok&&dirty)return save();return ok;
}
function updatePreviewLink(){const link=main.querySelector<HTMLAnchorElement>('#preview-story');if(link&&current){link.href=`/preview/${current.id}`;link.removeAttribute('aria-disabled');}}
async function leave(){if(uploading){toast('Wait for the image to finish preparing.',true);return false;}if(!canLeaveAds())return false;if(dirty && !await save()){return confirm('Your latest changes have not saved. Leave this screen? A recovery copy stays in this browser.');}return true;}
function clearEditor(){clearTimeout(timer);editor?.destroy();editor=null;current=null;dirty=false;hero='';}
async function loadStories(){stories=await api('stories');const count=document.querySelector('#review-count');if(count)count.textContent=String(stories.filter(s=>s.status==='review').length);}
function storyList(review=false){
  const list=review?stories.filter(s=>s.status==='review'):stories;
  main.innerHTML=heading(review?'A SECOND PAIR OF EYES':'THE WRITING DESK',review?'Ready when you are.':'A story starts here.',review?'A little polish, a final look, then out into the world.':'Good news, new projects, or something worth a little attention.',review?'':'<button class="button" id="new-story">New story <span>＋</span></button>')+
  (list.length?`<div class="desk-story-list">${list.map(s=>`<article class="desk-story-row"><img src="${escape(s.hero||'/placeholder.svg')}" alt="" /><div><span class="status ${s.status}">${escape(statusLabel(s))}</span><h2><button data-open="${s.id}">${escape(s.title)}</button></h2><p>${escape(s.category||'Uncategorized')} · ${escape(date(s.updated_at))}${user.role==='owner'?` · ${escape(s.author_email.endsWith('.example')?s.author_email.split('@')[0]:s.author_email)}`:''}</p></div><button class="button secondary" data-open="${s.id}">${review?'Review':'Open'} ↗</button></article>`).join('')}</div>`:`<div class="desk-empty"><h2>${review?'All caught up.':'Your first story is waiting.'}</h2><p>${review?'New submissions will appear here.':'You don’t need a big announcement.<br />Start with something you want to share.'}</p>${!review?'<button class="button" id="first-story">Write something ↗</button>':''}</div>`)+
  `<div class="desk-note"><strong>${user.role==='owner'?'The editor’s note.':'Make yourself at home.'}</strong> ${user.role==='owner'?'Friends submit drafts here. You choose what goes live. Editing a published story keeps its live version intact until you publish the changes.':'Your stories save as you write. When you’re happy, submit one for review and the editor will take it from there.'}</div>`;
  main.querySelector('#new-story')?.addEventListener('click',()=>openStory());main.querySelector('#first-story')?.addEventListener('click',()=>openStory());
  main.querySelectorAll<HTMLElement>('[data-open]').forEach(el=>el.addEventListener('click',()=>openStory(el.dataset.open)));
}
async function openStory(id?:string){
  if(!await leave())return;clearEditor();
  try{
    if(id)current=await api(`stories/${id}`);
    let data:any=current||{title:'',deck:'',category:'',body:'',hero:'',hero_alt:'',caption:''};
    let recovered=false;
    try{const stored=JSON.parse(localStorage.getItem(backupKey())||'null');if(stored&&confirm('There is unsaved writing from this browser. Restore it?')){data={...data,...stored};recovered=true;}}catch{}
    hero=data.hero;
    main.innerHTML=`<div class="story-form"><div class="story-form-top"><button class="back-button" id="back-stories">← All stories</button><span class="save-state" id="save-state" aria-live="polite">${recovered?'Recovered writing · not yet saved':current?'All changes saved':'A fresh page'}</span><div class="story-controls"><a class="button secondary" id="preview-story" href="${current?`/preview/${current.id}`:'#'}" target="_blank" rel="noopener">Preview ↗</a><button class="button secondary" id="save-story">Save</button><button class="button" id="submit-story">${user.role==='owner'?'Publish story ↗':'Submit for review ↗'}</button></div></div>
    ${current?`<div class="editor-status-bar"><span>${escape(statusLabel(current))}${current.published_json&&current.status!=='published'?' · Readers still see the last approved version.':''}</span>${user.role==='owner'&&current.published_json?' <button class="back-button" id="unpublish-story">Unpublish</button>':''}${user.role==='owner'&&current.status==='review'?' <button class="back-button" id="return-story">Return to draft</button>':''}</div>`:''}
    <label class="form-label" for="story-category">FILE UNDER <span style="font-weight:400">· optional</span></label><select id="story-category" class="form-select editor-category"><option value="">Just a story</option>${['Achievements','Announcements','Projects'].map(c=>`<option${data.category===c?' selected':''}>${c}</option>`).join('')}</select>
    <label class="form-label" for="story-title" style="margin-top:30px">YOUR HEADLINE</label><textarea id="story-title" class="story-title-input" maxlength="180" placeholder="Something worth sharing…">${escape(data.title)}</textarea>
    <label class="form-label" for="story-deck">A LITTLE INTRODUCTION</label><textarea id="story-deck" class="story-deck-input" maxlength="500" placeholder="A sentence or two to set the scene.">${escape(data.deck)}</textarea>
    <div id="cover-area"></div><div class="cover-fields"><div class="form-group"><label class="form-label" for="hero-alt">Describe the cover photo</label><input id="hero-alt" class="form-input" value="${escape(data.hero_alt)}" maxlength="500" placeholder="What’s in the photo? For readers using screen readers." /></div><div class="form-group"><label class="form-label" for="hero-caption">Caption / photo credit</label><input id="hero-caption" class="form-input" value="${escape(data.caption)}" maxlength="500" placeholder="A little context. Credit where it’s due." /></div></div>
    <label class="form-label" id="body-label">THE STORY</label><div class="editor-toolbar" role="toolbar" aria-label="Text formatting"><button data-format="bold" title="Bold" aria-label="Bold"><strong>B</strong></button><button data-format="italic" title="Italic" aria-label="Italic"><em>I</em></button><button data-format="heading" title="Section heading" aria-label="Section heading">H₂</button><span class="toolbar-sep"></span><button data-format="bulletList" title="Bullet list" aria-label="Bullet list">☷</button><button data-format="blockquote" title="Quote" aria-label="Quote">❝</button><button data-format="link" title="Add a link" aria-label="Add a link">↗</button><span class="toolbar-sep"></span><button class="toolbar-image" id="body-photo">＋ Photo</button><input type="file" id="body-photo-input" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" hidden /><button data-format="undo" title="Undo" aria-label="Undo">↶</button><button data-format="redo" title="Redo" aria-label="Redo">↷</button></div><div id="body-editor"></div><div class="word-count"><span id="word-count">0 words</span><span>Photos prepared automatically · max 500 KB</span></div></div>`;
    editor=new Editor({element:main.querySelector('#body-editor')!,extensions:[Video,StarterKit.configure({heading:{levels:[2,3]},link:{openOnClick:false,protocols:['https']}}),ImageExtension.configure({allowBase64:false}),Placeholder.configure({placeholder:'Tell us what’s happening. Start anywhere.'})],content:data.body,editorProps:{attributes:{role:'textbox','aria-labelledby':'body-label','aria-multiline':'true'},handleDrop:(_view,event)=>{const file=event.dataTransfer?.files[0];if(file){event.preventDefault();void insertPhoto(file);return true;}return false;},handlePaste:(_view,event)=>{const file=event.clipboardData?.files[0];if(file){event.preventDefault();void insertPhoto(file);return true;}return false;}},onUpdate:changed});
    const videoButton=document.createElement('button');videoButton.type='button';videoButton.className='toolbar-image';videoButton.textContent='＋ Video';videoButton.setAttribute('aria-label','Embed a YouTube or Vimeo video');
    videoButton.addEventListener('click',()=>{const value=prompt('Paste a YouTube or Vimeo video link.');if(value===null)return;const src=videoEmbed(value.trim());if(!src){toast('Use an HTTPS YouTube or Vimeo video link.',true);return;}editor?.chain().focus().insertContent({type:'videoEmbed',attrs:{src}}).run();});
    main.querySelector('[data-format="undo"]')!.before(videoButton);
    renderCover();wordCount();
    main.querySelectorAll<HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement>('#story-title,#story-deck,#story-category,#hero-alt,#hero-caption').forEach(el=>el.addEventListener('input',changed));
    main.querySelector('#back-stories')!.addEventListener('click',()=>switchTab('stories'));
    main.querySelector('#save-story')!.addEventListener('click',async()=>{if(uploading){toast('Wait for your photo to finish.',true);return;}if(await save())toast('Saved. Your story is safe.');});
    main.querySelector('#preview-story')!.addEventListener('click',async event=>{event.preventDefault();if(uploading){toast('Wait for your photo to finish.',true);return;}if(await save()&&current)window.open(`/preview/${current.id}`,'_blank','noopener');else if(!current)toast('Add a headline and a little writing before previewing.',true);});
    main.querySelector('#submit-story')!.addEventListener('click',()=>runAction(user.role==='owner'?'publish':'submit'));
    main.querySelector('#unpublish-story')?.addEventListener('click',()=>{if(confirm('Take this story off the public magazine? Its draft will stay safe.'))void runAction('unpublish');});
    main.querySelector('#return-story')?.addEventListener('click',()=>runAction('return'));
    main.querySelectorAll<HTMLButtonElement>('[data-format]').forEach(b=>b.addEventListener('click',()=>format(b.dataset.format!)));
    main.querySelector('#body-photo')!.addEventListener('click',()=>main.querySelector<HTMLInputElement>('#body-photo-input')!.click());
    main.querySelector<HTMLInputElement>('#body-photo-input')!.addEventListener('change',e=>{const f=(e.target as HTMLInputElement).files?.[0];if(f)void insertPhoto(f);(e.target as HTMLInputElement).value='';});
    if(id)history.replaceState(null,'',`/editor?story=${id}`);else history.replaceState(null,'','/editor?new=1');
    if(recovered){dirty=true;generation++;persist();}
  }catch(e){toast((e as Error).message,true);await switchTab('stories');}
}
function format(name:string){if(!editor)return;const chain=editor.chain().focus();switch(name){case 'bold':chain.toggleBold().run();break;case 'italic':chain.toggleItalic().run();break;case 'heading':chain.toggleHeading({level:2}).run();break;case 'bulletList':chain.toggleBulletList().run();break;case 'blockquote':chain.toggleBlockquote().run();break;case 'undo':chain.undo().run();break;case 'redo':chain.redo().run();break;case 'link':{const href=prompt('Paste an https:// link. Leave empty to remove the link.',editor.getAttributes('link').href||'https://');if(href===null)return;if(!href){chain.unsetLink().run();return;}try{const url=new URL(href);if(url.protocol!=='https:')throw new Error();chain.setLink({href:url.href}).run();}catch{toast('Use a complete HTTPS link.',true);}break;}}}
function renderCover(){const area=main.querySelector('#cover-area');if(!area)return;area.innerHTML=hero?`<div class="cover-preview"><img src="${escape(hero)}" alt="Story cover preview" /><button id="remove-cover" type="button">Remove photo ×</button></div>`:`<label class="cover-drop" id="cover-drop"><span>＋</span><strong>Give your story a cover photo</strong><small>Drop a photo or tap to choose.<br />We’ll resize and compress it for you. Your original stays yours.</small><input type="file" id="cover-photo" aria-label="Upload a cover photo" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" /></label>`;
  area.querySelector('#remove-cover')?.addEventListener('click',()=>{hero='';renderCover();changed();});
  area.querySelector<HTMLInputElement>('#cover-photo')?.addEventListener('change',e=>{const f=(e.target as HTMLInputElement).files?.[0];if(f)void uploadCover(f);});
  const drop=area.querySelector('#cover-drop');drop?.addEventListener('dragover',e=>(e as DragEvent).preventDefault());drop?.addEventListener('drop',e=>{const event=e as DragEvent;event.preventDefault();const f=event.dataTransfer?.files[0];if(f)void uploadCover(f);});
}
async function upload(file:File){uploading++;toast('Preparing photo… We’ll take care of the size.');try{const blob=await compressPhoto(file);const photo=await api('media',{method:'POST',headers:{'Content-Type':blob.type,'X-File-Name':encodeURIComponent(file.name)},body:blob});toast(`Photo ready. ${formatBytes(file.size)} → ${formatBytes(photo.bytes)}`);return photo;}finally{uploading--;}}
async function uploadCover(file:File){try{const photo=await upload(file);hero=photo.url;renderCover();changed();}catch(e){toast((e as Error).message,true);const input=main.querySelector<HTMLInputElement>('#cover-photo');if(input)input.value='';}}
async function insertPhoto(file:File){try{const photo=await upload(file);const alt=prompt('Briefly describe this photo for readers using screen readers.','')||'';editor?.chain().focus().setImage({src:photo.url,alt}).run();}catch(e){toast((e as Error).message,true);}}
async function runAction(action:string){
  if(uploading){toast('Wait for your photo to finish preparing.',true);return;}
  if(!values().title){toast('Give your story a headline first.',true);main.querySelector<HTMLTextAreaElement>('#story-title')?.focus();return;}
  if(!await save()||!current)return;
  const buttons=main.querySelectorAll<HTMLButtonElement>('.story-controls button');buttons.forEach(b=>b.disabled=true);
  try{await api(`stories/${current.id}/${action}`,{method:'POST',body:json({revision:current.revision})});dirty=false;try{localStorage.removeItem(backupKey());}catch{}clearEditor();await loadStories();storyList();history.replaceState(null,'','/editor');toast(action==='publish'?'Published. Your story is out in the world.':action==='submit'?'Sent to the editor. Nice work.':action==='unpublish'?'Unpublished. The draft is still here.':'Returned to draft.');}catch(e){toast((e as Error).message,true);}finally{buttons.forEach(b=>b.disabled=false);}
}
async function mediaScreen(){
  const data=await api('media');
  main.innerHTML=heading('ROOM FOR YOUR GOOD PHOTOS','The photo library.','Only web-ready copies live here. Originals stay on your device.')+`<div class="storage-panel"><div class="storage-top"><h2>A little room to grow.</h2><span>${formatBytes(data.bytes)} / 7 GB</span></div><progress value="${data.bytes}" max="${data.cap}" aria-label="Media storage used"></progress><p>Each uploaded photo is automatically prepared at 500 KB or less. New uploads stop at 7 GB to leave free-tier headroom.${data.bytes>=data.cap*.8?' <strong>You’re close to the upload limit. Remove unused photos to make room.</strong>':''}</p></div>`+(data.items.length?`<div class="media-grid">${data.items.map((m:any)=>`<article class="media-tile"><img src="/media/${m.id}" alt="Uploaded library photo" loading="lazy" /><div><p>${escape(fileLabel(m.name))}</p><small>${formatBytes(m.bytes)}${m.uses?` · ${m.uses} story references`:''}</small>${user.role==='owner'?`<button data-delete-media="${m.id}">Remove unused photo</button>`:''}</div></article>`).join('')}</div>`:'<div class="desk-empty"><h2>A clean slate.</h2><p>Photos you upload while writing will appear here.</p></div>');
  main.querySelectorAll<HTMLElement>('[data-delete-media]').forEach(el=>el.addEventListener('click',async()=>{if(!confirm('Remove this unused web photo permanently? Keep a copy of the original yourself.'))return;try{await api(`media/${el.dataset.deleteMedia}`,{method:'DELETE'});await mediaScreen();toast('Unused photo removed.');}catch(e){toast((e as Error).message,true);}}));
}
async function peopleScreen(){
  const people:User[]=await api('users');main.innerHTML=heading('OUR PEOPLE','Good company.','Invite a friend, give them a byline, make room for their stories.')+`<div class="admin-grid"><section><form id="invite-form" class="admin-card"><h2>Make an introduction.</h2><div class="form-group"><label class="form-label" for="invite-name">Their name</label><input class="form-input" id="invite-name" name="name" required maxlength="100" /></div><div class="form-group"><label class="form-label" for="invite-email">Email address</label><input class="form-input" id="invite-email" name="email" type="email" required /></div><div class="form-group"><label class="form-label" for="invite-bio">A little about them</label><textarea class="form-textarea" id="invite-bio" name="bio" maxlength="500"></textarea></div><div class="form-group"><label class="form-label" for="invite-link">Website or portfolio · optional</label><input class="form-input" id="invite-link" name="link" type="url" placeholder="https://" /></div><button class="button">Add contributor ↗</button></form><p class="desk-note">${localPreview?'Local preview uses sample accounts. Real email codes are connected during Cloudflare setup.':'Add the same email to the Cloudflare Access allow-list. The friend can then visit /editor and request their sign-in code.'}</p></section><section>${people.map(p=>`<article class="admin-card"><span class="eyebrow category">${p.active?p.role:'Inactive'}</span><h3 style="margin-top:12px">${escape(p.name)}</h3><p>${escape(p.email)}</p><p>${escape(p.bio)}</p>${p.role!=='owner'&&p.active?`<button class="button secondary" data-remove-user="${escape(p.email)}">Remove editor access</button>`:''}</article>`).join('')}</section></div>`;
  main.querySelector<HTMLFormElement>('#invite-form')!.addEventListener('submit',async e=>{e.preventDefault();const form=e.target as HTMLFormElement;try{const result=await api('users',{method:'POST',body:json(Object.fromEntries(new FormData(form)))});await peopleScreen();toast(localPreview?'Contributor added to the local preview.':result.note);}catch(err){toast((err as Error).message,true);}});
  main.querySelectorAll<HTMLElement>('[data-remove-user]').forEach(el=>el.addEventListener('click',async()=>{if(!confirm('Remove this person’s access? Their published stories will stay.'))return;try{await api(`users/${encodeURIComponent(el.dataset.removeUser!)}`,{method:'DELETE'});await peopleScreen();toast('Contributor access removed.');}catch(e){toast((e as Error).message,true);}}));
}
async function switchTab(next:string){if(!await leave())return;disposeAds();clearEditor();if(next==='promotions')next='ads';history.replaceState(null,'',`/editor${next!=='stories'?`?tab=${next}`:''}`);document.querySelectorAll<HTMLElement>('.desk-tab').forEach(el=>{el.classList.toggle('active',el.dataset.tab===next);if(el.dataset.tab===next)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');});
  try{if(next==='stories'||next==='review'){await loadStories();storyList(next==='review');}else if(next==='media')await mediaScreen();else if(next==='people')await peopleScreen();else if(next==='ads')await mountAds({main,api,toast,busy:delta=>{uploading+=delta;},openLibrary:()=>void switchTab('media')});}catch(e){toast((e as Error).message,true);main.innerHTML='<div class="desk-empty"><h2>We couldn’t open this just yet.</h2><p>Check your connection, then try the tab again.</p></div>';}}
document.querySelectorAll<HTMLElement>('[data-tab]').forEach(el=>el.addEventListener('click',()=>switchTab(el.dataset.tab!)));
document.querySelector<HTMLSelectElement>('#preview-role')?.addEventListener('change',async (e:Event)=>{if(!await leave())return;try{await api('preview-role',{method:'POST',body:json({role:(e.target as HTMLSelectElement).value})});location.href='/editor';}catch(err){toast((err as Error).message,true);}});
window.addEventListener('beforeunload',e=>{if(dirty||uploading||adsUnsaved()){if(dirty)persist();e.preventDefault();}});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&dirty){persist();void save();}});
async function init(){try{const session=await api('session');user=session.user;localPreview=session.localPreview;await loadStories();const params=new URLSearchParams(location.search);if(params.has('story'))await openStory(params.get('story')!);else if(params.has('new'))await openStory();else await switchTab(params.get('tab')||'stories');}catch(e){main.innerHTML='<div class="desk-empty"><h2>The desk is temporarily unavailable.</h2><p>Check your connection and reload to try again.</p></div>';toast((e as Error).message,true);}}
void init();
