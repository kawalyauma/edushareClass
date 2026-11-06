import { describe, expect, it } from 'vitest';
import { SourceSelectionSchema, PdfSourceSchema } from '@edushare/shared-types';
import { cssRectToPdf, pdfRectToCss, groupTextLines, classifyPdfPage } from '@edushare/pdf-selection';

/** Integration acceptance: source PDF can be traced back by hash, page and unscaled bbox. */
describe('Phase 02 — source fidelity gate',()=>{
  it('preserves the exact source and optional teacher correction separately',()=>{
    const source=PdfSourceSchema.parse({id:'pdf1',fileName:'ugandan-maths.pdf',sha256:'a'.repeat(64),pageCount:3});
    const selection=SourceSelectionSchema.parse({id:'s1',sourceId:source.id,page:2,kind:'formula',
      bbox:{x:14,y:20,width:95,height:16},text:'x² = 9',sourceChunks:['x² = 9'],displayText:'x squared = 9',cropAssetId:'c1'});
    expect(selection.text).toBe('x² = 9');expect(selection.displayText).toBe('x squared = 9');
    expect(selection.bbox).toEqual({x:14,y:20,width:95,height:16});
  });
  it('maps a rotated, scaled crop back to identical source coordinates',()=>{
    const viewport={width:800,height:600,convertToPdfPoint:(x:number,y:number):[number,number]=>[y,x],
      convertToViewportRectangle:([x1,y1,x2,y2]:[number,number,number,number]):[number,number,number,number]=>[y1,x1,y2,x2]};
    const rect={x:100,y:240,width:55,height:33};const css=pdfRectToCss(rect,viewport);
    expect(cssRectToPdf({x:css.x,y:css.y},{x:css.x+css.width,y:css.y+css.height},viewport)).toEqual(rect);
  });
  it('marks unknown text layers as image crops rather than fabricating OCR',()=>{
    expect(classifyPdfPage(0,'')).toBe('image-only');
    expect(groupTextLines([])).toEqual([]);
  });
});
