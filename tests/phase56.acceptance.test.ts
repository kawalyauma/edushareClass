import {describe,it,expect} from 'vitest';
import {parseMath,layoutMath,positionLabels} from '@edushare/math-notation';
import {SessionClock,supportedRecorderMime} from '@edushare/recording-core';

describe('Phase 05 → 06 source fidelity and media boundaries',()=>{
 it('never fabricates unknown maths and preserves the extracted PDF text exactly',()=>{
  const text='\\frac{3}{4}+x^{2}';const parsed=parseMath(text);
  expect(parsed.ok).toBe(true);if(!parsed.ok)return;
  expect(parsed.original).toBe(text);expect(layoutMath(parsed.ast).primitives.some(x=>x.kind==='line')).toBe(true);
  const invalid=parseMath('\\write18{malicious}');expect(invalid.ok).toBe(false);
  if(!invalid.ok)expect(invalid.original).toBe('\\write18{malicious}');
 });
 it('reports impossible geometry labels rather than positioning them on shapes',()=>{
  const placed=positionLabels([{id:'A',text:'VeryLongName',x:15,y:15}],[],{x:0,y:0,width:20,height:20});
  expect(placed.labels).toEqual([]);expect(placed.unplaced).toEqual(['A']);
 });
 it('maintains recording clock across capture pause without inventing elapsed time',()=>{
  let instant=1000;const clock=new SessionClock(25,instant,()=>instant);
  instant=1350;expect(clock.lessonTime()).toBe(375);
  clock.pause();instant=4000;expect(clock.lessonTime()).toBe(375);
  clock.resume();instant=4100;expect(clock.lessonTime()).toBe(475);
 });
 it('never advertises unsupported MIME as a valid recorder format',()=>{
  expect(supportedRecorderMime(()=>false)).toBe(null);
 });
});
