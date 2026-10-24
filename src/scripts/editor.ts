import {showSitePreview} from './site-preview';
import {openInlinePhotoEditor} from './inline-photo';
import {mountActivity} from './activity';
import {postDateInput} from '../lib/post-date';
import { Editor, Node as TiptapNode, mergeAttributes } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import ImageExtension from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import {filterStories,emptyStoryFilters,type StoryFilters} from '../lib/story-filters';
import {photoCredit,type PhotoMetadata} from '../lib/photo-metadata';
import { openPhotoLibrary } from './photo-library';
import { compressPhoto } from '../lib/compress';
import { videoEmbed } from '../lib/video';
import type {Story,User} from '../lib/types';
import {mountTrash} from './trash';
import {mountGallery} from './gallery';
import { mountAds, canLeaveAds, disposeAds, adsUnsaved } from './ads';

const main=document.querySelector<HTMLElement>('#desk-main')!;
const toastEl=document.querySelector<HTMLElement>('#toast')!;
const escape=(value:unknown)=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const StoryImage=ImageExtension.extend({
  addNodeView(){return ({node,editor:target,getPos})=>{
    const dom=document.createElement('div');dom.className='story-image-node';dom.contentEditable='false';
    const img=document.createElement('img');img.draggable=false;
    const button=document.createElement('button');button.type='button';button.className='story-image-edit';button.textContent='✎ Edit photo';button.setAttribute('aria-label','Edit photo layout and caption');
    const render=(value:typeof node)=>{img.src=value.attrs.src;img.alt=value.attrs.alt||'';dom.dataset.size=value.attrs.size||'full';dom.dataset.align=value.attrs.align||'none';};render(node);dom.append(img,button);
    button.addEventListener('mousedown',event=>event.preventDefault());button.addEventListener('click',()=>openInlinePhotoEditor(target,getPos,select=>{void openPhotoLibrary({api,upload,select});}));
    return {dom,update(next){if(next.type.name!=='image')return false;render(next);return true;},selectNode(){dom.classList.add('is-selected');},deselectNode(){dom.classList.remove('is-selected');},stopEvent:event=>button.contains(event.target as globalThis.Node),ignoreMutation:()=>true};
  };},
  addAttributes(){return {...this.parent?.(),size:{default:'full',parseHTML:element=>element.getAttribute('data-size')||'full',renderHTML:attrs=>({'data-size':attrs.size})},align:{default:'none',parseHTML:element=>element.getAttribute('data-align')||'none',renderHTML:attrs=>({'data-align':attrs.align})},caption:{default:'',parseHTML:element=>element.getAttribute('data-caption')||'',renderHTML:attributes=>({'data-caption':attributes.caption})},photo_credit:{default:'',parseHTML:element=>element.getAttribute('data-photo-credit')||'',renderHTML:attributes=>({'data-photo-credit':attributes.photo_credit})}};},
});
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
  if(!response.ok)throw new Error(data.error||'Please try again in a moment.');if(init.method&&!['GET','HEAD'].includes(init.method)&&path!=='activity/read'&&user)void refreshActivityBadge();return data;
}
const json=(data:unknown)=>JSON.stringify(data);
const statusLabel=(s:Story)=>s.status==='review'?'For review':s.status==='published'?'Published':s.published_json?'Draft changes · live version safe':'Draft';
const date=(s:string)=>new Date(s).toLocaleDateString('en-CA',{month:'short',day:'numeric',timeZone:'America/Vancouver'});
function heading(kicker:string,title:string,description:string,button=''){return `<div class="desk-heading"><div><span class="eyebrow category">${kicker}</span><h1>${title}</h1><p>${description}</p></div>${button}</div>`;}
function backupKey(){return `vv-recovery:${user.email}:${current?.id||'new'}`;}
function values(){return {...(user.role==='owner'?{post_date:main.querySelector<HTMLInputElement>('#story-date')?.value||''}:{}),title:(main.querySelector<HTMLTextAreaElement>('#story-title')?.value||'').trim(),deck:main.querySelector<HTMLTextAreaElement>('#story-deck')?.value||'',category:main.querySelector<HTMLSelectElement>('#story-category')?.value||'',body:editor?.getHTML()||'',hero,hero_alt:main.querySelector<HTMLInputElement>('#hero-alt')?.value||'',caption:main.querySelector<HTMLTextAreaElement>('#hero-caption')?.value||'',photo_credit:main.querySelector<HTMLInputElement>('#hero-credit')?.value||''};}
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
async function leave(){if(uploading){toast('Wait for the current operation to finish.',true);return false;}if(!canLeaveAds())return false;if(dirty && !await save()){return confirm('Your latest changes have not saved. Leave this screen? A recovery copy stays in this browser.');}return true;}
function clearEditor(){clearTimeout(timer);editor?.destroy();editor=null;current=null;dirty=false;hero='';}
async function loadStories(){stories=await api('stories');const count=document.querySelector('#review-count');if(count)count.textContent=String(stories.filter(s=>s.status==='review').length);}
const storyListFilters={all:emptyStoryFilters(),review:emptyStoryFilters()};
function storyList(review=false){
  const owner=user.role==='owner';const source=review?stories.filter(s=>s.status==='review'):stories;
  const filters=storyListFilters[review?'review':'all'];
  const contributors=[...new Map(stories.map(story=>[story.author_email,story.author_name||story.author_email])).entries()].sort((a,b)=>a[1].localeCompare(b[1]));
  const option=(value:string,label:string,selected:string)=>`<option value="${escape(value)}"${value===selected?' selected':''}>${escape(label)}</option>`;
  main.innerHTML=heading(review?'A SECOND PAIR OF EYES':'THE KITCHEN',review?'Ready when you are.':owner?'All stories.':'A story starts here.',review?'A little polish, a final look, then out into the world.':owner?'Everyone’s writing, in one place. Find a story by contributor, topic, or when it was posted.':'Good news, new projects, or something worth a little attention.',review?'':'<button class="button" id="new-story">New story <span>＋</span></button>')+
  (`<div class="story-filters" role="search" aria-label="Filter stories"><div class="story-filter-search"><label class="form-label" for="story-filter-search">Find a story</label><input type="search" id="story-filter-search" class="form-input" data-filter="search" placeholder="Search headlines, introductions, or contributors…" value="${escape(filters.search)}" /></div>${owner?`<div><label class="form-label" for="story-filter-contributor">Contributor</label><select id="story-filter-contributor" class="form-select" data-filter="contributor">${option('','All contributors',filters.contributor)}${contributors.map(([email,name])=>option(email,name,filters.contributor)).join('')}</select></div>`:''}<div><label class="form-label" for="story-filter-topic">Category</label><select id="story-filter-topic" class="form-select" data-filter="topic">${['','Achievements','Announcements','Projects','uncategorized'].map((value,i)=>option(value,['All categories','Achievements','Announcements','Projects','Uncategorized'][i],filters.topic)).join('')}</select></div><div><label class="form-label" for="story-filter-status">Status</label><select id="story-filter-status" class="form-select" data-filter="status">${['','draft','published','review'].map((value,i)=>option(value,['Drafts & published','Drafts only','Published only','Awaiting review'][i],filters.status)).join('')}</select></div><div><label class="form-label" for="story-filter-from">Posted from</label><input id="story-filter-from" class="form-input" type="date" data-filter="from" value="${escape(filters.from)}" /></div><div><label class="form-label" for="story-filter-to">Posted through</label><input id="story-filter-to" class="form-input" type="date" data-filter="to" value="${escape(filters.to)}" /></div><div><label class="form-label" for="story-filter-sort">Sort by</label><select id="story-filter-sort" class="form-select" data-filter="sort">${['updated','posted-newest','posted-oldest','title'].map((value,i)=>option(value,['Recently updated','Newest posted','Oldest posted','Headline A–Z'][i],filters.sort)).join('')}</select></div></div><div class="story-filter-summary"><span id="story-filter-count" role="status" aria-live="polite"></span><button type="button" class="back-button" id="clear-story-filters">Clear filters</button></div>`)+
  '<div id="story-list-results"></div>'+`<div class="desk-note"><strong>${owner?'The editor’s note.':'Make yourself at home.'}</strong> ${owner?'Friends submit drafts here. You choose what goes live. Editing a published story keeps its live version intact until you publish the changes.':'Your stories save as you write. When you’re happy, submit one for review and the editor will take it from there.'}</div>`;
  function renderRows(){
    const list=filterStories(source,filters);
    const invalid=Boolean(filters.from&&filters.to&&filters.from>filters.to);
    const count=main.querySelector('#story-filter-count');if(count)count.textContent=invalid?'Choose an end date on or after the start date.':`${list.length} of ${source.length} stories${filters.from||filters.to?' · publication dates in Vancouver time':''}`;
    const to=main.querySelector<HTMLInputElement>('#story-filter-to');if(to){to.min=filters.from;to.setCustomValidity(invalid?'Choose an end date on or after the start date.':'');}
    main.querySelector('#story-list-results')!.innerHTML=list.length?`<div class="desk-story-list">${list.map(story=>`<article class="desk-story-row"><img src="${escape(story.hero||'/placeholder.svg')}" alt="" /><div><span class="status ${story.status}">${escape(statusLabel(story))}</span><h2><button data-open="${escape(story.id)}">${escape(story.title)}</button></h2><p>${escape(story.category||'Uncategorized')}${owner?` · ${escape(story.author_name||story.author_email)}`:''} · ${story.published_at?`Posted ${escape(date(story.published_at))}`:`Not posted · Updated ${escape(date(story.updated_at))}`}</p></div><button class="button secondary" data-open="${escape(story.id)}">${review?'Review':'Open'} ↗</button></article>`).join('')}</div>`:`<div class="desk-empty"><h2>${source.length?'No stories match.':review?'All caught up.':'Your first story is waiting.'}</h2><p>${source.length?'Try another category, status, contributor, or date range.':review?'New submissions will appear here.':'You don’t need a big announcement.<br />Start with something you want to share.'}</p>${!source.length&&!review?'<button class="button" id="first-story">Write something ↗</button>':''}</div>`;
    main.querySelectorAll<HTMLElement>('[data-open]').forEach(button=>button.addEventListener('click',()=>openStory(button.dataset.open)));
    main.querySelector('#first-story')?.addEventListener('click',()=>openStory());
  }
  main.querySelector('#new-story')?.addEventListener('click',()=>openStory());
  main.querySelectorAll<HTMLInputElement|HTMLSelectElement>('[data-filter]').forEach(input=>input.addEventListener(input.tagName==='SELECT'?'change':'input',()=>{filters[input.dataset.filter as keyof StoryFilters]=input.value;renderRows();}));
  main.querySelector('#clear-story-filters')?.addEventListener('click',()=>{Object.assign(filters,emptyStoryFilters());main.querySelectorAll<HTMLInputElement|HTMLSelectElement>('[data-filter]').forEach(input=>{input.value=filters[input.dataset.filter as keyof StoryFilters];});renderRows();});
  renderRows();
}
async function openStory(id?:string){
  if(!await leave())return;clearEditor();
  try{
    if(id)current=await api(`stories/${id}`);
    let data:any=current||{title:'',deck:'',category:'',body:'',hero:'',hero_alt:'',caption:'',photo_credit:''};
    let recovered=false;
    try{const stored=JSON.parse(localStorage.getItem(backupKey())||'null');if(stored&&confirm('There is unsaved writing from this browser. Restore it?')){data={...data,...stored};recovered=true;}}catch{}
    hero=data.hero;
    main.innerHTML=`<div class="story-form"><div class="story-form-top"><button class="back-button" id="back-stories">← ${user.role==='owner'?'All stories':'My stories'}</button><span class="save-state" id="save-state" aria-live="polite">${recovered?'Recovered writing · not yet saved':current?'All changes saved':'A fresh page'}</span><div class="story-controls"><a class="button secondary" id="preview-story" href="${current?`/preview/${current.id}`:'#'}" target="_blank" rel="noopener">Preview ↗</a><button class="button secondary" id="save-story">Save</button><button class="button" id="submit-story">${user.role==='owner'?'Publish story ↗':'Submit for review ↗'}</button></div></div>
    ${current?`<div class="editor-status-bar"><span>${escape(statusLabel(current))}${current.published_json&&current.status!=='published'?' · Readers still see the last approved version.':''}</span>${user.role==='owner'&&current.published_json?' <button class="back-button" id="unpublish-story">Unpublish</button>':''}${user.role==='owner'||!current.published_json?' <button class="back-button" id="trash-story">Move to Trash</button>':''}${user.role==='owner'&&current.status==='review'?' <button class="back-button" id="return-story">Return to draft</button>':''}</div>`:''}
    <label class="form-label" for="story-category">FILE UNDER <span style="font-weight:400">· optional</span></label><select id="story-category" class="form-select editor-category"><option value="">Just a story</option>${['Achievements','Announcements','Projects'].map(c=>`<option${data.category===c?' selected':''}>${c}</option>`).join('')}</select>
    ${user.role==='owner'?`<label class="form-label" for="story-date">PUBLICATION DATE</label><input class="form-input" type="date" id="story-date" value="${escape(data.post_date ?? postDateInput(data.published_at))}" /><p class="desk-note">Leave blank to use the day you publish. Date changes appear after publishing the updated story. This does not schedule publication.</p>`:''}
    <label class="form-label" for="story-title" style="margin-top:30px">YOUR HEADLINE</label><textarea id="story-title" class="story-title-input" maxlength="180" placeholder="Something worth sharing…">${escape(data.title)}</textarea>
    <label class="form-label" for="story-deck">A LITTLE INTRODUCTION</label><textarea id="story-deck" class="story-deck-input" maxlength="500" placeholder="A sentence or two to set the scene.">${escape(data.deck)}</textarea>
    <div id="cover-area"></div><div class="cover-fields"><input type="hidden" id="hero-alt" value="${escape(data.hero_alt)}" /><div class="form-group"><label class="form-label" for="hero-caption">Caption</label><textarea id="hero-caption" class="form-input caption-input" rows="1" maxlength="500" placeholder="A little context for the cover photo.">${escape(data.caption)}</textarea></div><div class="form-group"><label class="form-label" for="hero-credit">Photo credit</label><input id="hero-credit" class="form-input" readonly value="${escape(data.photo_credit)}" maxlength="500" placeholder="Added from the Photo library" /></div><p class="photo-metadata-note">Captions appear below photos. Use *italics* for titles. Photo descriptions are metadata for search and screen readers, and are managed in the <button type="button" class="back-button" id="cover-library-link">Photo library ↗</button>. Write your caption here for this story.</p></div>
    <label class="form-label" id="body-label">THE STORY</label><div class="editor-toolbar" role="toolbar" aria-label="Text formatting"><button data-format="bold" title="Bold" aria-label="Bold"><strong>B</strong></button><button data-format="italic" title="Italic" aria-label="Italic"><em>I</em></button><button data-format="heading" title="Section heading" aria-label="Section heading">H₂</button><span class="toolbar-sep"></span><button data-format="bulletList" title="Bullet list" aria-label="Bullet list">☷</button><button data-format="blockquote" title="Quote" aria-label="Quote">❝</button><button data-format="link" title="Add a link" aria-label="Add a link">↗</button><span class="toolbar-sep"></span><button class="toolbar-image" id="body-photo">＋ Photo</button><button data-format="undo" title="Undo" aria-label="Undo">↶</button><button data-format="redo" title="Redo" aria-label="Redo">↷</button></div><div id="body-editor"></div><div class="word-count"><span id="word-count">0 words</span><span>Hover over a photo and choose Edit photo · max 500 KB</span></div></div>`;
    editor=new Editor({element:main.querySelector('#body-editor')!,extensions:[Video,StarterKit.configure({heading:{levels:[2,3]},link:{openOnClick:false,protocols:['https']}}),StoryImage.configure({allowBase64:false}),Placeholder.configure({placeholder:'Tell us what’s happening. Start anywhere.'})],content:data.body,editorProps:{attributes:{role:'textbox','aria-labelledby':'body-label','aria-multiline':'true'},handleDrop:(_view,event)=>{const file=event.dataTransfer?.files[0];if(file){event.preventDefault();void insertPhoto(file);return true;}return false;},handlePaste:(_view,event)=>{const file=event.clipboardData?.files[0];if(file){event.preventDefault();void insertPhoto(file);return true;}return false;}},onUpdate:changed});
    const videoButton=document.createElement('button');videoButton.type='button';videoButton.className='toolbar-image';videoButton.textContent='＋ Video';videoButton.setAttribute('aria-label','Embed a YouTube or Vimeo video');
    videoButton.addEventListener('click',()=>{const value=prompt('Paste a YouTube or Vimeo video link.');if(value===null)return;const src=videoEmbed(value.trim());if(!src){toast('Use an HTTPS YouTube or Vimeo video link.',true);return;}editor?.chain().focus().insertContent({type:'videoEmbed',attrs:{src}}).run();});
    main.querySelector('[data-format="undo"]')!.before(videoButton);
    renderCover();wordCount();
    main.querySelector('#cover-library-link')?.addEventListener('click',()=>void switchTab('media'));
    main.querySelectorAll<HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement>('#story-title,#story-deck,#story-category,#hero-caption,#story-date').forEach(el=>el.addEventListener('input',changed));
    main.querySelector('#back-stories')!.addEventListener('click',()=>switchTab('stories'));
    main.querySelector('#save-story')!.addEventListener('click',async()=>{if(uploading){toast('Wait for your photo to finish.',true);return;}if(await save())toast('Saved. Your story is safe.');});
    main.querySelector('#preview-story')!.addEventListener('click',async event=>{event.preventDefault();if(uploading){toast('Wait for your photo to finish.',true);return;}if(await save()&&current)window.open(`/preview/${current.id}`,'_blank','noopener');else if(!current)toast('Add a headline and a little writing before previewing.',true);});
    main.querySelector('#submit-story')!.addEventListener('click',()=>runAction(user.role==='owner'?'publish':'submit'));
    main.querySelector('#unpublish-story')?.addEventListener('click',()=>{if(confirm('Take this story off the public magazine? Its draft will stay safe.'))void runAction('unpublish');});
    main.querySelector('#trash-story')?.addEventListener('click',async()=>{
      if(uploading){toast('Wait for the current operation to finish.',true);return;}
      if(!await save()||!current)return;
      uploading++;try{await api(`stories/${current.id}`,{method:'DELETE',body:json({revision:current.revision})});try{localStorage.removeItem(backupKey());}catch{}clearEditor();await loadStories();storyList();history.replaceState(null,'','/editor');toast('Article moved to Trash. You can restore it within 30 days.');}catch(error){toast((error as Error).message,true);}finally{uploading--;}
    });
    main.querySelector('#return-story')?.addEventListener('click',()=>runAction('return'));
    main.querySelectorAll<HTMLButtonElement>('[data-format]').forEach(b=>b.addEventListener('click',()=>format(b.dataset.format!)));
    main.querySelector('#body-photo')!.addEventListener('click',()=>insertPhoto());
    if(id)history.replaceState(null,'',`/editor?story=${id}`);else history.replaceState(null,'','/editor?new=1');
    if(recovered){dirty=true;generation++;persist();}
  }catch(e){toast((e as Error).message,true);await switchTab('stories');}
}
function format(name:string){if(!editor)return;const chain=editor.chain().focus();switch(name){case 'bold':chain.toggleBold().run();break;case 'italic':chain.toggleItalic().run();break;case 'heading':chain.toggleHeading({level:2}).run();break;case 'bulletList':chain.toggleBulletList().run();break;case 'blockquote':chain.toggleBlockquote().run();break;case 'undo':chain.undo().run();break;case 'redo':chain.redo().run();break;case 'link':{const href=prompt('Paste an https:// link. Leave empty to remove the link.',editor.getAttributes('link').href||'https://');if(href===null)return;if(!href){chain.unsetLink().run();return;}try{const url=new URL(href);if(url.protocol!=='https:')throw new Error();chain.setLink({href:url.href}).run();}catch{toast('Use a complete HTTPS link.',true);}break;}}}
function renderCover(){const area=main.querySelector('#cover-area');if(!area)return;area.innerHTML=hero?`<div class="cover-preview"><img src="${escape(hero)}" alt="Story cover preview" /><div class="cover-photo-actions"><button id="replace-cover" type="button">Replace photo</button><button id="remove-cover" type="button">Remove photo ×</button></div></div>`:`<button type="button" class="cover-drop" id="cover-drop"><span>＋</span><strong>Give your story a cover photo</strong><small>Drop a photo or open your library.<br />We’ll resize and compress it for you. Your original stays yours.</small></button>`;
  area.querySelector('#replace-cover')?.addEventListener('click',()=>uploadCover());
  area.querySelector('#remove-cover')?.addEventListener('click',()=>{hero='';renderCover();changed();});
  area.querySelector('#cover-drop')?.addEventListener('click',()=>uploadCover());
  const drop=area.querySelector('#cover-drop');drop?.addEventListener('dragover',e=>(e as DragEvent).preventDefault());drop?.addEventListener('drop',e=>{const event=e as DragEvent;event.preventDefault();const f=event.dataTransfer?.files[0];if(f)void uploadCover(f);});
}
async function upload(file:File,metadata:PhotoMetadata){uploading++;toast('Preparing photo… We’ll take care of the size.');try{const blob=await compressPhoto(file);const photo=await api('media',{method:'POST',headers:{'Content-Type':blob.type,'X-File-Name':encodeURIComponent(file.name),'X-Photo-Description':encodeURIComponent(metadata.description),'X-Photo-Photographer':encodeURIComponent(metadata.photographer),'X-Photo-Screenshot':String(Boolean(metadata.is_screenshot))},body:blob});toast(`Photo ready. ${formatBytes(file.size)} → ${formatBytes(photo.bytes)}`);return photo;}finally{uploading--;}}
function uploadCover(file?:File){void openPhotoLibrary({api,upload,initialFile:file,openLibrary:()=>void switchTab('media'),select:photo=>{hero=photo.url;const alt=main.querySelector<HTMLInputElement>('#hero-alt');if(alt)alt.value=photo.description;const credit=main.querySelector<HTMLInputElement>('#hero-credit');if(credit)credit.value=photoCredit(photo);renderCover();changed();}});}
function insertPhoto(file?:File){
  const target=editor;const position=target?.state.selection.from;
  void openPhotoLibrary({api,upload,initialFile:file,openLibrary:()=>void switchTab('media'),select:photo=>{if(!target||target.isDestroyed)return;const chain=target.chain().focus();if(position!==undefined)chain.setTextSelection(Math.min(position,target.state.doc.content.size));chain.insertContent({type:'image',attrs:{src:photo.url,alt:photo.description,caption:'',photo_credit:photoCredit(photo)}}).run();let inserted:number|undefined;target.state.doc.descendants((node,pos)=>{if(node.type.name==='image'&&node.attrs.src===photo.url&&inserted===undefined)inserted=pos;});if(inserted!==undefined)target.commands.setNodeSelection(inserted);}});
}
async function runAction(action:string){
  if(uploading){toast('Wait for your photo to finish preparing.',true);return;}
  if(!values().title){toast('Give your story a headline first.',true);main.querySelector<HTMLTextAreaElement>('#story-title')?.focus();return;}
  if(!await save()||!current)return;
  const buttons=main.querySelectorAll<HTMLButtonElement>('.story-controls button');buttons.forEach(b=>b.disabled=true);
  try{await api(`stories/${current.id}/${action}`,{method:'POST',body:json({revision:current.revision})});dirty=false;try{localStorage.removeItem(backupKey());}catch{}clearEditor();await loadStories();storyList();history.replaceState(null,'','/editor');toast(action==='publish'?'Published. Your story is out in the world.':action==='submit'?'Sent to the editor. Nice work.':action==='unpublish'?'Unpublished. The draft is still here.':'Returned to draft.');}catch(e){toast((e as Error).message,true);}finally{buttons.forEach(b=>b.disabled=false);}
}
async function mediaScreen(){
  const data=await api('media');
  main.innerHTML=heading('ROOM FOR YOUR GOOD PHOTOS','The photo library.','Only web-ready copies live here. Originals stay on your device.','<button class="button" id="library-add-photo">Upload photo ＋</button>')+`<label class="form-label" for="media-search">Find a photo</label><input class="form-input" type="search" id="media-search" placeholder="Search descriptions or filenames…" />`+`<div class="storage-panel"><div class="storage-top"><h2>A little room to grow.</h2><span>${formatBytes(data.bytes)} / ${formatBytes(data.cap)}</span></div><progress value="${data.bytes}" max="${data.cap}" aria-label="Media storage used"></progress><p>Each uploaded photo is automatically prepared at 500 KB or less. New uploads stop at 300 MB to leave room for articles within the free database limit.${data.bytes>=data.cap*.8?' <strong>You’re close to the upload limit. Remove unused photos to make room.</strong>':''}</p></div>`+(data.items.length?`<div class="media-grid">${data.items.map((m:any)=>`<article class="media-tile"><button type="button" class="media-tile-open" data-edit-media="${m.id}" aria-label="Edit photo: ${escape(m.description||fileLabel(m.name))}"></button><img src="/media/${m.id}" alt="${escape(m.description||fileLabel(m.name))}" loading="lazy" /><div><p>${escape(m.description||fileLabel(m.name))}</p><small>${escape(photoCredit(m)||'Credit needed')} · ${formatBytes(m.bytes)}${m.uses?` · ${m.uses} story references`:''}</small></div></article>`).join('')}</div>`:'<div class="desk-empty"><h2>A clean slate.</h2><p>Photos you upload while writing will appear here.</p></div>');
  main.querySelectorAll<HTMLElement>('[data-edit-media]').forEach(button=>button.addEventListener('click',()=>void openPhotoLibrary({api,upload,editPhoto:data.items.find((photo:any)=>photo.id===button.dataset.editMedia),...(user.role==='owner'?{remove:async(photo:any)=>{await api(`media/${photo.id}`,{method:'DELETE'});await mediaScreen();toast('Unused photo removed.');}}:{}),select:()=>void mediaScreen()})));
  main.querySelector('#library-add-photo')?.addEventListener('click',()=>void openPhotoLibrary({api,upload,select:()=>void mediaScreen()}));
  main.querySelector<HTMLInputElement>('#media-search')?.addEventListener('input',event=>{const query=(event.target as HTMLInputElement).value.trim().toLocaleLowerCase();main.querySelectorAll<HTMLElement>('.media-tile').forEach((tile,i)=>{tile.hidden=!`${data.items[i].description} ${fileLabel(data.items[i].name)} ${data.items[i].photographer} ${data.items[i].is_screenshot ? "screenshot" : ""}`.toLocaleLowerCase().includes(query);});});

}
async function profileScreen(){
  main.innerHTML=heading('YOUR BYLINE','A face to the name.','Your portrait appears above your byline and on your contributor page.')+`<section class="admin-card profile-card"><h2>${escape(user.name)}</h2>${user.avatar?`<img class="contributor-portrait profile-preview" src="${escape(user.avatar)}" alt="Your profile photo" width="120" height="120" />`:'<img class="contributor-portrait profile-preview" src="/profile-placeholder.svg" alt="Profile picture placeholder" width="120" height="120" />'}<p class="desk-note">Choose a portrait with your face near the centre. We display it in a black-and-white circle.</p><label class="form-label" for="profile-photo">Profile photo</label><input class="form-input" id="profile-photo" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" />${user.avatar?'<button class="button secondary" id="remove-portrait" style="margin-top:24px">Remove photo</button>':''}</section>`;
  main.querySelector<HTMLInputElement>('#profile-photo')!.addEventListener('change',async event=>{
    const input=event.target as HTMLInputElement;const file=input.files?.[0];if(!file)return;
    uploading++;input.disabled=true;
    try{
      toast('Preparing your portrait…');const blob=await compressPhoto(file);
      const photo=await api('media',{method:'POST',headers:{'Content-Type':blob.type,'X-Media-Kind':'portrait','X-File-Name':encodeURIComponent(file.name),'X-Photo-Description':encodeURIComponent(`Portrait of ${user.name}`)},body:blob});
      user=await api('profile',{method:'PUT',body:json({avatar:photo.url})});await profileScreen();toast('Your profile photo is saved.');
    }catch(e){toast((e as Error).message,true);}finally{uploading--;input.disabled=false;input.value='';}
  });
  main.querySelector('#remove-portrait')?.addEventListener('click',async()=>{uploading++;try{user=await api('profile',{method:'PUT',body:json({avatar:''})});await profileScreen();toast('Profile photo removed.');}catch(e){toast((e as Error).message,true);}finally{uploading--;}});
}
async function peopleScreen(){
  const people:User[]=await api('users');main.innerHTML=heading('OUR PEOPLE','Good company.','Invite a friend, give them a byline, make room for their stories.')+`<div class="admin-grid"><section><form id="invite-form" class="admin-card"><h2>Make an introduction.</h2><div class="form-group"><label class="form-label" for="invite-name">Their name</label><input class="form-input" id="invite-name" name="name" required maxlength="100" /></div><div class="form-group"><label class="form-label" for="invite-email">Email address</label><input class="form-input" id="invite-email" name="email" type="email" required /></div><div class="form-group"><label class="form-label" for="invite-bio">A little about them</label><textarea class="form-textarea" id="invite-bio" name="bio" maxlength="500"></textarea></div><div class="form-group"><label class="form-label" for="invite-link">Website or portfolio · optional</label><input class="form-input" id="invite-link" name="link" type="url" placeholder="https://" /></div><button class="button">Add contributor ↗</button></form><p class="desk-note">${localPreview?'Local preview uses sample accounts. Invitation links are for the deployed website.':'Create an invitation link for your friend and share it privately. It expires in 24 hours and can be used once. A new link can also reset a forgotten password.'}</p></section><section>${people.map(p=>`<article class="admin-card"><img class="contributor-portrait people-portrait" src="${escape(p.avatar || '/profile-placeholder.svg')}" alt="${escape(p.name)} profile picture" width="80" height="80" /><span class="eyebrow category">${p.active?p.role:'Inactive'}</span><h3 style="margin-top:12px">${escape(p.name)}</h3><p>${escape(p.email)}</p><p>${escape(p.bio)}</p>${p.active?`<button class="button secondary" data-invite-user="${escape(p.email)}">Invitation / reset link</button>`:''}${p.role!=='owner'&&p.active?`<button class="button secondary" data-remove-user="${escape(p.email)}">Remove editor access</button>`:''}</article>`).join('')}</section></div>`;
  main.querySelector<HTMLFormElement>('#invite-form')!.addEventListener('submit',async e=>{e.preventDefault();const form=e.target as HTMLFormElement;try{const result=await api('users',{method:'POST',body:json(Object.fromEntries(new FormData(form)))});await peopleScreen();toast(localPreview?'Contributor added to the local preview.':result.note);}catch(err){toast((err as Error).message,true);}});
  main.querySelectorAll<HTMLElement>('[data-invite-user]').forEach(el=>el.addEventListener('click',async()=>{try{const result=await api('users/invite',{method:'POST',body:json({email:el.dataset.inviteUser})});let box=main.querySelector<HTMLElement>('#invitation-result');if(!box){box=document.createElement('div');box.id='invitation-result';box.className='desk-note';main.prepend(box);}box.innerHTML='<strong>Share this link privately. It expires in 24 hours.</strong><input class="form-input" readonly aria-label="Private invitation link" />';const input=box.querySelector('input')!;input.value=result.url;input.focus();input.select();box.scrollIntoView({block:'center',behavior:'smooth'});}catch(e){toast((e as Error).message,true);}}));
  main.querySelectorAll<HTMLElement>('[data-remove-user]').forEach(el=>el.addEventListener('click',async()=>{if(!confirm('Remove this person’s access? Their published stories will stay.'))return;try{await api(`users/${encodeURIComponent(el.dataset.removeUser!)}`,{method:'DELETE'});await peopleScreen();toast('Contributor access removed.');}catch(e){toast((e as Error).message,true);}}));
}
async function homepageScreen(){
  const [selection]=await Promise.all([api('homepage'),loadStories()]);
  const published=stories.filter(story=>story.published_json).map(story=>({...JSON.parse(story.published_json!),id:story.id,author_name:story.author_name||''})).sort((a,b)=>String(b.published_at).localeCompare(String(a.published_at)));
  let selectedId=published.some(story=>story.id===selection.story_id)?selection.story_id:'';let savedId=selection.story_id;
  main.innerHTML=heading('THE SPECIAL OF THE DAY','Choose the spotlight.','Find a published story to serve first on the homepage. Preview your choice before saving it.')+`<section class="hero-picker"><label class="form-label" for="homepage-search">Find a hero article</label><input type="search" class="form-input" id="homepage-search" placeholder="Search by headline, contributor, or category…" /><p id="hero-search-count" role="status"></p><div id="hero-search-results" class="hero-search-results"></div><div class="hero-selection"><div id="hero-selected"></div><button type="button" class="back-button" id="hero-auto">Use newest published story automatically</button></div><div class="hero-picker-actions"><button class="button" id="save-homepage">Save homepage</button><button class="button secondary" id="preview-homepage">Preview ↗</button><span id="hero-save-state" role="status"></span></div><p class="hero-picker-hint">If a selected story is unpublished or moved to Trash, the newest published story takes its place.</p></section>`;
  const renderSelection=()=>{
    const selected=published.find(story=>story.id===selectedId);const effective=selected||published[0];
    main.querySelector('#hero-selected')!.innerHTML=`<span class="eyebrow">${selected?'YOUR SELECTION':'AUTOMATIC · NEWEST PUBLISHED'}</span>${effective?`<div class="hero-selected-story"><img src="${escape(effective.hero||'/placeholder.svg')}" alt="" /><div><h2>${escape(effective.title)}</h2><p>${escape(effective.author_name)}${effective.category?` · ${escape(effective.category)}`:''}</p></div></div>`:'<p>Publish a story to give it the spotlight.</p>'}`;
    main.querySelector('#hero-save-state')!.textContent=selectedId===savedId?'Saved selection':'Not saved yet';
    main.querySelector('#hero-auto')!.setAttribute('aria-pressed',String(!selectedId));
  };
  const renderResults=()=>{
    const query=main.querySelector<HTMLInputElement>('#homepage-search')!.value.trim().toLocaleLowerCase();
    const matches=published.filter(story=>`${story.title} ${story.deck} ${story.author_name} ${story.category}`.toLocaleLowerCase().includes(query));
    const visible=matches.slice(0,query?20:6);
    main.querySelector('#hero-search-count')!.textContent=matches.length?`${matches.length} published ${matches.length===1?'story':'stories'}${matches.length>visible.length?` · showing ${visible.length}; narrow your search to find more`:''}`:'No published stories match. Try another headline or contributor.';
    main.querySelector('#hero-search-results')!.innerHTML=visible.map(story=>`<label class="hero-search-result"><input type="radio" name="homepage-story" value="${escape(story.id)}"${selectedId===story.id?' checked':''}/><img src="${escape(story.hero||'/placeholder.svg')}" alt="" /><span><strong>${escape(story.title)}</strong><small>${escape(story.author_name)}${story.category?` · ${escape(story.category)}`:''}</small></span></label>`).join('');
    main.querySelectorAll<HTMLInputElement>('[name="homepage-story"]').forEach(input=>input.addEventListener('change',()=>{selectedId=input.value;renderSelection();}));
  };
  main.querySelector('#homepage-search')!.addEventListener('input',renderResults);
  main.querySelector('#hero-auto')!.addEventListener('click',()=>{selectedId='';renderResults();renderSelection();});
  main.querySelector('#preview-homepage')!.addEventListener('click',()=>void showSitePreview(`/preview/homepage?story=${encodeURIComponent(selectedId)}`,'Homepage preview'));
  main.querySelector<HTMLButtonElement>('#save-homepage')!.addEventListener('click',async event=>{const button=event.currentTarget as HTMLButtonElement;const capture=selectedId;button.disabled=true;try{await api('homepage',{method:'PUT',body:json({story_id:capture})});savedId=capture;renderSelection();toast('Homepage spotlight saved.');}catch(error){toast((error as Error).message,true);}finally{button.disabled=false;}});
  renderResults();renderSelection();
}
async function switchTab(next:string){if(!await leave())return;disposeAds();clearEditor();if(next==='promotions')next='ads';history.replaceState(null,'',`/editor${next!=='stories'?`?tab=${next}`:''}`);document.querySelectorAll<HTMLElement>('.desk-tab').forEach(el=>{el.classList.toggle('active',el.dataset.tab===next);if(el.dataset.tab===next)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');});
  try{if(next==='stories'||next==='review'){await loadStories();storyList(next==='review');}else if(next==='activity')await mountActivity({main,api,toast,refreshBadge:refreshActivityBadge});else if(next==='homepage')await homepageScreen();else if(next==='trash')await mountTrash({main,api,toast,busy:delta=>{uploading+=delta;}});else if(next==='gallery')await mountGallery({main,user,api,upload,toast,busy:delta=>{uploading+=delta;}});else if(next==='profile')await profileScreen();else if(next==='media')await mediaScreen();else if(next==='people')await peopleScreen();else if(next==='ads')await mountAds({main,api,toast,busy:delta=>{uploading+=delta;},openLibrary:()=>void switchTab('media')});}catch(e){toast((e as Error).message,true);main.innerHTML='<div class="desk-empty"><h2>We couldn’t open this just yet.</h2><p>Check your connection, then try the tab again.</p></div>';}}
document.querySelectorAll<HTMLElement>('[data-tab]').forEach(el=>el.addEventListener('click',()=>switchTab(el.dataset.tab!)));
document.querySelector<HTMLSelectElement>('#preview-role')?.addEventListener('change',async (e:Event)=>{if(!await leave())return;try{await api('preview-role',{method:'POST',body:json({role:(e.target as HTMLSelectElement).value})});location.href='/editor';}catch(err){toast((err as Error).message,true);}});
window.addEventListener('beforeunload',e=>{if(dirty||uploading||adsUnsaved()){if(dirty)persist();e.preventDefault();}});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&dirty){persist();void save();}});
async function refreshActivityBadge(){
 try{const data=await api('activity/unread');const badge=document.querySelector<HTMLElement>('#activity-count');if(badge){badge.textContent=String(data.unread);badge.hidden=!data.unread;badge.setAttribute('aria-label',`${data.unread} unread Kitchen updates`);}}catch{/* Keep the log available if polling is interrupted. */}
}
setInterval(()=>{if(!document.hidden&&user)void refreshActivityBadge();},60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&user)void refreshActivityBadge();});
async function init(){try{const session=await api('session');user=session.user;localPreview=session.localPreview;void refreshActivityBadge();await loadStories();const params=new URLSearchParams(location.search);if(params.has('story'))await openStory(params.get('story')!);else if(params.has('new'))await openStory();else await switchTab(params.get('tab')||'stories');}catch(e){main.innerHTML='<div class="desk-empty"><h2>The desk is temporarily unavailable.</h2><p>Check your connection and reload to try again.</p></div>';toast((e as Error).message,true);}}
void init();

document.querySelector('#sign-out')?.addEventListener('click',async()=>{if(!await leave())return;await fetch('/auth/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});location.assign('/sign-in');});
