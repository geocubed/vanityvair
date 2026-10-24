import {env} from 'cloudflare:workers';
import type {User} from './types';
const resources:Record<string,string>={stories:'article',gallery:'gallery',media:'image',promotions:'ad',companies:'company',homepage:'website',profile:'profile',users:'people',trash:'trash'};
export async function activityBefore(path:string,body:Record<string,unknown>){
 const [resource,id,action]=path.split('/').filter(Boolean).slice(1);
 const tables:Record<string,string>={stories:'stories',gallery:'gallery_posts',media:'media',promotions:'promotions',companies:'promotion_companies'};
 if(resource==='trash'&&action&&['story','gallery'].includes(id))return await env.DB.prepare(`SELECT * FROM ${id==='story'?'stories':'gallery_posts'} WHERE id=?`).bind(action).first<Record<string,unknown>>();
 if(resource==='users'&&typeof (body.email||id)==='string')return await env.DB.prepare('SELECT email,name,bio,link,active FROM users WHERE email=?').bind(String(body.email||id).toLowerCase()).first<Record<string,unknown>>();
 const target=id||body.id;
 return tables[resource]&&typeof target==='string'?await env.DB.prepare(`SELECT * FROM ${tables[resource]} WHERE id=?`).bind(target).first<Record<string,unknown>>():null;
}
export async function recordActivity(user:User,path:string,method:string,response:Response,body:Record<string,unknown>={},before:Record<string,unknown>|null=null){
 const [resource,id,verb]=path.split('/').filter(Boolean).slice(1);
 const kind=resource==='trash'?(id==='story'?'article':'gallery'):resources[resource];
 if(!kind||!response.ok||['GET','HEAD','OPTIONS'].includes(method)||id==='preview')return;
 let result:Record<string,any>={};try{result=await response.clone().json();}catch{}
 const actions:Record<string,string>={submit:'Submitted for review',publish:'Published',unpublish:'Unpublished',return:'Returned to draft'};
 const action=resource==='users'&&id==='invite'?'Invitation created':resource==='trash'?'Restored':verb==='visibility'?(body.active?'Activated':'Paused'):actions[verb]|| (method==='DELETE'?(['stories','gallery'].includes(resource)?'Moved to Trash':resource==='users'?'Access removed':'Deleted'):method==='PUT'||before?'Updated':'Created');
 const title=String(result.title||result.name||body.name||before?.title||before?.name||(typeof before?.caption==='string'?before.caption.slice(0,80):'')|| (resource==='homepage'?'Homepage spotlight':resource==='profile'?'Profile photo':resource==='media'?'Photo details':resource==='gallery'?'Gallery post':resource==='stories'?'Article':resource)).slice(0,180);
 const allowed=['title','deck','category','body','hero','caption','photo_credit','media_ids','media_id','post_date','description','photographer','is_screenshot','hidden','name','company_id','image','alt','format','active','url','story_id','avatar','bio'];
 const fields=Object.keys(body).filter(key=>allowed.includes(key)&&(!before||!(key in before)||String(before[key]??'')!==String(body[key]??'')));
 if(method==='PUT'&&before&&!fields.length)return;
 const labels:Record<string,string>={deck:'introduction',body:'story text',hero:'cover photo',hero_alt:'photo metadata',photo_credit:'photo credit',media_ids:'photos',post_date:'publication date',alt:'image metadata',story_id:'hero selection'};
 const summary=fields.length?`Saved ${fields.map(key=>labels[key]||key.replaceAll('_',' ')).join(', ')}.`:method==='DELETE'?'Removed from current use.':resource==='media'?'Uploaded a web-ready image.':`${action} ${kind}.`;
 await env.DB.prepare('INSERT INTO kitchen_activity(actor_email,actor_name,kind,target_id,title,action,summary,created_at) VALUES(?,?,?,?,?,?,?,?)').bind(user.email,user.name,kind,String(result.id||(resource==='trash'?verb:id)||body.id||''),title,action,summary,new Date().toISOString()).run();
}
