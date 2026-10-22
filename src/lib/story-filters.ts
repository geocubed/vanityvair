import type { Story } from './types';
export type StoryFilters = { search:string; contributor:string; topic:string; status:string; from:string; to:string; sort:string };
export const emptyStoryFilters = (): StoryFilters => ({search:'',contributor:'',topic:'',status:'',from:'',to:'',sort:'updated'});
const postedDate = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Vancouver',year:'numeric',month:'2-digit',day:'2-digit'});
export function localPostedDate(value:string) {
  const parts=postedDate.formatToParts(new Date(value));
  return ['year','month','day'].map(type=>parts.find(part=>part.type===type)!.value).join('-');
}
export function filterStories(stories:Story[], filters:StoryFilters) {
  const query=filters.search.trim().toLocaleLowerCase();
  return stories.filter(story=>{
    if(query && !`${story.title} ${story.deck} ${story.author_name || ''}`.toLocaleLowerCase().includes(query))return false;
    if(filters.contributor && story.author_email!==filters.contributor)return false;
    if(filters.topic && (story.category || 'uncategorized')!==filters.topic)return false;
    if(filters.status==='published' && !story.published_json)return false;
    if(filters.status==='draft' && story.status==='published')return false;
    if(filters.status==='review' && story.status!=='review')return false;
    if(filters.from || filters.to){
      if(!story.published_at)return false;
      const day=localPostedDate(story.published_at);
      if(filters.from && day<filters.from || filters.to && day>filters.to)return false;
    }
    return true;
  }).sort((a,b)=>{
    if(filters.sort==='title')return a.title.localeCompare(b.title);
    if(filters.sort==='posted-oldest')return (a.published_at ? Date.parse(a.published_at) : Infinity)-(b.published_at ? Date.parse(b.published_at) : Infinity) || a.id.localeCompare(b.id);
    if(filters.sort==='posted-newest')return (b.published_at ? Date.parse(b.published_at) : -Infinity)-(a.published_at ? Date.parse(a.published_at) : -Infinity) || a.id.localeCompare(b.id);
    return Date.parse(b.updated_at)-Date.parse(a.updated_at) || a.id.localeCompare(b.id);
  });
}
