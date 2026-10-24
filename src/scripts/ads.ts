import { loadArtwork, drawArtwork, compressArtwork } from '../lib/artwork';
import {detectFormat} from '../lib/promotion';
import type { Promotion, PromotionFormat } from '../lib/types';
import '../styles/ads.css';

type Options = { main: HTMLElement; api: (path: string, init?: RequestInit) => Promise<any>; toast: (message: string, error?: boolean) => void; busy: (delta: number) => void; openLibrary: () => void };
const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const bytes = (value: number) => value >= 1e9 ? `${(value / 1e9).toFixed(2)} GB` : value >= 1e6 ? `${(value / 1e6).toFixed(1)} MB` : `${Math.ceil(value / 1000)} KB`;
let unsaved = false;
let artwork: Awaited<ReturnType<typeof loadArtwork>> | null = null;
export const adsUnsaved = () => unsaved;
export const canLeaveAds = () => !unsaved || confirm('Discard these unsaved ad changes? Your saved ads will stay as they are.');
export function disposeAds() { document.querySelector<HTMLDialogElement>('#art-composer')?.close(); artwork?.release(); artwork = null; unsaved = false; }

export async function mountAds(options: Options) {
  disposeAds();
  const { main, api, toast, busy } = options;
  let [items, usage, companies] = await Promise.all([api('promotions') as Promise<Promotion[]>, api('media'), api('companies') as Promise<{id:string;name:string}[]>]);
  let filter = 'all'; let companyFilter='';let sort='company'; let saving = false; let pendingImage = '';
  main.innerHTML = `<div class="desk-heading"><div><span class="eyebrow category">FROM OUR FRIENDS</span><h1>On the house.</h1><p>A little space for companies we believe in. Choose a company, add artwork, and serve it up.</p></div><button class="button" id="new-artwork">Add an ad ＋</button></div>
    <div class="art-summary"><div><strong>${items.filter(p => p.active && p.image).length} active images</strong><span> Banners 4:1 · Posters 1:4</span></div><span>Image storage: <b id="art-storage">${bytes(usage.bytes)}</b> / ${bytes(usage.cap)}</span></div>
    <progress class="art-storage-meter" id="art-meter" value="${usage.bytes}" max="${usage.cap}" aria-label="Image storage used"></progress>
    <aside class="art-specs" aria-label="Web artwork requirements"><strong>Web artwork requirements</strong><span><b>Banner</b> · 1600 × 400 px · 4:1</span><span><b>Poster</b> · 400 × 1600 px · 1:4</span><span>JPEG, PNG, or WebP · optimized to 500 KB maximum</span></aside>
    <dialog id="art-composer" class="art-editor-dialog" aria-labelledby="art-editor-title"></dialog><div id="ad-saved-preview" role="status"></div><div class="art-company-filters"><label>Company<select class="form-select" id="company-filter"><option value="">All companies</option>${companies.map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select></label><label>Sort ads<select class="form-select" id="ad-sort"><option value="company">Company · A–Z</option><option value="company-desc">Company · Z–A</option><option value="status">Active first</option><option value="format">Banners first</option></select></label></div><div class="art-filters" role="group" aria-label="Filter ads"><button data-format-filter="all" aria-pressed="true">All images</button><button data-format-filter="banner" aria-pressed="false">Banners</button><button data-format-filter="poster" aria-pressed="false">Posters</button></div><div id="art-grid" class="art-grid"></div>
    <p class="art-library-note">Images share the Photo library’s storage. Deleting an ad removes it from rotation; its image stays in the library for reuse or removal. <button id="art-library">Open Photo library ↗</button></p>`;
  const composer = main.querySelector<HTMLDialogElement>('#art-composer')!;
  const refreshUsage = async () => { try { usage = await api('media'); main.querySelector('#art-storage')!.textContent = bytes(usage.bytes); main.querySelector<HTMLProgressElement>('#art-meter')!.value = usage.bytes; } catch { /* The next visit refreshes the meter if the connection drops. */ } };
  const closeComposer = () => { disposeAds(); pendingImage = ''; composer.innerHTML = ''; };
  const requestClose=()=>{if(!saving&&canLeaveAds())closeComposer();};
  composer.addEventListener('cancel',event=>{event.preventDefault();requestClose();});
  composer.addEventListener('click',event=>{const rect=composer.getBoundingClientRect();if(event.target===composer&&(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom))requestClose();});
  function renderList() {
    const visible = items.filter(p => (filter === 'all' || p.format === filter)&&(!companyFilter||p.company_id===companyFilter)).sort((a,b)=>sort==='status'?b.active-a.active||a.name.localeCompare(b.name):sort==='format'?a.format.localeCompare(b.format)||a.name.localeCompare(b.name):(sort==='company-desc'?-1:1)*a.name.localeCompare(b.name));
    main.querySelector('#art-grid')!.innerHTML = visible.length ? visible.map(p => `<article class="art-card"><button type="button" class="art-card-open" data-edit-art="${esc(p.id)}" aria-label="Edit ad for ${esc(p.name)}"></button><div class="art-thumbnail ${p.format === 'poster' ? 'is-poster' : ''}">${p.image ? `<img src="${esc(p.image)}" alt="${esc(p.alt || p.name)}" loading="lazy" />` : '<span>Artwork needed</span>'}</div><div class="art-card-copy"><span class="art-status">${!p.image ? 'Needs artwork' : p.active ? 'Active' : 'Paused'} · ${p.format === 'poster' ? 'Poster' : 'Banner'}</span><h2>${esc(p.name)}</h2><div class="art-card-actions"><a class="button secondary" target="_blank" rel="noopener" href="/preview/ads/${esc(p.id)}">Preview on site ↗</a><button class="button secondary" data-toggle-art="${esc(p.id)}" ${!p.image && !p.active ? 'disabled' : ''}>${p.active ? 'Pause' : 'Activate'}</button></div></div></article>`).join('') : '<div class="desk-empty"><h2>Room for a friend.</h2><p>Upload a banner or poster to start this rotation.</p></div>';
    main.querySelectorAll<HTMLElement>('[data-edit-art]').forEach(el => el.addEventListener('click', () => { if (!saving && canLeaveAds()) openComposer(items.find(p => p.id === el.dataset.editArt)); }));
    main.querySelectorAll<HTMLButtonElement>('[data-toggle-art]').forEach(el => el.addEventListener('click', async () => {
      if (saving) return; const item = items.find(p => p.id === el.dataset.toggleArt)!; el.disabled = true;
      try { await api(`promotions/${item.id}/visibility`, { method: 'POST', body: JSON.stringify({ active: !item.active }) }); item.active = item.active ? 0 : 1; renderList(); toast(item.active ? 'Image is in rotation.' : 'Image paused.'); }
      catch (error) { toast((error as Error).message, true); el.disabled = false; }
    }));
    main.querySelector('.art-summary strong')!.textContent = `${items.filter(p => p.active && p.image).length} active images`;
  }
  function openComposer(item?: Promotion) {
    closeComposer();
    const recordId = item?.id || crypto.randomUUID();
    const format = item?.format || 'banner';
    composer.innerHTML = `<form id="art-form" class="art-form"><div class="art-form-heading"><h2 id="art-editor-title">${item ? 'Edit ad' : 'A new ad'}</h2><button type="button" id="close-artwork" class="back-button">Cancel</button></div><div class="art-form-columns"><div><div class="form-group"><label class="form-label" for="art-company">Company</label><select class="form-select" id="art-company" name="company_id" required><option value="">Choose a company…</option>${companies.map(c=>`<option value="${esc(c.id)}"${item?.company_id===c.id?' selected':''}>${esc(c.name)}</option>`).join('')}</select><details class="new-company"><summary>Or create a company</summary><label class="form-label" for="new-company-name">Or make a new company</label><input class="form-input" id="new-company-name" maxlength="100" placeholder="Company name" /><button type="button" class="button secondary" id="create-company">Create company</button></details><input type="hidden" id="art-name" name="name" value="${esc(item?.name)}" /></div><input type="hidden" id="art-format" name="format" value="${format}" /><fieldset class="ad-metadata" id="ad-metadata" ${item?.image?'':'hidden disabled'}><legend>Ad details</legend><div class="form-group"><label class="form-label" for="art-url">Destination link · optional</label><input class="form-input" id="art-url" name="url" inputmode="url" placeholder="https://your-friends-business.com" maxlength="2000" value="${esc(item?.url)}" /></div><div class="form-group"><label class="form-label" for="art-alt">Image description · metadata only</label><textarea class="form-textarea" id="art-alt" name="alt" required maxlength="500" placeholder="Include the business name and any important words in the image.">${esc(item?.alt)}</textarea><small>Used as alternative text for screen readers. It does not appear as a visible caption or over the artwork.</small></div><label class="art-active"><input type="checkbox" name="active" ${item?.active !== 0 ? 'checked' : ''} /> Include in rotation</label></fieldset></div>
      <div><label class="form-label" for="art-file">${item?.image ? 'Replace artwork' : 'Upload artwork'}</label><input class="form-input" type="file" id="art-file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" /><p class="art-guidance" id="art-guidance"></p><div class="art-crop-preview ${format === 'poster' ? 'is-poster' : ''}" id="art-preview">${item?.image ? `<img src="${esc(item.image)}" alt="Current artwork preview" />` : '<span>Your image preview will appear here.</span>'}</div><fieldset class="art-crop-controls" id="art-crop-controls" hidden><legend>Adjust the crop</legend><label>Left / right<input type="range" id="art-x" min="0" max="100" value="50" /></label><label>Up / down<input type="range" id="art-y" min="0" max="100" value="50" /></label><label>Zoom<input type="range" id="art-zoom" min="100" max="250" value="100" /></label></fieldset><p class="art-save-status" id="art-save-status" role="status" aria-live="polite">${item?.image ? 'Saved artwork. Choose a file to replace it.' : 'JPEG, PNG, or WebP. We’ll prepare the size automatically.'}</p></div></div><div class="art-form-actions"><button class="button" id="save-artwork">Save</button><button class="button secondary" type="button" id="preview-artwork">Preview ↗</button>${item?'<button type="button" class="art-delete" id="delete-artwork">Delete ad</button>':''}</div></form>`;
    const form = composer.querySelector<HTMLFormElement>('#art-form')!;
    const shape = () => (form.elements.namedItem('format') as HTMLInputElement).value as PromotionFormat;
    const status = form.querySelector<HTMLElement>('#art-save-status')!;
    const preview = form.querySelector<HTMLElement>('#art-preview')!;
    const controls = form.querySelector<HTMLFieldSetElement>('#art-crop-controls')!;
    const guidance = () => { form.querySelector('#art-guidance')!.textContent = shape() === 'banner' ? 'Recommended: 1600 × 400 pixels. Crop to a slim 4:1 banner.' : 'Recommended: 400 × 1600 pixels. Crop to a tall 1:4 poster.'; preview.classList.toggle('is-poster', shape() === 'poster'); };
    guidance();if(!item)form.querySelector('#art-guidance')!.textContent='Choose a company, then upload artwork. Wide images become banners; tall images become posters. You can adjust the crop before submitting.';
    const draw = () => {
      if (!artwork) return;
      let canvas = preview.querySelector('canvas'); if (!canvas) { canvas = document.createElement('canvas'); canvas.setAttribute('aria-label', 'Crop preview'); preview.replaceChildren(canvas); }
      drawArtwork(canvas, artwork.image, shape(), Number(form.querySelector<HTMLInputElement>('#art-x')!.value), Number(form.querySelector<HTMLInputElement>('#art-y')!.value), Number(form.querySelector<HTMLInputElement>('#art-zoom')!.value));
      pendingImage = ''; status.textContent = `Detected ${shape()} from ${artwork.image.naturalWidth} × ${artwork.image.naturalHeight} pixels. Check the crop, add metadata, then submit.`;
    };
    form.addEventListener('input', () => { unsaved = true; });
    const companySelect=form.querySelector<HTMLSelectElement>('#art-company')!;
    const fileInput=form.querySelector<HTMLInputElement>('#art-file')!;
    const syncCompany=()=>{fileInput.disabled=!companySelect.value;form.querySelector<HTMLInputElement>('#art-name')!.value=companies.find(c=>c.id===companySelect.value)?.name||'';};
    companySelect.addEventListener('change',syncCompany);syncCompany();
    form.querySelector('#create-company')!.addEventListener('click',async()=>{
      if(saving)return;
      const name=form.querySelector<HTMLInputElement>('#new-company-name')!.value.trim();if(!name){toast('Enter a company name first.',true);return;}
      const button=form.querySelector<HTMLButtonElement>('#create-company')!;button.disabled=true;busy(1);saving=true;
      try{const company=await api('companies',{method:'POST',body:JSON.stringify({name})});if(!companies.some(c=>c.id===company.id)){companies.push(company);companies.sort((a,b)=>a.name.localeCompare(b.name));companySelect.add(new Option(company.name,company.id));main.querySelector<HTMLSelectElement>('#company-filter')!.add(new Option(company.name,company.id));}companySelect.value=company.id;syncCompany();unsaved=true;toast('Company ready. Choose its artwork.');}catch(error){toast((error as Error).message,true);}finally{button.disabled=false;busy(-1);saving=false;}
    });
    controls.addEventListener('input', draw);
    form.querySelector<HTMLInputElement>('#art-file')!.addEventListener('change', async event => {
      const fileInput = event.target as HTMLInputElement;
      const file = fileInput.files?.[0]; if (!file) return; fileInput.disabled = true; busy(1); saving = true; status.textContent = 'Opening image…';
      try { const loaded = await loadArtwork(file); artwork?.release(); artwork = loaded; form.querySelector<HTMLInputElement>('#art-format')!.value=detectFormat(loaded.image.naturalWidth,loaded.image.naturalHeight);guidance(); const metadata=form.querySelector<HTMLFieldSetElement>('#ad-metadata')!;metadata.hidden=false;metadata.disabled=false; controls.hidden = false; controls.querySelectorAll<HTMLInputElement>('input').forEach(el => el.value = el.id === 'art-zoom' ? '100' : '50'); draw(); unsaved = true; }
      catch (error) { status.textContent = (error as Error).message; toast((error as Error).message, true); }
      finally { fileInput.disabled = false; saving = false; busy(-1); }
    });
    form.querySelector('#delete-artwork')?.addEventListener('click',async()=>{
      if(saving||!item||!confirm(`Delete the ad for ${item.name}? Its photo will remain in the Photo library.`))return;
      saving=true;busy(1);const button=form.querySelector<HTMLButtonElement>('#delete-artwork')!;button.disabled=true;
      try{await api(`promotions/${item.id}`,{method:'DELETE'});items=items.filter(ad=>ad.id!==item.id);closeComposer();renderList();toast('Ad deleted.');}catch(error){status.textContent=(error as Error).message;button.disabled=false;}finally{saving=false;busy(-1);}
    });
    form.querySelector('#preview-artwork')!.addEventListener('click',async()=>{
      if(saving)return;
      if(!artwork&&!item?.image){status.textContent='Choose an image to preview first.';return;}
      const popup=document.createElement('dialog');popup.className='ad-site-preview';popup.setAttribute('aria-label','Ad preview');
      popup.innerHTML='<header><div><h2>Ad preview</h2><p>Desktop layout · unsaved changes</p></div><button type="button" class="button secondary">Back to editing</button></header><p class="preview-loading" role="status">Preparing your preview…</p><div class="ad-preview-viewport"><iframe title="Preview ad on the website"></iframe></div>';
      popup.querySelector('button')!.addEventListener('click',()=>popup.close());popup.addEventListener('close',()=>popup.remove(),{once:true});document.body.append(popup);popup.showModal();
      try{
        const response=await fetch(`/preview/ads/draft?format=${shape()}`);if(!response.ok)throw new Error('The preview could not be opened.');
        const doc=new DOMParser().parseFromString(await response.text(),'text/html');
        const base=document.createElement('base');base.href=location.origin;doc.head.prepend(base);
        const image=artwork?preview.querySelector('canvas')!.toDataURL('image/webp'):item!.image;
        const name=companies.find(company=>company.id===companySelect.value)?.name||'Your ad';
        doc.title=`Preview: ${name}`;
        doc.querySelector('.preview-note')!.innerHTML='<p>PRIVATE AD PREVIEW · Unsaved changes</p><p>This preview does not save or activate your ad. Choose Back to editing to return to your ad.</p>';
        const alt=form.querySelector<HTMLTextAreaElement>('#art-alt')!.value||name;
        doc.querySelectorAll<HTMLImageElement>('.friend-image img').forEach(img=>{img.src=image;img.alt=alt;const link=img.closest('a');if(link)link.replaceWith(img);});
        // Keep preview artwork inert so reviewing it cannot navigate to a destination link.
        doc.querySelectorAll('script').forEach(script=>script.remove());
        if(!popup.open)return;
        const frame=popup.querySelector('iframe')!;frame.addEventListener('load',()=>{const placement=frame.contentDocument?.querySelector<HTMLElement>('.friend-image');if(placement&&frame.contentWindow)frame.contentWindow.scrollTo(0,Math.max(0,placement.getBoundingClientRect().top+frame.contentWindow.scrollY-140));});frame.srcdoc='<!doctype html>'+doc.documentElement.outerHTML;
        popup.querySelector('.preview-loading')!.remove();
        const viewport=popup.querySelector<HTMLElement>('.ad-preview-viewport')!;
        const resize=()=>{const scale=viewport.clientWidth/1200;frame.style.transform=`scale(${scale})`;viewport.style.height=`${950*scale}px`;};resize();
        const observer=new ResizeObserver(resize);observer.observe(viewport);popup.addEventListener('close',()=>observer.disconnect(),{once:true});
      }catch(error){const message=popup.querySelector('.preview-loading');if(message)message.textContent=(error as Error).message;}
    });
    form.querySelector('#close-artwork')!.addEventListener('click', () => { if (!saving && canLeaveAds()) closeComposer(); });
    form.addEventListener('submit', async event => {
      event.preventDefault(); if (saving) return;
      if (!artwork && (!item?.image || shape() !== item.format)) { status.textContent = 'Choose an image and check its crop first.'; return; }
      const data = Object.fromEntries(new FormData(form)); saving = true; busy(1); form.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement | HTMLTextAreaElement>('input,button,select,textarea').forEach(el => el.disabled = true);
      try {
        let image = pendingImage || item?.image || '';
        if (artwork && !pendingImage) {
          status.textContent = 'Preparing image…'; const blob = await compressArtwork(preview.querySelector('canvas')!);
          status.textContent = `Uploading ${bytes(blob.size)}…`;
          const extension = blob.type === 'image/jpeg' ? 'jpg' : 'webp';
          const photo = await api('media', { method: 'POST', headers: {'Content-Type': blob.type, 'X-Media-Kind':'artwork', 'X-Photo-Description': encodeURIComponent(String(data.alt)), 'X-File-Name': encodeURIComponent(`${String(data.name).slice(0,80)}-${shape()}.${extension}`)}, body: blob });
          image = pendingImage = photo.url;
        }
        status.textContent = 'Saving to the rotation…';
        await api('promotions', { method: 'POST', body: JSON.stringify({...data, id: recordId, image, active: !!data.active}) });
        items = await api('promotions'); closeComposer(); renderList(); await refreshUsage(); toast('Ad saved. Random placements update on the next page load.');
      } catch (error) { status.textContent = `${(error as Error).message} Your changes are still here. Try Save image again.`; toast((error as Error).message, true); }
      finally { saving = false; busy(-1); form.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement | HTMLTextAreaElement>('input,button,select,textarea').forEach(el => el.disabled = false); }
    });
    composer.showModal();
    companySelect.focus();
  }
  main.querySelector('#new-artwork')!.addEventListener('click', () => { if (!saving && canLeaveAds()) openComposer(); });
  main.querySelector('#art-library')!.addEventListener('click', options.openLibrary);
  main.querySelectorAll<HTMLButtonElement>('[data-format-filter]').forEach(button => button.addEventListener('click', () => { filter = button.dataset.formatFilter!; main.querySelectorAll<HTMLButtonElement>('[data-format-filter]').forEach(el => el.setAttribute('aria-pressed', String(el === button))); renderList(); }));
  main.querySelector<HTMLSelectElement>('#company-filter')!.addEventListener('change',event=>{companyFilter=(event.target as HTMLSelectElement).value;renderList();});
  main.querySelector<HTMLSelectElement>('#ad-sort')!.addEventListener('change',event=>{sort=(event.target as HTMLSelectElement).value;renderList();});
  renderList();
}
