export async function showSitePreview(url:string,title:string){
 const dialog=document.createElement('dialog');dialog.className='site-preview-dialog';dialog.setAttribute('aria-label',title);
 const header=document.createElement('header');const heading=document.createElement('h2');heading.textContent=title;
 const close=document.createElement('button');close.type='button';close.className='button secondary';close.textContent='Back to editing';close.addEventListener('click',()=>dialog.close());header.append(heading,close);
 const status=document.createElement('p');status.setAttribute('role','status');status.textContent='Preparing your preview…';
 const viewport=document.createElement('div');viewport.className='site-preview-viewport';const frame=document.createElement('iframe');frame.title=title;viewport.append(frame);dialog.append(header,status,viewport);
 dialog.addEventListener('close',()=>dialog.remove(),{once:true});document.body.append(dialog);dialog.showModal();
 try{
  const response=await fetch(url);if(!response.ok)throw new Error('This story is no longer published. Choose another story to preview.');
  const doc=new DOMParser().parseFromString(await response.text(),'text/html');const base=document.createElement('base');base.href=location.origin;doc.head.prepend(base);doc.querySelectorAll('script').forEach(script=>script.remove());
  if(!dialog.open)return;
  frame.srcdoc='<!doctype html>'+doc.documentElement.outerHTML;status.textContent='Desktop layout · Preview only; your homepage selection has not changed.';
  const resize=()=>{const scale=viewport.clientWidth/1200;frame.style.transform=`scale(${scale})`;viewport.style.height=`${1000*scale}px`;};resize();const observer=new ResizeObserver(resize);observer.observe(viewport);dialog.addEventListener('close',()=>observer.disconnect(),{once:true});
 }catch(error){status.textContent=(error as Error).message;viewport.remove();}
}
