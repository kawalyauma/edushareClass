import {describe,it,expect} from 'vitest';
import {classifyPdfPage,groupTextLines} from './text';
const item=(str:string,x:number,y:number,w:number,h=12)=>({str,width:w,height:h,transform:[1,0,0,1,x,y] as [number,number,number,number,number,number]});
describe('source-faithful text selection',()=>{
 it('groups visual lines independently with geometry-based spaces',()=>{
  const lines=groupTextLines([item('B',64,700,8),item('second',12,677,40),item('A',12,700,8),item('first',28,700,30)]);
  expect(lines).toHaveLength(2);expect(lines[0]?.text).toBe('A first B');expect(lines[1]?.text).toBe('second');
 });
 it('flags mathematical glyphs rather than silently rewriting equations',()=>{
  const [line]=groupTextLines([item('x² = 4',10,600,60)]);expect(line?.suspicious).toBe(true);expect(line?.text).toBe('x² = 4');
 });
 it('flags missing glyphs',()=>expect(groupTextLines([item('a\uFFFD',10,200,30)])[0]?.warnings[0]).toMatch(/glyph/));
 it('distinguishes scanned/empty/mixed source pages',()=>{
  expect(classifyPdfPage(0,'')).toBe('image-only');expect(classifyPdfPage(1,'3')).toBe('mixed');expect(classifyPdfPage(3,'This is a full line')).toBe('text');
 });
});
