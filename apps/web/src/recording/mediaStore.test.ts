import 'fake-indexeddb/auto';
import {describe,it,expect} from 'vitest';
import {LocalMediaChunks} from './mediaStore';

describe('recording chunk persistence',()=>{
 it('saves chronological mixed A/V chunks by lesson and segment',async()=>{
  const store=new LocalMediaChunks();const lesson='media-test-'+crypto.randomUUID();
  await store.save({id:LocalMediaChunks.idFor(lesson,'segment',1),lessonId:lesson,segmentId:'segment',seq:1,elapsedMs:2000,mimeType:'video/webm',data:new Blob(['B'])});
  await store.save({id:LocalMediaChunks.idFor(lesson,'segment',0),lessonId:lesson,segmentId:'segment',seq:0,elapsedMs:1000,mimeType:'video/webm',data:new Blob(['A'])});
  const items=await store.readSegment(lesson,'segment');expect(items.map(x=>x.seq)).toEqual([0,1]);
  expect(await (await store.toBlob(lesson,'segment'))!.text()).toBe('AB');
  expect(await store.toBlob(lesson,'other')).toBeNull();
 });
});
