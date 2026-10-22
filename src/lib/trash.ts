import {env} from 'cloudflare:workers';
export const trashCutoff=()=>new Date(Date.now()-30*24*60*60*1000).toISOString();
// Expired records are removed on the next editorial API visit. Shared photos stay in Photo library.
export async function purgeExpiredTrash(){const cutoff=trashCutoff();await env.DB.batch([env.DB.prepare('DELETE FROM stories WHERE deleted_at IS NOT NULL AND deleted_at<=?').bind(cutoff),env.DB.prepare('DELETE FROM gallery_posts WHERE deleted_at IS NOT NULL AND deleted_at<=?').bind(cutoff)]);}
