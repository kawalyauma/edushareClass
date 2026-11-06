import type {Stroke} from '@edushare/shared-types';
import {glyphPath,glyphAdvance} from './glyphs';
export interface PositionedStroke extends Stroke {
  glyph: string;
  charIndex:number;
  startMs:number;
  penLiftMs:number;
}
export interface HandwritingOptions {
  text:string; x:number; y:number; maxWidth:number;
  emSize?:number; lineHeight?:number;
  strokeWidth?:number; color?:string; speed?:number;
  penLiftMs?:number; wordPauseMs?:number; characterSpacing?:number;
  /** Photo-reference lettering: tall, narrow and subtly varied per character. */
  handStyle?:'original'|'classroom';
}
export interface HandwritingPlan {
  strokes:PositionedStroke[];
  unsupported: {char:string; index:number}[];
  lineCount:number;
  endMs:number;
  height:number;
}
const measure=(a:readonly {x:number;y:number}[])=>a.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p.x-a[i]!.x,p.y-a[i]!.y),0);
/** Calculate original paths as board coordinates. No raster/font substitution is silently invented. */
export function planHandwriting(o:HandwritingOptions):HandwritingPlan {
  if(!Number.isFinite(o.maxWidth)||o.maxWidth<=0)throw new Error('maxWidth must be positive');
  const em=o.emSize??55;
  const lineHeight=o.lineHeight??em*1.48;
  const speed=Math.min(4,Math.max(0.25,o.speed??1));
  const penLift=Math.max(0,o.penLiftMs??60)/speed;
  const wordPause=Math.max(0,o.wordPauseMs??140)/speed;
  const spacing=o.characterSpacing??0.12;
  const classroom=o.handStyle==='classroom';
  const aspect=classroom?.79:1;
  let x=o.x,y=o.y,elapsed=0,lines=1;
  const strokes:PositionedStroke[]=[];
  const unsupported:HandwritingPlan['unsupported']=[];
  const letters=[...o.text];
  const startX=o.x;
  const lineBreak=()=>{y+=lineHeight;x=startX;lines++;};
  for(let i=0;i<letters.length;i++){
    const c=letters[i]!;
    if(c==='\r')continue;
    if(c==='\n'){lineBreak();elapsed+=wordPause;continue;}
    if(c===' '||c==='\t'){
      const advance=em*(c==='\t'?1.5:classroom?.39:.46);
      if(x>startX&&x+advance>startX+o.maxWidth)lineBreak();
      else x+=advance;
      elapsed+=wordPause;continue;
    }
    const width=em*(glyphAdvance(c)*aspect+spacing);
    if(x>startX&&x+width>startX+o.maxWidth)lineBreak();
    const path=glyphPath(c);
    if(!path){unsupported.push({char:c,index:i}); x+=width;elapsed+=wordPause;continue;}
    for(const sub of path){
      const tilt=classroom?((i*13)%9-4)*.010:0;
      const baseline=classroom?((i*7)%5-2)*em*.007:0;
      const points=sub.map(([px,py],k)=>({
        x:x+(px*aspect+(classroom?(py-.45)*tilt:0))*em,
        y:y+py*em*(classroom?1.055:1)+baseline,
        ...(classroom?{pressure:.48+((i*17+k*7)%9)*.045}:{}),
      }));
      const durationMs=Math.max(80,Math.round(measure(points)*1.85/speed));
      strokes.push({points,width:o.strokeWidth??3.6,color:o.color??'#f5f0d8',durationMs,
        glyph:c,charIndex:i,startMs:Math.round(elapsed),penLiftMs:Math.round(penLift)});
      elapsed+=durationMs+penLift;
    }
    x+=width;
    elapsed+=30/speed;
  }
  return {strokes,unsupported,lineCount:lines,endMs:Math.round(elapsed),height:lines*lineHeight};
}
export function pathLength(points:readonly {x:number;y:number}[]):number{
  return measure(points);
}
/** Arc-length interpolation keeps drawn motion consistent across sparse and dense control points. */
export function partialStrokePoints(points:readonly {x:number;y:number;pressure?:number}[], progress:number):typeof points {
  if(points.length<2)return points;
  if(progress<=0)return [points[0]!];
  if(progress>=1)return points;
  const total=pathLength(points),remaining=total*Math.min(1,progress);
  if(total===0)return [points[0]!];
  const out=[points[0]!];let used=0;
  for(let i=1;i<points.length;i++){
    const a=points[i-1]!,b=points[i]!,dist=Math.hypot(b.x-a.x,b.y-a.y);
    if(used+dist>=remaining){const f=dist?(remaining-used)/dist:0;
      out.push({x:a.x+(b.x-a.x)*f,y:a.y+(b.y-a.y)*f,pressure:a.pressure===undefined&&b.pressure===undefined?undefined:(a.pressure??0.5)+((b.pressure??0.5)-(a.pressure??0.5))*f});
      break;
    }
    used+=dist;out.push(b);
  }
  return out;
}
export function glyphTimeline(plan:HandwritingPlan,atMs:number):{stroke:PositionedStroke;points:readonly {x:number;y:number;pressure?:number}[]}[]{
  return plan.strokes.filter(stroke=>atMs>=stroke.startMs).map(stroke=>({stroke,points:partialStrokePoints(stroke.points,(atMs-stroke.startMs)/stroke.durationMs)}));
}
