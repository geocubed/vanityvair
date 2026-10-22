// Illustrative, local-only Gallery fixtures. Existing posts are preserved.
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import sharp from 'sharp';
const config=JSON.parse(readFileSync('wrangler.jsonc','utf8'));
if(config.vars.APP_ENV!=='local')throw new Error('Gallery samples are local-only.');
const demo=JSON.parse(readFileSync('src/data/demo.json','utf8'));
const captions=['No shot list today. Just looking.','The best seat is the one next to your friends. #behindthescenes','One more take, then coffee. #behindthescenes','An ordinary afternoon, well spent.'];
const samples=[demo.stories[4],demo.stories[0],demo.stories[2],demo.stories[5]];
const quote=v=>`'${String(v).replaceAll("'","''")}'`;
mkdirSync('.wrangler/seed-gallery',{recursive:true});
const sql=[];
for(let i=0;i<samples.length;i++){
 const story=samples[i];const id=`00000000-0000-4000-8000-00000000020${i}`;
 const path=`.wrangler/seed-gallery/${id}.webp`;
 const response=await fetch(story.hero);if(!response.ok)throw new Error('Sample photo unavailable.');
 const image=await sharp(Buffer.from(await response.arrayBuffer())).resize({width:1200,height:1400,fit:'inside',withoutEnlargement:true}).webp({quality:75}).toBuffer({resolveWithObject:true});
 writeFileSync(path,image.data);
 execFileSync('npx',['wrangler','r2','object','put',`${config.r2_buckets[0].bucket_name}/${id}`,'--local','--file',path,'--content-type','image/webp'],{stdio:'inherit'});
 sql.push(`INSERT OR IGNORE INTO media(id,owner_email,bytes,mime,name,created_at,width,height,description,photographer,is_screenshot) VALUES(${quote(id)},${quote(story.author_email)},${image.data.length},'image/webp','Gallery sample',${quote(story.published_at)},${image.info.width},${image.info.height},${quote(story.hero_alt)},'Unsplash (illustrative sample)',0);`);
 sql.push(`INSERT OR IGNORE INTO gallery_posts(id,author_email,media_id,caption,created_at) VALUES('demo-gallery-${i}',${quote(story.author_email)},${quote(id)},${quote(captions[i])},${quote(story.published_at)});`);
 sql.push(`INSERT OR IGNORE INTO gallery_images(post_id,media_id,position) VALUES('demo-gallery-${i}',${quote(id)},0);`);
 for(const tag of captions[i].matchAll(/#([a-z0-9_]+)/g))sql.push(`INSERT OR IGNORE INTO gallery_tags(post_id,tag) SELECT id,${quote(tag[1])} FROM gallery_posts WHERE id='demo-gallery-${i}' AND caption=${quote(captions[i])};`);
}
sql.push("INSERT OR IGNORE INTO gallery_images(post_id,media_id,position) VALUES('demo-gallery-1','00000000-0000-4000-8000-000000000200',1);");
writeFileSync('.wrangler/seed-gallery/demo.sql',sql.join('\n'));
execFileSync('npx',['wrangler','d1','execute','DB','--local','--file','.wrangler/seed-gallery/demo.sql'],{stdio:'inherit'});
