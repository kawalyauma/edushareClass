import {useEffect,useRef,useState} from 'react';
import {paintStroke} from '@edushare/stroke-engine';
import type {ChalkPage,ChalkSectionPlan} from './chalkNotes';
import {drawClassroomChalkboard} from './paintBoard';

function PreviewBoard({page,title,large=false}:{
  page:ChalkPage;title:string;large?:boolean
}){
  const canvas=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{
    const ctx=canvas.current?.getContext('2d');
    if(!ctx)return;
    ctx.setTransform(.5,0,0,.5,0,0);
    drawClassroomChalkboard(ctx,'green',page.columns,title);
    for(const row of page.rows)for(const stroke of row.plan.strokes)
      paintStroke(ctx,stroke,1,'chalk');
  },[page,title]);
  return <canvas ref={canvas} width={960} height={540}
    className={large?'chalk-draft-canvas chalk-draft-canvas-large':'chalk-draft-canvas'}
    role="img" aria-label={`Completed draft with ${page.columns} column(s) and ${page.rows.length} note lines`}/>;
}

/** A purely visual draft preview: no lesson actions or recording data are written here. */
export function ChalkDraftGallery({plan,title}:{
  plan:ChalkSectionPlan;title:string;
}){
  const [focused,setFocused]=useState<number|null>(null);
  const page=focused===null?null:plan.pages[focused]??null;
  return <section className="chalk-draft-gallery" aria-label="Chalkboard drafts">
    <div className="chalk-draft-heading">
      <strong>{plan.pages.length} draft board{plan.pages.length===1?'':'s'} ready for review</strong>
      <small>{plan.characterCount} PDF characters · Changes are previews until approval</small>
    </div>
    <div className="chalk-draft-grid">
      {plan.pages.map((sheet,i)=><button type="button" className="chalk-draft-tile"
        key={i} onClick={()=>setFocused(i)}
        aria-label={`View draft board ${i+1} larger`}>
        <PreviewBoard page={sheet} title={title}/>
        <span>Board {i+1} of {plan.pages.length} · {sheet.rows.length} note lines</span>
      </button>)}
    </div>
    {page&&<div className="chalk-draft-modal-shade" role="presentation"
      onClick={()=>setFocused(null)}>
      <section role="dialog" aria-modal="true" aria-label={`Large preview of draft board ${focused!+1}`}
        className="chalk-draft-modal" onClick={e=>e.stopPropagation()}
        onKeyDown={e=>{if(e.key==='Escape')setFocused(null);}}>
        <div className="chalk-draft-modal-bar">
          <strong>Draft board {focused!+1} / {plan.pages.length}</strong>
          <button className="btn" type="button" autoFocus onClick={()=>setFocused(null)}>
            Close preview
          </button>
        </div>
        <PreviewBoard page={page} title={title} large/>
        <div className="board-control-row">
          <button className="btn" disabled={focused===0}
            onClick={()=>setFocused(x=>Math.max(0,(x??0)-1))}>Previous board</button>
          <button className="btn" disabled={focused===plan.pages.length-1}
            onClick={()=>setFocused(x=>Math.min(plan.pages.length-1,(x??0)+1))}>Next board</button>
        </div>
      </section>
    </div>}
  </section>;
}
