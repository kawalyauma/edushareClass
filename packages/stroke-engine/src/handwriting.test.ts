import {describe,expect,it} from 'vitest';
import {availableGlyphs,glyphPath,planHandwriting,partialStrokePoints,glyphTimeline} from './index';

describe('Phase 03 — original handwritten pen paths',()=>{
  it('covers A-Z a-z digits and core punctuation as real strokes',()=>{
    for(const c of [...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789,.!?+-=/()[]']){
      const path=glyphPath(c);
      expect(path,`missing ${c}`).not.toBeNull();
      expect(path!.length).toBeGreaterThan(0);
      for(const stroke of path!)expect(stroke.length).toBeGreaterThanOrEqual(2);
    }
    expect(availableGlyphs().length).toBeGreaterThanOrEqual(85);
  });
  it('wraps lines and preserves spacing and explicitly flags unknown characters',()=>{
    const plan=planHandwriting({text:'Hello pupils 🌍',x:0,y:0,maxWidth:240,emSize:40});
    expect(plan.lineCount).toBeGreaterThan(1);
    expect(plan.unsupported).toEqual([{char:'🌍',index:13}]);
    expect(plan.strokes.every(s=>s.startMs>=0&&s.durationMs>=80)).toBe(true);
    expect(plan.endMs).toBeGreaterThan(200);
  });
  it('has deterministic timelines and arc-length partial stroke drawing',()=>{
    const plan=planHandwriting({text:'A + 12',x:10,y:20,maxWidth:900});
    expect(planHandwriting({text:'A + 12',x:10,y:20,maxWidth:900})).toEqual(plan);
    expect(glyphTimeline(plan,0).length).toBe(1);
    expect(glyphTimeline(plan,Infinity).length).toBe(plan.strokes.length);
    const path=[{x:0,y:0},{x:3,y:4},{x:3,y:14}];
    expect(partialStrokePoints(path,0.5).at(-1)).toMatchObject({x:3,y:6.5});
    expect(partialStrokePoints(path,1)).toBe(path);
  });
  it('slower pace expands all duration and pauses without altering coordinates',()=>{
    const fast=planHandwriting({text:'P5 SST',x:0,y:0,maxWidth:900,speed:2});
    const slow=planHandwriting({text:'P5 SST',x:0,y:0,maxWidth:900,speed:.5});
    expect(slow.endMs).toBeGreaterThan(fast.endMs);
    expect(slow.strokes[0]?.points).toEqual(fast.strokes[0]?.points);
    expect(()=>planHandwriting({text:'x',x:0,y:0,maxWidth:0})).toThrow(/maxWidth/);
  });
});
