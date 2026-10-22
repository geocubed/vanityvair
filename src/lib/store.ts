import { env } from 'cloudflare:workers';
import type { Story, User, Promotion } from './types';
export async function publishedStories(): Promise<Story[]> {
  const { results } = await env.DB.prepare(`SELECT s.published_json, u.name AS author_name,u.slug AS author_slug,u.bio AS author_bio FROM stories s JOIN users u ON s.author_email=u.email WHERE s.published_json IS NOT NULL ORDER BY s.published_at DESC LIMIT 250`).all<any>();
  return results.map(row => ({ ...JSON.parse(row.published_json), author_name: row.author_name, author_slug: row.author_slug, author_bio: row.author_bio }));
}
export async function workingStory(id: string) { return env.DB.prepare('SELECT * FROM stories WHERE id=?').bind(id).first<Story>(); }
export async function author(slug: string) { return env.DB.prepare('SELECT * FROM users WHERE slug=?').bind(slug).first<User>(); }
export async function promotions() { return (await env.DB.prepare("SELECT * FROM promotions WHERE active=1 AND image!='' ORDER BY position,id").all<Promotion>()).results; }
export async function checkMedia(ids: string[], user: User) {
  for (const id of ids) {
    const row = await env.DB.prepare('SELECT owner_email FROM media WHERE id=?').bind(id).first<{owner_email:string}>();
    if (!row || (user.role !== 'owner' && row.owner_email !== user.email)) throw new Error('One of these photos is unavailable. Upload it again.');
  }
}
export function refStatements(storyId: string, ids: string[], visibility: string, token: string) {
  return [env.DB.prepare('DELETE FROM media_refs WHERE story_id=? AND visibility=? AND EXISTS(SELECT 1 FROM stories WHERE id=? AND save_token=?)').bind(storyId, visibility, storyId, token), ...ids.map(id => env.DB.prepare('INSERT INTO media_refs(media_id,story_id,visibility) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM stories WHERE id=? AND save_token=?)').bind(id, storyId, visibility, storyId, token))];
}
