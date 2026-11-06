import { describe, expect, it } from 'vitest';
import { bitmapCrop, cssRectToPdf, pdfRectToCss } from './geometry';
import type { PdfViewport } from './geometry';
const viewport=(angle:0|90|180|270,scale:number):PdfViewport=>{
  const w=600,h=800;
  const toScreen=(x:number,y:number):[number,number]=>{
    switch(angle){case 0:return [x*scale,(h-y)*scale];case 90:return [y*scale,x*scale];case 180:return [(w-x)*scale,y*scale];case 270:return [(h-y)*scale,(w-x)*scale];}
  };
  const toPdf=(x:number,y:number):[number,number]=>{
    switch(angle){case 0:return [x/scale,h-y/scale];case 90:return [y/scale,x/scale];case 180:return [w-x/scale,y/scale];case 270:return [w-y/scale,h-x/scale];}
  };
  return {width:(angle%180===0?w:h)*scale,height:(angle%180===0?h:w)*scale,convertToPdfPoint:toPdf,convertToViewportRectangle:([x1,y1,x2,y2])=>[...toScreen(x1,y1),...toScreen(x2,y2)]};
};
describe('source coordinate fidelity',()=>{
  for(const rotation of [0,90,180,270] as const)for(const scale of [0.5,1,2.5])
    it(`roundtrips source geometry at ${rotation}° / ${scale}x`,()=>{
      const v=viewport(rotation,scale); const box={x:28,y:123,width:210,height:19};const css=pdfRectToCss(box,v);
      const back=cssRectToPdf({x:css.x,y:css.y},{x:css.x+css.width,y:css.y+css.height},v);
      for(const key of ['x','y','width','height'] as const)expect(back[key]).toBeCloseTo(box[key],6);
    });
  it('bounds bitmap crop without leaving the original canvas',()=>{
    expect(bitmapCrop({x:-3,y:5,width:29,height:20},2,20,40)).toEqual({x:0,y:10,width:20,height:30});
  });
});
