import {describe,it,expect} from 'vitest';
import {planExport,exportMetadata} from './index';
const lesson={segments:[{id:'s1',startMs:100,endMs:5100,status:'complete' as const},{id:'s2',startMs:5200,endMs:8200,status:'complete' as const}],
 timeline:{clips:[{id:'c2',segmentId:'s2',sourceInMs:0,sourceOutMs:3000,rate:1.5},{id:'c1',segmentId:'s1',sourceInMs:1500,sourceOutMs:3500,rate:1}],excludedSegmentIds:[]}};
describe('Phase 08 deterministic export plan',()=>{
 it('respects non-destructive trims, speed and clip ordering',()=>{
  const p=planExport(lesson);expect(p.durationMs).toBe(4000);expect(p.clips.map(c=>c.segmentId)).toEqual(['s2','s1']);
  expect(p.clips[1]!.targetStartMs).toBe(2000);expect(p.width).toBe(1920);expect(p.height).toBe(1080);
 });
 it('rejects unready media and misleading MP4 claims',()=>{
  expect(()=>planExport({...lesson,segments:[]})).toThrow();
  const p=planExport(lesson);const m=exportMetadata({id:'lesson',title:'Title',sources:[]},p,'video/webm');
  expect(m.mimeType).toBe('video/webm');
 });
});
