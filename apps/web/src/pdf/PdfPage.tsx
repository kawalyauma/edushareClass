import { useEffect, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import { bitmapCrop, classifyPdfPage, cssRectToPdf, groupTextLines, limitToPage, pdfRectToCss, rectFromCorners } from '@edushare/pdf-selection';
import type { PdfViewport, Rect, CssPoint, LineSelection, PdfTextItem } from '@edushare/pdf-selection';
import type { PdfSource, SourceSelection } from '@edushare/shared-types';
import type { PDFDocumentProxy } from './pdfjs';
import { LocalPdfAssets } from './sourceAssets';

interface Props {
  doc: PDFDocumentProxy;
  source: PdfSource;
  pageNumber: number;
  zoom: number;
  rotation: number;
  mode: 'text'|'section'|'crop';
  assets: LocalPdfAssets;
  onCreate: (selection: SourceSelection) => Promise<void>;
}
interface ReadyPage {viewport: PdfViewport;lines: LineSelection[];scanStatus:'text'|'mixed'|'image-only'}
function relativePosition(e:PointerEvent<HTMLDivElement>,target:HTMLElement):CssPoint {
  const bounds=target.getBoundingClientRect();
  return {x:e.clientX-bounds.left,y:e.clientY-bounds.top};
}

export function PdfPage({doc,source,pageNumber,zoom,rotation,mode,assets,onCreate}:Props){
  const canvas=useRef<HTMLCanvasElement>(null);
  const surface=useRef<HTMLDivElement>(null);
  const [ready,setReady]=useState<ReadyPage|null>(null);
  const [error,setError]=useState<string|null>(null);
  const [busy,setBusy]=useState(false);
  const [drag,setDrag]=useState<{a:CssPoint;b:CssPoint}|null>(null);
  useEffect(()=>{
    let cancelled=false;
    let task:{cancel:()=>void;promise:Promise<unknown>}|undefined;
    setReady(null);setError(null);
    void (async()=>{
      const page=await doc.getPage(pageNumber);
      if(cancelled)return;
      const viewport=page.getViewport({scale:zoom,rotation:(page.rotate+rotation)%360});
      const c=canvas.current;if(!c)return;
      const dpr=Math.max(0.01,Math.min(2,window.devicePixelRatio||1,8192/Math.max(viewport.width,viewport.height),Math.sqrt(16_000_000/(viewport.width*viewport.height))));
      c.width=Math.ceil(viewport.width*dpr);c.height=Math.ceil(viewport.height*dpr);
      c.style.width=`${viewport.width}px`;c.style.height=`${viewport.height}px`;
      const ctx=c.getContext('2d');if(!ctx)throw new Error('Canvas 2D is not supported.');
      task=page.render({canvas:c,canvasContext:ctx,viewport,transform:[dpr,0,0,dpr,0,0]});
      await task.promise;
      if(cancelled)return;
      const content=await page.getTextContent();
      if(cancelled)return;
      const items=content.items.filter((item):item is typeof content.items[number] & PdfTextItem => 'str' in item)
        .map(item=>({str:item.str,transform:item.transform as PdfTextItem['transform'],width:item.width,height:item.height,dir:item.dir,hasEOL:item.hasEOL}));
      const lines=groupTextLines(items);
      setReady({viewport,lines,scanStatus:classifyPdfPage(items.length,lines.map(line=>line.text).join(' '))});
    })().catch(e=>{if(!cancelled && e?.name!=='RenderingCancelledException')setError(e instanceof Error?e.message:String(e));});
    return ()=>{cancelled=true;task?.cancel();};
  },[doc,pageNumber,zoom,rotation]);

  async function saveSelection(pdfRect:Rect, text?:string, warnings:string[]=[], sourceChunks:string[]=[]){
    const canvasElement=canvas.current;
    if(!ready||!canvasElement||busy)return;
    setBusy(true);setError(null);
    try{
      const css=pdfRectToCss(pdfRect,ready.viewport);
      const pixels=bitmapCrop(css,canvasElement.width/ready.viewport.width,canvasElement.width,canvasElement.height);
      if(pixels.width<1||pixels.height<1)throw new Error('Selection is outside the PDF page.');
      const copy=document.createElement('canvas');copy.width=pixels.width;copy.height=pixels.height;
      const ctx=copy.getContext('2d');if(!ctx)throw new Error('Cannot capture PDF source crop.');
      ctx.drawImage(canvasElement,pixels.x,pixels.y,pixels.width,pixels.height,0,0,pixels.width,pixels.height);
      const blob=await new Promise<Blob>((resolve,reject)=>copy.toBlob(b=>b?resolve(b):reject(new Error('Could not encode image crop.')),'image/png'));
      const cropAssetId=crypto.randomUUID();
      await assets.saveCrop(cropAssetId,blob);
      const kind=text===undefined?'crop':warnings.some(w=>/mathematical|glyphs|rotated|right-to-left/i.test(w))?'formula':'text';
      const selection:SourceSelection={id:crypto.randomUUID(),sourceId:source.id,page:pageNumber,bbox:pdfRect,kind,cropAssetId};
      if(text!==undefined){selection.text=text;selection.sourceChunks=sourceChunks;}
      await onCreate(selection);
    }catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}
  }

  const draft=drag&&ready?rectFromCorners(drag.a.x,drag.a.y,drag.b.x,drag.b.y):null;
  const vp=ready?.viewport;
  return <section className="pdf-page-section" aria-label={`PDF page ${pageNumber}`}>
    <div className="pdf-page-label">Page {pageNumber}{ready?.scanStatus==='image-only' && <span className="pdf-flag">No selectable text — crop an image region</span>}{ready?.scanStatus==='mixed' && <span className="pdf-flag">Limited text detected — check image crop</span>}</div>
    {error&&<div role="alert" className="pdf-inline-error">{error}</div>}
    {!ready&&!error&&<p role="status">Rendering page {pageNumber}…</p>}
    <div ref={surface} className="pdf-page-canvas" style={{width:vp?.width??undefined,height:vp?.height??undefined}}
      onPointerDown={e=>{
        if(!['crop','section'].includes(mode)||!ready||!surface.current)return;
        const p=limitToPage(relativePosition(e,surface.current),ready.viewport);
        e.currentTarget.setPointerCapture(e.pointerId);setDrag({a:p,b:p});
      }}
      onPointerMove={e=>{
        if(!drag||!['crop','section'].includes(mode)||!ready||!surface.current)return;
        setDrag({...drag,b:limitToPage(relativePosition(e,surface.current),ready.viewport)});
      }}
      onPointerUp={e=>{
        if(!drag||!['crop','section'].includes(mode)||!ready||!surface.current)return;
        const b=limitToPage(relativePosition(e,surface.current),ready.viewport);
        setDrag(null);
        const rect=cssRectToPdf(drag.a,b,ready.viewport);
        if(rect.width<2||rect.height<2)return;
        if(mode==='section'){
          const region=rectFromCorners(drag.a.x,drag.a.y,b.x,b.y);
          const lines=ready.lines.filter(line=>{
            const r=pdfRectToCss(line.bbox,ready.viewport);
            return Math.max(0,Math.min(r.x+r.width,region.x+region.width)-Math.max(r.x,region.x))>0 &&
              Math.max(0,Math.min(r.y+r.height,region.y+region.height)-Math.max(r.y,region.y))>0;
          }).sort((a,b)=>{
            const A=pdfRectToCss(a.bbox,ready.viewport),B=pdfRectToCss(b.bbox,ready.viewport);
            return Math.abs(A.y-B.y)>Math.max(3,Math.min(A.height,B.height)*.5)?A.y-B.y:A.x-B.x;
          });
          if(!lines.length){setError('No selectable text inside this region. Use Original Crop for scanned pages.');return;}
          if(lines.length>90){setError('Choose a smaller PDF section (up to 90 lines).');return;}
          void saveSelection(rect,lines.map(l=>l.text).join('\n'),lines.flatMap(l=>l.warnings),lines.flatMap(l=>l.chunks));
        }else void saveSelection(rect);
      }}>
      <canvas ref={canvas} className="pdf-page-bitmap" aria-label={`Original PDF page ${pageNumber}`} />
      {mode==='text'&&ready&&vp&&<div className="pdf-text-layer" aria-label={`Selectable lines on page ${pageNumber}`}>
        {ready.lines.map((line,i)=>{
          const box=pdfRectToCss(line.bbox,vp);
          return <span key={i} role="button" tabIndex={busy?-1:0} title={`Select: ${line.text}`}
            aria-label={`Select line: ${line.text.slice(0,100)}`}
            className="pdf-line-target" style={{left:box.x,top:box.y,width:Math.max(4,box.width),height:Math.max(12,box.height)}}
            onClick={()=>void saveSelection(line.bbox,line.text,line.warnings,line.chunks)}
            onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();void saveSelection(line.bbox,line.text,line.warnings,line.chunks);}}}
          >{line.text}</span>;
        })}
      </div>}
      {mode==='crop'&&<div className="pdf-crop-hint" aria-hidden="true">Drag to select a diagram, equation or scanned text</div>}
      {mode==='section'&&<div className="pdf-crop-hint" aria-hidden="true">Drag around several lines of PDF text for chalkboard notes</div>}
      {draft&&<div className="pdf-crop-draft" style={{left:draft.x,top:draft.y,width:draft.width,height:draft.height}}/>}
    </div>
    {busy&&<p role="status">Saving original PDF selection and crop…</p>}
  </section>;
}
