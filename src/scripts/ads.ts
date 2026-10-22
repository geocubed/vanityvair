import { loadArtwork, drawArtwork, compressArtwork } from '../lib/artwork';
import type { Promotion, PromotionFormat } from '../lib/types';
import '../styles/ads.css';

type Options = { main: HTMLElement; api: (path: string, init?: RequestInit) => Promise<any>; toast: (message: string, error?: boolean) => void; busy: (delta: number) => void; openLibrary: () => void };
const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const bytes = (value: number) => value >= 1e9 ? `${(value / 1e9).toFixed(2)} GB` : value >= 1e6 ? `${(value / 1e6).toFixed(1)} MB` : `${Math.ceil(value / 1000)} KB`;
let unsaved = false;
let artwork: Awaited<ReturnType<typeof loadArtwork>> | null = null;
export const adsUnsaved = () => unsaved;
export const canLeaveAds = () => !unsaved || confirm('Discard these unsaved ad changes? Your saved ads will stay as they are.');
export function disposeAds() { artwork?.release(); artwork = null; unsaved = false; }

export async function mountAds(options: Options) {
  disposeAds();
  const { main, api, toast, busy } = options;
  let [items, usage] = await Promise.all([api('promotions') as Promise<Promotion[]>, api('media')]);
  let filter = 'all'; let saving = false; let pendingImage = ''; let original: Promotion | undefined;
  main.innerHTML = `<div class="desk-heading"><div><span class="eyebrow category">FROM OUR FRIENDS</span><h1>Ads</h1><p>Your image rotation. A little space for people you believe in.</p></div><button class="button" id="new-artwork">Upload image ＋</button></div>
    <div class="art-summary"><div><strong>${items.filter(p => p.active && p.image).length} active images</strong><span> Banners 8:1 · Posters 2:3</span></div><span>Image storage: <b id="art-storage">${bytes(usage.bytes)}</b> / ${bytes(usage.cap)}</span></div>
    <progress class="art-storage-meter" id="art-meter" value="${usage.bytes}" max="${usage.cap}" aria-label="Image storage used"></progress>
    <div id="art-composer"></div><div class="art-filters" role="group" aria-label="Filter ads"><button data-format-filter="all" aria-pressed="true">All images</button><button data-format-filter="banner" aria-pressed="false">Banners</button><button data-format-filter="poster" aria-pressed="false">Posters</button></div><div id="art-grid" class="art-grid"></div>
    <p class="art-library-note">Images share the Photo library’s storage. Deleting an ad removes it from rotation; its image stays in the library for reuse or removal. <button id="art-library">Open Photo library ↗</button></p>`;
  const composer = main.querySelector<HTMLElement>('#art-composer')!;
  const refreshUsage = async () => { try { usage = await api('media'); main.querySelector('#art-storage')!.textContent = bytes(usage.bytes); main.querySelector<HTMLProgressElement>('#art-meter')!.value = usage.bytes; } catch { /* The next visit refreshes the meter if the connection drops. */ } };
  const closeComposer = () => { disposeAds(); pendingImage = ''; original = undefined; composer.innerHTML = ''; };
  function renderList() {
    const visible = items.filter(p => filter === 'all' || p.format === filter);
    main.querySelector('#art-grid')!.innerHTML = visible.length ? visible.map(p => `<article class="art-card"><div class="art-thumbnail ${p.format === 'poster' ? 'is-poster' : ''}">${p.image ? `<img src="${esc(p.image)}" alt="${esc(p.alt || p.name)}" loading="lazy" />` : '<span>Artwork needed</span>'}</div><div class="art-card-copy"><span class="art-status">${!p.image ? 'Needs artwork' : p.active ? 'Active' : 'Paused'} · ${p.format === 'poster' ? 'Poster' : 'Banner'}</span><h2>${esc(p.name)}</h2><div class="art-card-actions"><button class="button secondary" data-edit-art="${esc(p.id)}">Edit</button><button class="button secondary" data-toggle-art="${esc(p.id)}" ${!p.image && !p.active ? 'disabled' : ''}>${p.active ? 'Pause' : 'Activate'}</button><button class="art-delete" data-delete-art="${esc(p.id)}">Delete</button></div></div></article>`).join('') : '<div class="desk-empty"><h2>Room for a friend.</h2><p>Upload a banner or poster to start this rotation.</p></div>';
    main.querySelectorAll<HTMLElement>('[data-edit-art]').forEach(el => el.addEventListener('click', () => { if (!saving && canLeaveAds()) openComposer(items.find(p => p.id === el.dataset.editArt)); }));
    main.querySelectorAll<HTMLButtonElement>('[data-toggle-art]').forEach(el => el.addEventListener('click', async () => {
      if (saving) return; const item = items.find(p => p.id === el.dataset.toggleArt)!; el.disabled = true;
      try { await api(`promotions/${item.id}/visibility`, { method: 'POST', body: JSON.stringify({ active: !item.active }) }); item.active = item.active ? 0 : 1; renderList(); toast(item.active ? 'Image is in rotation.' : 'Image paused.'); }
      catch (error) { toast((error as Error).message, true); el.disabled = false; }
    }));
    main.querySelectorAll<HTMLElement>('[data-delete-art]').forEach(el => el.addEventListener('click', async () => {
      if (saving) return; const item = items.find(p => p.id === el.dataset.deleteArt)!;
      if (!confirm(`Delete “${item.name}” from the rotation? Its image stays in Photo library for reuse or removal.`)) return;
      if (original?.id === item.id && !canLeaveAds()) return;
      try { await api(`promotions/${item.id}`, { method: 'DELETE' }); items = items.filter(p => p.id !== item.id); if (original?.id === item.id) closeComposer(); renderList(); toast('Ad deleted. The image is still in Photo library.'); }
      catch (error) { toast((error as Error).message, true); }
    }));
    main.querySelector('.art-summary strong')!.textContent = `${items.filter(p => p.active && p.image).length} active images`;
  }
  function openComposer(item?: Promotion) {
    closeComposer(); original = item;
    const recordId = item?.id || crypto.randomUUID();
    const format = item?.format || 'banner';
    composer.innerHTML = `<form id="art-form" class="art-form"><div class="art-form-heading"><h2>${item ? 'Edit image' : 'A new image'}</h2><button type="button" id="close-artwork" class="back-button">Cancel</button></div><div class="art-form-columns"><div><div class="form-group"><label class="form-label" for="art-name">Business / campaign name</label><input class="form-input" id="art-name" name="name" required maxlength="100" value="${esc(item?.name)}" /></div><div class="form-group"><label class="form-label" for="art-format">Shape</label><select class="form-select" id="art-format" name="format"><option value="banner" ${format === 'banner' ? 'selected' : ''}>Banner · slim · 8:1</option><option value="poster" ${format === 'poster' ? 'selected' : ''}>Poster · tall · 2:3</option></select></div><div class="form-group"><label class="form-label" for="art-url">Destination link · optional</label><input class="form-input" id="art-url" name="url" inputmode="url" placeholder="https://your-friends-business.com" maxlength="2000" value="${esc(item?.url)}" /></div><div class="form-group"><label class="form-label" for="art-alt">Image description</label><textarea class="form-textarea" id="art-alt" name="alt" required maxlength="500" placeholder="Include the business name and any important words in the image.">${esc(item?.alt)}</textarea><small>Read aloud by screen readers. This text is not printed over the image.</small></div><div class="form-group"><label class="form-label" for="art-order">Rotation order</label><input class="form-input" type="number" id="art-order" name="position" min="0" max="10000" value="${item?.position || 0}" /></div><label class="art-active"><input type="checkbox" name="active" ${item?.active !== 0 ? 'checked' : ''} /> Include in rotation</label></div>
      <div><label class="form-label" for="art-file">${item?.image ? 'Replace artwork' : 'Choose artwork'}</label><input class="form-input" type="file" id="art-file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" /><p class="art-guidance" id="art-guidance"></p><div class="art-crop-preview ${format === 'poster' ? 'is-poster' : ''}" id="art-preview">${item?.image ? `<img src="${esc(item.image)}" alt="Current artwork preview" />` : '<span>Your image preview will appear here.</span>'}</div><fieldset class="art-crop-controls" id="art-crop-controls" hidden><legend>Adjust the crop</legend><label>Left / right<input type="range" id="art-x" min="0" max="100" value="50" /></label><label>Up / down<input type="range" id="art-y" min="0" max="100" value="50" /></label><label>Zoom<input type="range" id="art-zoom" min="100" max="250" value="100" /></label></fieldset><p class="art-save-status" id="art-save-status" role="status" aria-live="polite">${item?.image ? 'Saved artwork. Choose a file to replace it.' : 'JPEG, PNG, or WebP. We’ll prepare the size automatically.'}</p></div></div><div class="art-form-actions"><button class="button" id="save-artwork">Save image</button><span>Only the optimized image is uploaded · 500 KB maximum</span></div></form>`;
    const form = composer.querySelector<HTMLFormElement>('#art-form')!;
    const shape = () => (form.elements.namedItem('format') as HTMLSelectElement).value as PromotionFormat;
    const status = form.querySelector<HTMLElement>('#art-save-status')!;
    const preview = form.querySelector<HTMLElement>('#art-preview')!;
    const controls = form.querySelector<HTMLFieldSetElement>('#art-crop-controls')!;
    const guidance = () => { form.querySelector('#art-guidance')!.textContent = shape() === 'banner' ? 'Recommended: 1600 × 200 pixels. Crop to a slim 8:1 banner.' : 'Recommended: 800 × 1200 pixels. Crop to a tall 2:3 poster.'; preview.classList.toggle('is-poster', shape() === 'poster'); };
    guidance();
    const draw = () => {
      if (!artwork) return;
      let canvas = preview.querySelector('canvas'); if (!canvas) { canvas = document.createElement('canvas'); canvas.setAttribute('aria-label', 'Crop preview'); preview.replaceChildren(canvas); }
      drawArtwork(canvas, artwork.image, shape(), Number(form.querySelector<HTMLInputElement>('#art-x')!.value), Number(form.querySelector<HTMLInputElement>('#art-y')!.value), Number(form.querySelector<HTMLInputElement>('#art-zoom')!.value));
      pendingImage = ''; status.textContent = 'Crop preview. Adjust the sliders, then save.';
    };
    form.addEventListener('input', () => { unsaved = true; });
    form.querySelector('#art-format')!.addEventListener('change', () => { guidance(); draw(); if (!artwork && item?.image) status.textContent = 'Choose the artwork again to crop it for the new shape.'; });
    controls.addEventListener('input', draw);
    form.querySelector<HTMLInputElement>('#art-file')!.addEventListener('change', async event => {
      const fileInput = event.target as HTMLInputElement;
      const file = fileInput.files?.[0]; if (!file) return; fileInput.disabled = true; busy(1); saving = true; status.textContent = 'Opening image…';
      try { const loaded = await loadArtwork(file); artwork?.release(); artwork = loaded; controls.hidden = false; controls.querySelectorAll<HTMLInputElement>('input').forEach(el => el.value = el.id === 'art-zoom' ? '100' : '50'); draw(); unsaved = true; }
      catch (error) { status.textContent = (error as Error).message; toast((error as Error).message, true); }
      finally { fileInput.disabled = false; saving = false; busy(-1); }
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
          const photo = await api('media', { method: 'POST', headers: {'Content-Type': blob.type, 'X-File-Name': encodeURIComponent(`${String(data.name).slice(0,80)}-${shape()}.${extension}`)}, body: blob });
          image = pendingImage = photo.url;
        }
        status.textContent = 'Saving to the rotation…';
        await api('promotions', { method: 'POST', body: JSON.stringify({...data, id: recordId, image, active: !!data.active}) });
        items = await api('promotions'); closeComposer(); renderList(); await refreshUsage(); toast('Image saved. The rotation updates on the next page load.');
      } catch (error) { status.textContent = `${(error as Error).message} Your changes are still here. Try Save image again.`; toast((error as Error).message, true); }
      finally { saving = false; busy(-1); form.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement | HTMLTextAreaElement>('input,button,select,textarea').forEach(el => el.disabled = false); }
    });
    form.querySelector<HTMLInputElement>('#art-name')!.focus();
  }
  main.querySelector('#new-artwork')!.addEventListener('click', () => { if (!saving && canLeaveAds()) openComposer(); });
  main.querySelector('#art-library')!.addEventListener('click', options.openLibrary);
  main.querySelectorAll<HTMLButtonElement>('[data-format-filter]').forEach(button => button.addEventListener('click', () => { filter = button.dataset.formatFilter!; main.querySelectorAll<HTMLButtonElement>('[data-format-filter]').forEach(el => el.setAttribute('aria-pressed', String(el === button))); renderList(); }));
  renderList();
}
