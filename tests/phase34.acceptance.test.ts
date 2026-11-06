import {describe,expect,it} from 'vitest';
import {createLesson,replay,historyStatus} from '@edushare/lesson-format';
import {parseLesson} from '@edushare/lesson-format';
import {planHandwriting} from '@edushare/stroke-engine';
import type {BoardAction} from '@edushare/shared-types';
const blank=()=>{const lesson=createLesson({id:'phase34',title:'Teacher board'});
  lesson.pages=[{id:'pg1',index:0},{id:'pg2',index:1}];return lesson;};
const ink={points:[{x:0,y:0},{x:20,y:20}],width:3,color:'#ffffff',durationMs:200};
describe('Phase 03/04 board integration + event source',()=>{
  it('draws, erases and undoes erasure without overwriting the source or needing a server',()=>{
    const l=blank();l.actions=[
      {id:'a1',type:'page.add',pageId:'pg1',t:0},
      {id:'a2',type:'ink.draw',pageId:'pg1',t:1,stroke:ink},
      {id:'a3',type:'ink.erase',pageId:'pg1',t:2,strokeIds:['a2']},
    ];
    expect(replay(l).pages[0]?.ink).toHaveLength(0);
    l.actions.push({id:'a4',type:'history.undo',targetActionId:'a3',t:3});
    expect(replay(l).pages[0]?.ink.map(a=>a.id)).toEqual(['a2']);
    expect(replay(l,2).pages[0]?.ink).toHaveLength(0);
    l.actions.push({id:'a5',type:'history.redo',targetActionId:'a3',t:4});
    expect(replay(l).pages[0]?.ink).toHaveLength(0);
    expect(historyStatus(l.actions).canUndo).toBe('a3');
    expect(parseLesson(l).ok).toBe(true);
  });
  it('invalidates redo after a new edit while preserving all event history',()=>{
    const l=blank();l.actions=[
      {id:'a1',type:'page.add',pageId:'pg1',t:0},
      {id:'a2',type:'ink.draw',pageId:'pg1',t:1,stroke:ink},
      {id:'a3',type:'history.undo',targetActionId:'a2',t:2},
      {id:'a4',type:'ink.draw',pageId:'pg1',t:3,stroke:ink},
    ];
    expect(historyStatus(l.actions).canRedo).toBeNull();
    expect(replay(l).pages[0]?.ink.map(s=>s.id)).toEqual(['a4']);
    l.actions.push({id:'a5',type:'history.undo',targetActionId:'a4',t:4});
    expect(historyStatus(l.actions).canRedo).toBe('a4');
  });
  it('keeps drawing and placed content on separate pages, then clears only one',()=>{
    const l=blank();l.selections=[{id:'sel',sourceId:'s1',page:1,kind:'crop',bbox:{x:1,y:1,width:10,height:10},cropAssetId:'asset'}];
    l.sources=[{id:'s1',fileName:'source.pdf',sha256:'a'.repeat(64),pageCount:2}];
    l.actions=[
      {id:'a1',t:0,type:'page.add',pageId:'pg1'},
      {id:'a2',t:1,type:'page.add',pageId:'pg2'},
      {id:'a3',t:2,type:'ink.draw',pageId:'pg1',stroke:ink},
      {id:'a4',t:3,type:'content.place',pageId:'pg2',selectionId:'sel',mode:'crop',target:{x:50,y:50,width:200,height:180}},
      {id:'a5',t:4,type:'page.show',pageId:'pg2'},
      {id:'a6',t:5,type:'board.clear',pageId:'pg1'},
    ];
    expect(replay(l).pages[0]?.ink).toHaveLength(0);
    expect(replay(l).pages[1]?.content).toHaveLength(1);
    expect(replay(l).currentPageId).toBe('pg2');
    l.actions.push({id:'a7',t:6,type:'history.undo',targetActionId:'a6'});
    expect(replay(l).pages[0]?.ink).toHaveLength(1);
    expect(parseLesson(l).ok).toBe(true);
  });
  it('replays each word of handwriting with stroke start times deterministically',()=>{
    const l=blank();l.selections=[{id:'s1',sourceId:'src',page:1,kind:'text',text:'One',bbox:{x:1,y:1,width:30,height:12}}];
    l.sources=[{id:'src',fileName:'x.pdf',sha256:'b'.repeat(64),pageCount:1}];
    const plan=planHandwriting({text:'One',x:20,y:30,maxWidth:900});
    l.actions=[{id:'p1',t:0,type:'page.add',pageId:'pg1'},
      {id:'c1',t:1,type:'content.place',pageId:'pg1',selectionId:'s1',target:{x:0,y:0,width:1000,height:180},mode:'handwriting'},
      ...plan.strokes.map((s,i):BoardAction=>({id:`st${i}`,t:2+s.startMs,type:'stroke.write',pageId:'pg1',contentId:'c1',stroke:s}))];
    expect(replay(l).pages[0]?.content[0]?.strokes).toHaveLength(plan.strokes.length);
    expect(replay(l,1).pages[0]?.content[0]?.strokes).toHaveLength(0);
    expect(replay(l)).toEqual(replay(structuredClone(l)));
    expect(parseLesson(l).ok).toBe(true);
  });
});
