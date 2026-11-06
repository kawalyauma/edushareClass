import {describe,it,expect} from 'vitest';
import {effectiveTimeline,editTimeline,appendTimelineHistory,undoTimeline,redoTimeline,locateTimelineTime,timelineDuration} from './index';
const a={id:'a',startMs:100,endMs:1100,status:'complete' as const};
const b={id:'b',startMs:1101,endMs:2101,status:'complete' as const};
const fixture={segments:[a,b]};
describe('Phase 07 non-destructive editor',()=>{
 it('derives clips, maps board time, and applies trims without touching source',()=>{
  const first=effectiveTimeline(fixture);
  const next=editTimeline({...fixture,timeline:first},{type:'trim',clipId:'clip:a',sourceInMs:250,sourceOutMs:750});
  expect(next.clips[0]).toMatchObject({sourceInMs:250,sourceOutMs:750});
  expect(a.endMs).toBe(1100);
  expect(timelineDuration(next.clips)).toBe(1500);
  expect(locateTimelineTime({...fixture,timeline:next},100)).toMatchObject({sourceTimeMs:450});
 });
 it('does not reinsert deleted clips after a reload',()=>{
  const deleted=editTimeline(fixture,{type:'delete',clipId:'clip:a'});
  expect(effectiveTimeline({...fixture,timeline:deleted}).clips.map(c=>c.segmentId)).toEqual(['b']);
 });
 it('supports a deterministic ordered undo/redo history',()=>{
  const edited=appendTimelineHistory(fixture,editTimeline(fixture,{type:'move',clipId:'clip:b',direction:-1}));
  const undone=undoTimeline({...fixture,...edited})!;
  expect(undone.timeline.clips[0]?.segmentId).toBe('a');
  expect(redoTimeline({...fixture,...undone})!.timeline.clips[0]?.segmentId).toBe('b');
 });
 it('rejects invalid trim ranges',()=>{
  expect(()=>editTimeline(fixture,{type:'trim',clipId:'clip:a',sourceInMs:300,sourceOutMs:300})).toThrow();
 });
 it('appends later completed recordings to a saved edit',()=>{
  const old=editTimeline(fixture,{type:'delete',clipId:'clip:a'});
  expect(effectiveTimeline({segments:[...fixture.segments,{id:'c',startMs:2102,endMs:3102,status:'complete'}],timeline:old}).clips.map(c=>c.segmentId)).toEqual(['b','c']);
 });
});
