import {env} from 'cloudflare:workers';
export type GalleryPhoto={media_id:string;description:string;photographer:string;is_screenshot:number;width:number;height:number};
export type GalleryPost = GalleryPhoto & {id:string;author_email:string;caption:string;created_at:string;hidden:number;author_name:string;author_slug:string;author_avatar:string;photos:GalleryPhoto[]};
export async function galleryPosts(includeHidden=false,email?:string,tag?:string){
 const conditions:string[]=['g.deleted_at IS NULL'];const values:string[]=[];
 if(!includeHidden)conditions.push('g.hidden=0');
 if(includeHidden&&email){conditions.push('g.author_email=?');values.push(email);}
 if(tag){conditions.push('EXISTS(SELECT 1 FROM gallery_tags t WHERE t.post_id=g.id AND t.tag=?)');values.push(tag);}
 const query=env.DB.prepare(`SELECT g.*,u.name AS author_name,u.slug AS author_slug,u.avatar AS author_avatar,m.description,m.photographer,m.is_screenshot,m.width,m.height FROM gallery_posts g JOIN users u ON u.email=g.author_email JOIN media m ON m.id=g.media_id ${conditions.length?'WHERE '+conditions.join(' AND '):''} ORDER BY g.created_at DESC,g.id DESC LIMIT 200`);
 const posts=(await query.bind(...values).all<GalleryPost>()).results;
 if(!posts.length)return posts;
 const photos=await env.DB.prepare(`SELECT i.post_id,i.media_id,m.description,m.photographer,m.is_screenshot,m.width,m.height FROM gallery_images i JOIN media m ON m.id=i.media_id WHERE i.post_id IN (${posts.map(()=>'?').join(',')}) ORDER BY i.position`).bind(...posts.map(post=>post.id)).all<GalleryPhoto & {post_id:string}>();
 return posts.map(post=>({...post,photos:photos.results.filter(photo=>photo.post_id===post.id)}));
}
