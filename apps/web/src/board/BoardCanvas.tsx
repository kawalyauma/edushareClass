import {useEffect,useMemo,useRef,useState} from 'react';
import type {PointerEvent as ReactPointerEvent} from 'react';
import {BOARD_HEIGHT,BOARD_WIDTH} from '@edushare/shared-types';
import type {Point,Stroke} from '@edushare/shared-types';
import {paintStroke} from '@edushare/stroke-engine';
import {parseMath,layoutMath,drawMath} from '@edushare/math-notation';
import type {BoardStudio} from './useBoardStudio';
import {LocalPdfAssets} from '../pdf/sourceAssets';

const backgrounds={green:'#123b31',black:'#151b24',white:'#ffffff'} as const;
const foregrounds={green:'#d9e8e0',black:'#e6e8ef',white:'#172f49'} as const;
const pointSegmentDistance=(p:Point,a:Point,b:Point)=>{
  const dx=b.x-a.x,dy=b.y-a.y,den=dx*dx+dy*dy;
  const k=den?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/den)):0;
  return Math.hypot(p.x-a.x-k*dx,p.y-a.y-k*dy);
};
export function isStrokeHit(stroke:Stroke,p:Point,radius=18):boolean{
  return stroke.points.some((b,i)=>i>0&&pointSegmentDistance(p,stroke.points[i-1]!,b)<=radius+stroke.width/2);
}
export function BoardCanvas({studio}: {studio:BoardStudio}){
  const canvas=useRef<HTMLCanvasElement>(null);
  const assets=useMemo(()=>new LocalPdfAssets(),[]);
  const [images,setImages]=useState<Map<string,ImageBitmap>>(new Map());
  const [preview,setPreview]=useState<Stroke|null>(null);
  const draft=useRef<{id:number;points:{x:number;y:number;pressure?:number}[];started:number}|null>(null);
  const [status,setStatus]=useState('Board ready. Choose pen or eraser.');
  const [imageVersion,setImageVersion]=useState(0);
  const visibleCropIds=studio.board.pages.find(p=>p.id===studio.board.currentPageId)?.content
    .filter(c=>c.mode==='crop').map(c=>studio.lesson.selections.find(s=>s.id===c.selectionId)?.cropAssetId)
    .filter((id):id is string=>Boolean(id))??[];
  const cropKey=[...new Set(visibleCropIds)].sort().join('|');
  useEffect(()=>{
    let cancelled=false;
    const bitmaps:ImageBitmap[]=[];
    const ids=cropKey?cropKey.split('|'):[];
    void (async()=>{
      const pairs=await Promise.all(ids.map(async id=>{
        const blob=await assets.readCrop(id);
        if(!blob)return null;
        const bmp=await createImageBitmap(blob);bitmaps.push(bmp);
        return [id,bmp] as const;
      }));
      if(!cancelled){setImages(new Map(pairs.filter((p):p is readonly [string,ImageBitmap]=>p!==null)));setImageVersion(v=>v+1);}
    })().catch(e=>{if(!cancelled)setStatus(`Could not open an original PDF crop: ${String(e)}`);});
    return()=>{cancelled=true;for(const bitmap of bitmaps)bitmap.close();};
  },[assets,cropKey]);
  useEffect(()=>{
    const element=canvas.current;if(!element)return;
    const ctx=element.getContext('2d');if(!ctx)return;
    ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle=backgrounds[studio.board.theme];ctx.fillRect(0,0,BOARD_WIDTH,BOARD_HEIGHT);
    const page=studio.board.pages.find(p=>p.id===studio.board.currentPageId);
    if(!page){ctx.fillStyle=foregrounds[studio.board.theme];ctx.font='48px sans-serif';ctx.fillText('New teaching board',96,120);return;}
    for(const content of page.content){
      const original=studio.lesson.actions.find(a=>a.type==='content.place'&&a.id===content.id);
      const shift=original&&original.type==='content.place'?{
        x:content.target.x-original.target.x,y:content.target.y-original.target.y}:{x:0,y:0};
      if(content.mode==='math'){
        const selection=studio.lesson.selections.find(s=>s.id===content.selectionId);
        const input=selection?.displayText??selection?.text??'';
        const parsed=parseMath(input);
        if(parsed.ok){
          const layout=layoutMath(parsed.ast,62);
          const scale=Math.min(1,(content.target.width-20)/Math.max(1,layout.width),
            (content.target.height-18)/Math.max(1,layout.ascent+layout.descent));
          drawMath(ctx,layout,content.target.x+10,content.target.y+9+layout.ascent*scale,foregrounds[studio.board.theme],scale);
        }else{
          ctx.strokeStyle=foregrounds[studio.board.theme];ctx.strokeRect(content.target.x,content.target.y,content.target.width,content.target.height);
          ctx.font='22px sans-serif';ctx.fillStyle=foregrounds[studio.board.theme];ctx.fillText('Math source requires original crop',content.target.x+8,content.target.y+32);
        }
      } else if(content.mode==='crop'){
        const selection=studio.lesson.selections.find(s=>s.id===content.selectionId);
        const bitmap=selection?.cropAssetId?images.get(selection.cropAssetId):null;
        if(bitmap){ctx.drawImage(bitmap,content.target.x,content.target.y,content.target.width,content.target.height);}
        else{ctx.strokeStyle=foregrounds[studio.board.theme];ctx.lineWidth=2;ctx.strokeRect(content.target.x,content.target.y,content.target.width,content.target.height);
          ctx.fillStyle=foregrounds[studio.board.theme];ctx.font='28px sans-serif';ctx.fillText('Source crop unavailable',content.target.x+15,content.target.y+40);}
      }else{
        ctx.save();ctx.translate(shift.x,shift.y);
        content.strokes.forEach((stroke,i)=>{
          const elapsed=studio.playhead===Infinity?Infinity:studio.playhead-content.strokeTimes[i]!;
          paintStroke(ctx,stroke,elapsed/stroke.durationMs,studio.style);
        });ctx.restore();
      }
    }
    for(const ink of page.ink)paintStroke(ctx,ink.stroke,studio.playhead===Infinity?1:(studio.playhead-ink.startMs)/Math.max(1,ink.stroke.durationMs),studio.style);
    if(preview)paintStroke(ctx,preview,1,studio.style);
  },[studio.board,studio.lesson,studio.playhead,studio.style,preview,images,imageVersion]);
  const localPoint=(e:ReactPointerEvent<HTMLCanvasElement>):Point=>{
    const rect=e.currentTarget.getBoundingClientRect();
    return {x:Math.max(0,Math.min(BOARD_WIDTH,(e.clientX-rect.left)*BOARD_WIDTH/rect.width)),
      y:Math.max(0,Math.min(BOARD_HEIGHT,(e.clientY-rect.top)*BOARD_HEIGHT/rect.height))};
  };
  const handleErase=(p:Point)=>{
    const current=studio.liveBoard.pages.find(x=>x.id===studio.currentPageId);
    if(!current)return;
    const hit=current.ink.filter(x=>isStrokeHit(x.stroke,p,26)).map(x=>x.id);
    if(hit.length)void studio.erase(hit).catch(()=>{});
  };
  const pointerDown=(e:ReactPointerEvent<HTMLCanvasElement>)=>{
    if(e.button!==0)return;
    e.currentTarget.setPointerCapture(e.pointerId);e.preventDefault();
    const p=localPoint(e);
    if(studio.tool==='eraser'){handleErase(p);return;}
    draft.current={id:e.pointerId,points:[{...p,pressure:e.pressure||0.5}],started:performance.now()};
  };
  const pointerMove=(e:ReactPointerEvent<HTMLCanvasElement>)=>{
    const d=draft.current,p=localPoint(e);
    if(studio.tool==='eraser'){if(e.buttons===1)handleErase(p);return;}
    if(!d||d.id!==e.pointerId)return;
    const last=d.points.at(-1)!;
    if(Math.hypot(p.x-last.x,p.y-last.y)<1.7)return;
    d.points.push({...p,pressure:e.pressure||0.5});
    setPreview({points:d.points.slice(),width:studio.width,color:studio.colour,durationMs:200});
  };
  const pointerUp=(e:ReactPointerEvent<HTMLCanvasElement>)=>{
    const d=draft.current;
    if(!d||d.id!==e.pointerId)return;
    draft.current=null;setPreview(null);
    if(d.points.length===1)d.points.push({x:d.points[0]!.x+0.15,y:d.points[0]!.y+0.15,pressure:d.points[0]!.pressure});
    const stroke:Stroke={points:d.points,width:studio.width,color:studio.colour,
      durationMs:Math.max(1,Math.round(performance.now()-d.started))};
    void studio.draw(stroke).then(()=>setStatus('Pen stroke saved to the lesson timeline.')).catch(()=>{});
  };
  return <div className="board-stage" tabIndex={0} aria-label="Teaching board and drawing shortcuts"
    onKeyDown={e=>{
      if(!e.ctrlKey&&!e.metaKey){
        if(e.key.toLowerCase()==='n'){e.preventDefault();void studio.newPage();}
        if(e.key===' '){e.preventDefault();studio.isPlaying?studio.pause():studio.resume();}
      }else if(e.key.toLowerCase()==='z'){e.preventDefault();if(e.shiftKey)void studio.redo();else void studio.undo();}
    }}>
    <canvas ref={canvas} width={BOARD_WIDTH} height={BOARD_HEIGHT}
      className="teaching-canvas" role="img" aria-label="Teaching board drawing surface, 16 by 9 ratio"
      onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp}/>
    <div className="board-stage-footer"><span role="status" aria-live="polite">{status}</span><span>{studio.liveBoard.pages.length} page(s) · {studio.page?.ink.length??0} pen strokes</span></div>
  </div>;
}
