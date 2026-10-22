import { env } from 'cloudflare:workers';
import { photoCredit, type PhotoMetadata } from './photo-metadata';
import { cleanBody, mediaIds } from './content';
import type { Story, User, Promotion } from './types';
export async function publishedStories(): Promise<Story[]> {
  const { results } = await env.DB.prepare(`SELECT s.published_json, u.name AS author_name,u.slug AS author_slug,u.bio AS author_bio,u.avatar AS author_avatar FROM stories s JOIN users u ON s.author_email=u.email WHERE s.deleted_at IS NULL AND s.published_json IS NOT NULL ORDER BY s.published_at DESC LIMIT 250`).all<any>();
  return results.map(row => ({ ...JSON.parse(row.published_json), author_name: row.author_name, author_slug: row.author_slug, author_bio: row.author_bio, author_avatar: row.author_avatar }));
}
export async function workingStory(id: string) { return env.DB.prepare('SELECT * FROM stories WHERE id=? AND deleted_at IS NULL').bind(id).first<Story>(); }
export async function author(slug: string) { return env.DB.prepare('SELECT email,name,role,bio,slug,link,active,avatar FROM users WHERE slug=?').bind(slug).first<User>(); }
export async function promotions() { return (await env.DB.prepare("SELECT * FROM promotions WHERE active=1 AND image!='' ORDER BY position,id").all<Promotion>()).results; }
export async function checkMedia(ids: string[], user: User) {
  const descriptions: Record<string,PhotoMetadata> = {};
  for (const id of ids) {
    const row = await env.DB.prepare('SELECT owner_email,description,photographer,is_screenshot FROM media WHERE id=?').bind(id).first<PhotoMetadata & {owner_email:string}>();
    if (!row || (user.role !== 'owner' && row.owner_email !== user.email)) throw new Error('One of these photos is unavailable. Upload it again.');
    descriptions[`/media/${id}`] = row;
  }
  return descriptions;
}
export function refStatements(storyId: string, ids: string[], visibility: string, token: string) {
  return [env.DB.prepare('DELETE FROM media_refs WHERE story_id=? AND visibility=? AND EXISTS(SELECT 1 FROM stories WHERE id=? AND save_token=?)').bind(storyId, visibility, storyId, token), ...ids.map(id => env.DB.prepare('INSERT INTO media_refs(media_id,story_id,visibility) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM stories WHERE id=? AND save_token=?)').bind(id, storyId, visibility, storyId, token))];
}

// Library metadata is authoritative, including after a photo is credited or corrected later.
export async function hydrateStoryPhotos(story: Story): Promise<Story> {
  const ids = mediaIds(`${story.hero} ${story.body}`);
  if (!ids.length) return story;
  const {results} = await env.DB.prepare(`SELECT id,description,photographer,is_screenshot FROM media WHERE id IN (${ids.map(()=>'?').join(',')})`).bind(...ids).all<PhotoMetadata & {id:string}>();
  const photos = Object.fromEntries(results.map(photo=>[`/media/${photo.id}`,photo]));
  const cover = photos[story.hero];
  return {...story,body:cleanBody(story.body,photos),...(cover ? {hero_alt:cover.description || story.hero_alt,photo_credit:photoCredit(cover) || story.photo_credit} : {})};
}
