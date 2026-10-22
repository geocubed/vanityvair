import {describe,it,expect} from 'vitest';
import {filterStories,emptyStoryFilters,localPostedDate} from '../src/lib/story-filters';
import type {Story} from '../src/lib/types';
const stories=[
  {id:'1',title:'A premiere',deck:'A big night',author_email:'maya@example.com',author_name:'Maya Chen',category:'Achievements',status:'published',published_json:'{}',published_at:'2026-10-21T01:00:00Z',updated_at:'2026-10-21T01:00:00Z'},
  {id:'2',title:'Behind the scenes',deck:'Photo diary',author_email:'eli@example.com',author_name:'Eli Morgan',category:'Projects',status:'draft',published_json:'{}',published_at:'2026-10-19T19:00:00Z',updated_at:'2026-10-22T17:00:00Z'},
  {id:'3',title:'An invitation',deck:'New gathering',author_email:'maya@example.com',author_name:'Maya Chen',category:'Announcements',status:'review',published_json:null,published_at:null,updated_at:'2026-10-22T18:00:00Z'},
  {id:'4',title:'A thought',deck:'',author_email:'eli@example.com',author_name:'Eli Morgan',category:'',status:'draft',published_json:null,published_at:null,updated_at:'2026-10-22T16:00:00Z'},
] as Story[];
describe('owner story filters',()=>{
  it('combines contributor, topic, status, search, and inclusive Vancouver publication dates',()=>{
    const result=filterStories(stories,{...emptyStoryFilters(),contributor:'maya@example.com',topic:'Achievements',status:'published',search:'big night',from:'2026-10-20',to:'2026-10-20'});
    expect(result.map(story=>story.id)).toEqual(['1']);
    expect(localPostedDate('2026-10-21T01:00:00Z')).toBe('2026-10-20');
  });
  it('excludes unposted drafts when publication dates are selected',()=>{
    expect(filterStories(stories,{...emptyStoryFilters(),from:'2026-10-19'}).map(story=>story.id)).toEqual(['2','1']);
    expect(filterStories(stories,{...emptyStoryFilters(),topic:'uncategorized'}).map(story=>story.id)).toEqual(['4']);
    expect(filterStories(stories,{...emptyStoryFilters(),status:'review'}).map(story=>story.id)).toEqual(['3']);
  });
  it('shows drafts, published, or both and combines status with category',()=>{
    expect(filterStories(stories,{...emptyStoryFilters(),status:'draft'}).map(story=>story.id)).toEqual(['3','2','4']);
    expect(filterStories(stories,{...emptyStoryFilters(),status:'published',topic:'Achievements'}).map(story=>story.id)).toEqual(['1']);
    expect(filterStories(stories,emptyStoryFilters())).toHaveLength(4);
  });
  it('sorts posted stories in either direction, with unposted stories last',()=>{
    expect(filterStories(stories,{...emptyStoryFilters(),sort:'posted-newest'}).map(story=>story.id)).toEqual(['1','2','3','4']);
    expect(filterStories(stories,{...emptyStoryFilters(),sort:'posted-oldest'}).map(story=>story.id)).toEqual(['2','1','3','4']);
    expect(filterStories(stories,{...emptyStoryFilters(),status:'published'}).map(story=>story.id)).toEqual(['2','1']);
  });
});
