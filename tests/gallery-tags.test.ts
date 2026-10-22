import {describe,it,expect} from 'vitest';
import {hashtags,captionParts} from '../src/lib/gallery-tags';
describe('Gallery hashtags',()=>{
 it('normalizes and deduplicates whole tags without matching fragments',()=>{
  expect(hashtags('Today #ShotOniPhone, #shotoniphone #café #35mm #behind_the_scenes')).toEqual(['shotoniphone','café','35mm','behind_the_scenes']);
  expect(hashtags('word#no ##no https://example.com/#fragment')).toEqual(['fragment']);
  expect(hashtags('#'+'a'.repeat(65))).toEqual([]);
 });
 it('keeps all caption text intact while marking links',()=>{
  const caption='A little <script> & #ShotOnIPhone!\n#café';
  const parts=captionParts(caption);expect(parts.map(part=>part.text).join('')).toBe(caption);expect(parts.filter(part=>part.tag).map(part=>part.tag)).toEqual(['shotoniphone','café']);
 });
});
