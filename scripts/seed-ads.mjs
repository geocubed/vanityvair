// Local-only sample artwork. These four named demo records are reset to the bundled fixtures.
import { readFileSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
const config = JSON.parse(readFileSync('wrangler.jsonc', 'utf8'));
if (config.vars.APP_ENV !== 'local') throw new Error('Sample artwork is only for the local database.');
const samples = [
  ['101','demo-promo','studio-banner','banner','Good Company Studio','Good Company Studio. Good company. Great work. Small crews. Big ideas.'],
  ['102','demo-promo-02','camera-banner','banner','North Shore Camera','North Shore Camera. Rent the kit. Keep the day. Your next frame.'],
  ['103','demo-promo-03','coffee-poster','poster','Soft Focus Coffee','Soft Focus Coffee. Early calls. Late wraps. Good coffee. A little kindness in a cup.'],
  ['104','demo-promo-04','studio-poster','poster','Good Company Studio','Good Company Studio. Make something good. A creative studio for whatever comes next.'],
];
const quote = value => `'${String(value).replaceAll("'", "''")}'`;
mkdirSync('.wrangler/seed-artwork', { recursive: true });
const sql = [];
for (const [suffix, id, filename, format, name, alt] of samples) {
  const mediaId = `00000000-0000-4000-8000-000000000${suffix}`;
  const path = `.wrangler/seed-artwork/${filename}.webp`;
  const size = format === 'banner' ? { width: 1600, height: 400 } : { width: 400, height: 1600 };
  const result = await sharp(`scripts/assets/${filename}.svg`).resize(size.width, size.height).webp({ quality: 92 }).toFile(path);
  execFileSync('npx', ['wrangler','r2','object','put',`${config.r2_buckets[0].bucket_name}/${mediaId}`,'--local','--file',path,'--content-type','image/webp'], { stdio: 'inherit' });
  sql.push(`INSERT INTO media(id,owner_email,bytes,mime,name,created_at,width,height) VALUES(${quote(mediaId)},'editor@vanityvair.example',${statSync(path).size},'image/webp',${quote(filename+'.webp')},datetime('now'),${result.width},${result.height}) ON CONFLICT(id) DO UPDATE SET bytes=excluded.bytes,mime=excluded.mime,name=excluded.name,width=excluded.width,height=excluded.height;`);
  sql.push(`INSERT OR IGNORE INTO promotions(id,name,headline,description,url,image,active,position,format,alt) VALUES(${quote(id)},${quote(name)},'','','/about#promotions','',1,${Number(suffix)-101},${quote(format)},'');`);
  sql.push(`UPDATE promotions SET image=${quote('/media/'+mediaId)},format=${quote(format)},alt=${quote(alt)} WHERE id=${quote(id)};`);
}
writeFileSync('.wrangler/seed-artwork/demo.sql', sql.join('\n'));
execFileSync('npx',['wrangler','d1','execute','DB','--local','--file','.wrangler/seed-artwork/demo.sql'],{stdio:'inherit'});
