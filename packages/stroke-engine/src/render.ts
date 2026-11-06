import type {Stroke} from '@edushare/shared-types';
import {partialStrokePoints} from './layout';
export type StrokeStyle = 'ink'|'chalk';
/** Render an original pen path in CSS/board pixel coordinates. Pure except for canvas writes. */
export function paintStroke(ctx:CanvasRenderingContext2D,stroke:Stroke,progress=1,style:StrokeStyle='ink'){
  if(progress<=0)return;
  const points=partialStrokePoints(stroke.points,progress);
  if(points.length<2)return;
  ctx.save();
  ctx.strokeStyle=stroke.color;
  ctx.lineCap='round';ctx.lineJoin='round';
  if(style==='chalk'){
    // Handwriting paths are smoothed through their actual hand-plotted points.
    // This retains stroke-by-stroke animation instead of revealing a computer font.
    const pressures=points.reduce((sum,p)=>sum+(p.pressure??0.65),0)/points.length;
    ctx.lineWidth=stroke.width*(0.82+pressures*.22);
    ctx.globalAlpha=.86;
    const smooth=(offset:number)=>{
      ctx.beginPath();ctx.moveTo(points[0]!.x+offset,points[0]!.y);
      for(let i=1;i<points.length-1;i++){
        const p=points[i]!,next=points[i+1]!;
        ctx.quadraticCurveTo(p.x+offset,p.y,(p.x+next.x)/2+offset,(p.y+next.y)/2);
      }
      const last=points[points.length-1]!;
      ctx.lineTo(last.x+offset,last.y);ctx.stroke();
    };
    smooth(0);
    // Soft, deterministic dry chalk edge and dust, stable across animation frames.
    ctx.globalAlpha=.15;
    ctx.lineWidth=Math.max(.45,stroke.width*.21);
    smooth(stroke.width*.27);
  }else{
    ctx.globalAlpha=1;
    const weighted=points.some(p=>p.pressure!==undefined);
    if(weighted){
      for(let i=1;i<points.length;i++){
        const from=points[i-1]!,to=points[i]!;
        ctx.beginPath();ctx.lineWidth=stroke.width*(.55+.75*(to.pressure??.5));
        ctx.moveTo(from.x,from.y);ctx.lineTo(to.x,to.y);ctx.stroke();
      }
    }else{
      ctx.lineWidth=stroke.width;
      ctx.beginPath();ctx.moveTo(points[0]!.x,points[0]!.y);
      for(const p of points.slice(1))ctx.lineTo(p.x,p.y);
      ctx.stroke();
    }
  }
  ctx.restore();
}
