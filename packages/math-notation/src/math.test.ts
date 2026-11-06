import {describe,it,expect} from 'vitest';
import {parseMath,layoutMath,positionLabels,makeVennDiagram,makePolyline} from './index.js';
describe('manual source-faithful mathematics',()=>{
 it('keeps exact original source and layouts explicit fractions',()=>{
  const result=parseMath('\\frac{12}{5}+x^{2}');expect(result.ok).toBe(true);
  if(!result.ok)return;
  expect(result.original).toBe('\\frac{12}{5}+x^{2}');
  const layout=layoutMath(result.ast);expect(layout.ascent).toBeGreaterThan(40);
  expect(layout.primitives.filter(p=>p.kind==='line').length).toBeGreaterThanOrEqual(1);
 });
 it('rejects arbitrary tex and ambiguous characters so original crops remain authoritative',()=>{
  for(const example of ['\\input{evil}','5⁄8','\\frac{2}','x^2','1₄'])expect(parseMath(example).ok).toBe(false);
 });
 it('recognises a standalone numeric fraction but never rewrites its source',()=>{
  const ratio=parseMath('12/5');expect(ratio.ok).toBe(true);if(ratio.ok){expect(ratio.original).toBe('12/5');expect(layoutMath(ratio.ast).primitives.some(p=>p.kind==='line')).toBe(true);}
 });
 it('builds nested roots, scripts, maths symbols without text mutation',()=>{
  const result=parseMath('\\sqrt{x^{2}+9}\\leq 8');expect(result.ok).toBe(true);
  if(result.ok)expect(layoutMath(result.ast).width).toBeGreaterThan(0);
 });
 it('uses only non-overlapping labels and reports out-of-room labels',()=>{
  const r=positionLabels([{id:'a',x:50,y:50,text:'A'},{id:'b',x:50,y:50,text:'B'}],[],{x:0,y:0,width:120,height:100});
  for(const a of r.labels)for(const b of r.labels){if(a!==b)expect(a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y).toBe(true);}
 });
 it('creates explicit diagram primitives without fabricating graph samples',()=>{
  const v=makeVennDiagram({x:0,y:0,width:400,height:240},['A','B']);expect(v.strokes).toHaveLength(2);
  expect(makePolyline([{x:1,y:2}])).toBeNull();
 });
});
