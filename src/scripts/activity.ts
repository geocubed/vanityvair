type Options={main:HTMLElement;api:(path:string,init?:RequestInit)=>Promise<any>;toast:(message:string,error?:boolean)=>void;refreshBadge:()=>Promise<void>};
const esc=(value:unknown)=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const kinds=[['article','Articles'],['image','Images'],['gallery','Gallery'],['website','Website'],['ad','Ads'],['company','Companies'],['profile','Profiles'],['people','People'],['trash','Trash']];
export async function mountActivity({main,api,toast,refreshBadge}:Options){
 main.innerHTML=`<div class="desk-heading"><div><span class="eyebrow category">WHAT’S COOKING</span><h1>The Kitchen log.</h1><p>Who changed what, and when. Content activity is recorded from this update onward; website releases appear here as plain-language notes.</p></div><button class="button secondary" id="activity-read">Mark all as read</button></div><div class="activity-filters"><label>Contributor<select class="form-select" id="activity-contributor"><option value="">Everyone</option></select></label><label>Area<select class="form-select" id="activity-kind"><option value="">All areas</option>${kinds.map(([value,label])=>`<option value="${value}">${label}</option>`).join('')}</select></label><label>Type of edit<select class="form-select" id="activity-action"><option value="">All edits</option></select></label><label>Article<select class="form-select" id="activity-target"><option value="">All articles</option></select></label></div><p id="activity-status" role="status"></p><div id="activity-items"></div><button class="button secondary" id="activity-more" hidden>Load older activity</button>`;
 let latest=0,before=0,request=0,loaded=false;
 const filters=['contributor','kind','action','target'];
 async function load(append=false){
  const version=++request;const query=new URLSearchParams();
  for(const name of filters){const value=main.querySelector<HTMLSelectElement>(`#activity-${name}`)!.value;if(value)query.set(name,value);}
  if(append&&before)query.set('before',String(before));
  main.querySelector('#activity-status')!.textContent='Checking the Kitchen…';
  try{
   const data=await api(`activity?${query}`);if(version!==request||!main.querySelector('#activity-items'))return;
   latest=data.latest;void refreshBadge();
   const options=(id:string,rows:any[],value:(row:any)=>string,label:(row:any)=>string)=>{const select=main.querySelector<HTMLSelectElement>(id)!;if(loaded)return;for(const row of rows)select.add(new Option(label(row),value(row)));};
   options('#activity-contributor',data.contributors,row=>row.actor_email,row=>row.actor_name);
   options('#activity-action',data.actions,row=>row.action,row=>row.action);
   options('#activity-target',data.articles,row=>row.target_id,row=>row.title);
   loaded=true;
   const markup=data.items.map((item:any)=>`<article class="activity-entry${item.seq>data.seen?' is-unread':''}"><div class="activity-entry-meta"><span>${esc(kinds.find(([key])=>key===item.kind)?.[1]||item.kind)} · ${esc(item.action)}</span><time datetime="${esc(item.created_at)}">${esc(new Date(item.created_at).toLocaleString('en-CA',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Vancouver'}))}</time>${item.seq>data.seen?'<span class="activity-new">NEW</span>':''}</div><h2>${esc(item.title)}</h2><p>${esc(item.summary)}</p><small>${esc(item.actor_name)}</small></article>`).join('');
   const list=main.querySelector('#activity-items')!;if(append)list.insertAdjacentHTML('beforeend',markup);else list.innerHTML=markup||'<div class="desk-empty"><h2>Nothing on the stove.</h2><p>No activity matches these filters.</p></div>';
   before=data.items.at(-1)?.seq||0;main.querySelector<HTMLButtonElement>('#activity-more')!.hidden=!data.has_more;
   main.querySelector('#activity-status')!.textContent=`${data.unread} unread update${data.unread===1?'':'s'} · times in Vancouver`;
  }catch(error){if(version===request)main.querySelector('#activity-status')!.textContent=(error as Error).message;}
 }
 for(const name of filters)main.querySelector(`#activity-${name}`)!.addEventListener('change',()=>void load());
 main.querySelector('#activity-more')!.addEventListener('click',()=>void load(true));
 main.querySelector<HTMLButtonElement>('#activity-read')!.addEventListener('click',async event=>{const button=event.currentTarget as HTMLButtonElement;button.disabled=true;try{await api('activity/read',{method:'POST',body:JSON.stringify({seq:latest})});await refreshBadge();await load();toast('Kitchen log marked as read.');}catch(error){toast((error as Error).message,true);}finally{button.disabled=false;}});
 await load();
}
