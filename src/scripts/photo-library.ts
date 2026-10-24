import {completePhoto, photoCredit, type PhotoMetadata} from '../lib/photo-metadata';
export type Photo = { id: string; url?: string; name: string; description: string; photographer: string; is_screenshot: number; bytes: number };
type Options = {
  api: (path: string, init?: RequestInit) => Promise<any>;
  upload: (file: File, metadata: PhotoMetadata) => Promise<Photo>;
  select: (photo: Photo & { url: string }) => void;
  initialFile?: File;
  editPhoto?: Photo;
  openLibrary?: () => void;
  remove?: (photo:Photo)=>Promise<void>;
};
const filename = (name:string) => { try { return decodeURIComponent(name); } catch { return name; } };
const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export async function openPhotoLibrary({api, upload, select, initialFile, editPhoto, openLibrary, remove}: Options) {
  if (document.querySelector('#photo-library-dialog')) return;
  const dialog = document.createElement('dialog');
  dialog.id = 'photo-library-dialog'; dialog.className = 'photo-library-dialog';
  dialog.setAttribute('aria-labelledby', 'photo-library-title');
  dialog.innerHTML = `<div class="photo-library-heading"><div><span class="eyebrow category">YOUR PHOTOS</span><h2 id="photo-library-title">Choose a photo.</h2></div><button type="button" class="back-button" id="close-photo-library" aria-label="Close photo library">Close ×</button></div>
    <form id="library-upload"><label class="form-label" for="library-file">Upload from your computer</label><input class="form-input" type="file" id="library-file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" />
    <div id="library-details" hidden><p id="library-filename"></p><label class="form-label" for="library-description">Photo description · metadata only</label><textarea class="form-input caption-input" id="library-description" rows="2" maxlength="500" required placeholder="Felix and Megan posing at Crazy8s"></textarea><p class="photo-library-hint">Metadata only: used for library search and as alternative text for screen readers. It does not appear as a visible caption. Add the reader-facing caption in your story.</p><label class="photo-screenshot"><input type="checkbox" id="library-screenshot" /> This image is a screenshot</label><label class="form-label" for="library-photographer">Photographer credit</label><input class="form-input" id="library-photographer" maxlength="200" required placeholder="Photographer’s name" /><button class="button" id="library-upload-button">Upload and use photo ↗</button></div></form>
    <div class="photo-library-search"><label class="form-label" for="library-search">Or find a photo in your library</label><input class="form-input" id="library-search" type="search" placeholder="Search descriptions or filenames…" /></div><p id="library-status" role="status" aria-live="polite">Loading your photos…</p><div class="photo-picker-grid" id="library-photos"></div>`;
  document.body.append(dialog); dialog.showModal();
  let photos: Photo[] = []; let file = initialFile; let busy = false; let dirty=false;
  let pendingPhoto: Photo | undefined = editPhoto;
  const status = dialog.querySelector<HTMLElement>('#library-status')!;
  const description = dialog.querySelector<HTMLTextAreaElement>('#library-description')!;
  const photographer = dialog.querySelector<HTMLInputElement>('#library-photographer')!;
  const screenshot = dialog.querySelector<HTMLInputElement>('#library-screenshot')!;
  function toggleScreenshot(){photographer.disabled=screenshot.checked;photographer.required=!screenshot.checked;}
  screenshot.addEventListener('change',toggleScreenshot);
  const close = dialog.querySelector<HTMLButtonElement>('#close-photo-library')!;
  const finish = (photo: Photo) => { dialog.close(); select({...photo, url: photo.url || `/media/${photo.id}`}); };
  dialog.addEventListener('close', () => dialog.remove(), {once:true});
  const requestClose=()=>{if(!busy&&(!dirty||confirm('Discard these unsaved photo changes?')))dialog.close();};
  dialog.querySelector('#library-upload')!.addEventListener('input',()=>{dirty=true;});
  dialog.addEventListener('cancel',event=>{event.preventDefault();requestClose();});
  close.addEventListener('click',requestClose);
  dialog.addEventListener('click',event=>{const rect=dialog.getBoundingClientRect();if(event.target===dialog&&(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom))requestClose();});
  function showFile() {
    dialog.querySelector<HTMLElement>('#library-details')!.hidden = !file && !editPhoto;
    dialog.querySelector('#library-filename')!.textContent = file?.name || '';
    if (file) description.focus();
  }
  showFile();
  if(editPhoto){
    dialog.querySelector('#photo-library-title')!.textContent='Edit photo details.';
    dialog.querySelector<HTMLElement>('#library-file')!.parentElement!.querySelector('label')!.style.display='none';
    dialog.querySelector<HTMLInputElement>('#library-file')!.hidden=true;
    dialog.querySelector('#library-filename')!.textContent=filename(editPhoto.name);
    const preview=document.createElement('img');preview.className='photo-edit-preview';preview.src=editPhoto.url||`/media/${editPhoto.id}`;preview.alt=editPhoto.description||filename(editPhoto.name);dialog.querySelector('#library-filename')!.before(preview);
    description.value=editPhoto.description || '';photographer.value=editPhoto.photographer || '';screenshot.checked=Boolean(editPhoto.is_screenshot);toggleScreenshot();
    dialog.querySelector('#library-upload-button')!.textContent='Save photo details';
    dialog.querySelector<HTMLElement>('.photo-library-search')!.hidden=true;
    if(remove){
      const button=document.createElement('button');button.type='button';button.className='photo-remove-button';button.textContent='Remove photo';
      button.addEventListener('click',async()=>{if(busy||!confirm('Permanently remove this unused photo? Keep your original copy.'))return;busy=true;button.disabled=true;close.disabled=true;
        try{await remove(editPhoto);dialog.close();}catch(error){status.textContent=(error as Error).message;}finally{busy=false;button.disabled=false;close.disabled=false;}
      });dialog.querySelector('#library-upload-button')!.after(button);
    }
  }
  dialog.querySelector<HTMLInputElement>('#library-file')!.addEventListener('change', event => {
    file = (event.target as HTMLInputElement).files?.[0]; showFile();
  });
  function render() {
    const query = dialog.querySelector<HTMLInputElement>('#library-search')!.value.trim().toLocaleLowerCase();
    const visible = photos.filter(photo => `${photo.description} ${filename(photo.name)} ${photo.photographer} ${photo.is_screenshot ? "screenshot" : ""}`.toLocaleLowerCase().includes(query));
    dialog.querySelector('#library-photos')!.innerHTML = visible.map(photo => `<button type="button" class="photo-picker-item" data-photo="${esc(photo.id)}"><img src="/media/${esc(photo.id)}" alt="${esc(photo.description || filename(photo.name))}" loading="lazy" /><span>${esc(photo.description || filename(photo.name))}<small>${esc(photoCredit(photo) || "Credit needed")}</small></span></button>`).join('');
    status.textContent = visible.length ? `${visible.length} photo${visible.length === 1 ? '' : 's'}` : query ? 'No matching photos. Try another name or event.' : 'Your library is ready for its first photo.';
    dialog.querySelectorAll<HTMLButtonElement>('[data-photo]').forEach(button => button.addEventListener('click', async () => {
      if (busy) return;
      const photo = photos.find(item => item.id === button.dataset.photo)!;
      if (completePhoto(photo)) { finish(photo); return; }
      status.textContent='This photo needs a description and credit. Complete its details in the Photo library before using it.';
      if(openLibrary && !dialog.querySelector('#complete-photo-details')){
        const button=document.createElement('button');button.id='complete-photo-details';button.className='button secondary';button.textContent='Open Photo library';
        button.addEventListener('click',()=>{dialog.close();openLibrary();});status.after(button);
      }
    }));
  }
  dialog.querySelector<HTMLInputElement>('#library-file')!.addEventListener('change', () => {
    pendingPhoto = undefined; dialog.querySelector('#library-upload-button')!.textContent = 'Upload and use photo ↗';
  });
  dialog.querySelector('#library-search')!.addEventListener('input', render);
  dialog.querySelector<HTMLFormElement>('#library-upload')!.addEventListener('submit', async event => {
    event.preventDefault(); if (busy || (!file && !pendingPhoto)) return;
    const text = description.value.trim();
    if(!screenshot.checked && !photographer.value.trim()){photographer.setCustomValidity('Add the photographer’s name or choose Screenshot.');photographer.reportValidity();return;}
    if (!text) { description.setCustomValidity('Describe this photo so you can find it later.'); description.reportValidity(); return; }
    busy = true; close.disabled = true;
    const controls = dialog.querySelectorAll<HTMLInputElement|HTMLButtonElement|HTMLTextAreaElement>('input,button,textarea');
    controls.forEach(control => control.disabled = true); status.textContent = 'Preparing your photo…';
    try {
      const photo = pendingPhoto
        ? await api(`media/${pendingPhoto.id}`, {method:'PUT', body:JSON.stringify({description:text,photographer:photographer.value.trim(),is_screenshot:screenshot.checked})})
        : await upload(file!, {description:text,photographer:photographer.value.trim(),is_screenshot:screenshot.checked ? 1 : 0});
      finish(photo);
    } catch (error) { status.textContent = (error as Error).message; }
    finally { busy = false; controls.forEach(control => control.disabled = false);toggleScreenshot(); }
  });
  photographer.addEventListener('input',()=>photographer.setCustomValidity(''));
  description.addEventListener('input', () => description.setCustomValidity(''));
  if(editPhoto){status.textContent='Descriptions and credits update everywhere this photo is used. Captions stay with each story.';return;}
  try { photos = (await api('media')).items; if (dialog.isConnected && !busy) render(); }
  catch (error) { status.textContent = (error as Error).message; }
}
