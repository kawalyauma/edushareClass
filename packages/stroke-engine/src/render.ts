import type {Stroke} from '@edushare/shared-types';
import {partialStrokePoints} from './layout';
export type StrokeStyle = 'ink'|'chalk';
/** Render an original pen path in CSS/board pixel coordinates. Pure except for canvas writes. */
export function paintStroke(ctx:CanvasRenderingContext2D, stroke:Stroke, progress=1, style:StrokeStyle='ink'){
  if(progress<=0)return;
  const points=partialStrokePoints(stroke.points,progress);
  if(points.length<2)return;
  ctx.save();ctx.strokeStyle=stroke.color;ctx.lineCap='round';ctx.lineJoin='round';
  ctx.globalAlpha=style==='chalk'?0.77:1;
  const weighted=points.some(point=>point.pressure!==undefined);
  if(weighted){
    for(let i=1;i<points.length;i++){
      const previous=points[i-1]!,p=points[i]!;
      ctx.beginPath();ctx.lineWidth=stroke.width*(0.55+0.75*(p.pressure??0.5));
      ctx.moveTo(previous.x,previous.y);ctx.lineTo(p.x,p.y);ctx.stroke();
    }
  }else{
    ctx.lineWidth=stroke.width;
    ctx.beginPath();ctx.moveTo(points[0]!.x,points[0]!.y);
    for(const p of points.slice(1))ctx.lineTo(p.x,p.y);
    ctx.stroke();
  }
  if(style==='chalk'){
    // Stable deterministic dry-brush texture. Not random per animation frame.
    ctx.globalAlpha=0.13;
    ctx.lineWidth=Math.max(0.6,stroke.width*0.18);
    ctx.beginPath();ctx.moveTo(points[0]!.x+stroke.width*.25,points[0]!.y);
    for(const p of points.slice(1))ctx.lineTo(p.x+stroke.width*.25,p.y);
    ctx.stroke();
  }
  ctx.restore();
}
