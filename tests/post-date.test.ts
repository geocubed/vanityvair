import {it,expect} from 'vitest';
import {parsePostDate,postDateInput} from '../src/lib/post-date';
it('keeps chosen calendar dates in Vancouver across daylight saving changes',()=>{
 for(const date of ['2026-01-01','2026-03-08','2026-11-01','2024-02-29'])expect(postDateInput(parsePostDate(date))).toBe(date);
 expect(postDateInput('2026-10-23T02:00:00Z')).toBe('2026-10-22');
});
it('rejects invalid dates instead of silently rolling into the next month',()=>{
 for(const date of ['2026-02-29','2026-04-31','2026-13-01','tomorrow','',null,42])expect(()=>parsePostDate(date)).toThrow();
});
