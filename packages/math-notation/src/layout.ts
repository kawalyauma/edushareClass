import type { MathNode } from './parser.js';

export type MathPrimitive =
  | { kind: 'text'; text: string; x: number; baseline: number; size: number }
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number; width: number };
export interface MathMetrics { width: number; ascent: number; descent: number; primitives: MathPrimitive[]; }

/** Deterministic logical glyph advance: no OS/browser font metrics in replay metadata. */
function textWidth(value: string, size: number) { return value.length * size * 0.62; }
export function layoutMath(node: MathNode, fontSize = 64): MathMetrics {
  const size = Math.max(8, Math.min(200, fontSize));
  const small = Math.max(8, size * 0.6);
  switch (node.kind) {
    case 'text': return { width: textWidth(node.value, size), ascent: size * 0.8, descent: size * 0.27,
      primitives: [{ kind: 'text', text: node.value, x: 0, baseline: 0, size }] };
    case 'row': {
      let x = 0, ascent = size * .8, descent = size * .27;
      const primitives: MathPrimitive[] = [];
      for (const c of node.children) {
        const laid = layoutMath(c, size);
        primitives.push(...laid.primitives.map(p => p.kind === 'text' ? {...p, x:p.x+x} : {...p,x1:p.x1+x,x2:p.x2+x}));
        x += laid.width;
        ascent = Math.max(ascent, laid.ascent);descent=Math.max(descent,laid.descent);
      }
      return { width: x, ascent, descent, primitives };
    }
    case 'fraction': {
      const top=layoutMath(node.numerator,small), bottom=layoutMath(node.denominator,small);
      const pad=size*.13, gap=size*.13, width=Math.max(top.width,bottom.width)+2*pad;
      const lineY=-gap*.25;
      const topBaseline=lineY-gap-top.descent, bottomBaseline=lineY+gap+bottom.ascent;
      const shift=(laid:MathMetrics,dx:number,dy:number)=>laid.primitives.map(p=>p.kind==='text'?{...p,x:p.x+dx,baseline:p.baseline+dy}:{...p,x1:p.x1+dx,x2:p.x2+dx,y1:p.y1+dy,y2:p.y2+dy});
      return {width,ascent:-topBaseline+top.ascent,descent:bottomBaseline+bottom.descent,primitives:[
        ...shift(top,(width-top.width)/2,topBaseline),
        {kind:'line',x1:0,y1:lineY,x2:width,y2:lineY,width:Math.max(1.5,size*.035)},
        ...shift(bottom,(width-bottom.width)/2,bottomBaseline)]};
    }
    case 'root': {
      const rad=layoutMath(node.radicand,size*.83), prefix=size*.55;
      const barY=-rad.ascent-size*.12, line=size*.032;
      const primitives=rad.primitives.map(p=>p.kind==='text'?{...p,x:p.x+prefix}:{...p,x1:p.x1+prefix,x2:p.x2+prefix});
      return {width:prefix+rad.width+size*.10,ascent:Math.max(-barY+line,rad.ascent+size*.12),descent:Math.max(rad.descent,size*.28),primitives:[
        {kind:'line',x1:0,y1:-size*.1,x2:prefix*.20,y2:size*.20,width:line},
        {kind:'line',x1:prefix*.20,y1:size*.20,x2:prefix*.65,y2:barY,width:line},
        {kind:'line',x1:prefix*.65,y1:barY,x2:prefix+rad.width+size*.10,y2:barY,width:line},...primitives]};
    }
    case 'script': {
      const base=layoutMath(node.base,size);
      const sup=node.super?layoutMath(node.super,small):null;
      const sub=node.sub?layoutMath(node.sub,small):null;
      const scriptWidth=Math.max(sup?.width??0,sub?.width??0);
      const add=(x:MathMetrics,dx:number,dy:number)=>x.primitives.map(p=>p.kind==='text'?{...p,x:p.x+dx,baseline:p.baseline+dy}:{...p,x1:p.x1+dx,x2:p.x2+dx,y1:p.y1+dy,y2:p.y2+dy});
      const up=-(base.ascent*.62+ (sup?.descent??0)),down=base.descent*.8 + (sub?.ascent??0);
      return {width:base.width+scriptWidth,ascent:Math.max(base.ascent,sup?sup.ascent-up:0),descent:Math.max(base.descent,sub?down+sub.descent:0),
        primitives:[...base.primitives,...(sup?add(sup,base.width,up):[]),...(sub?add(sub,base.width,down):[])]};
    }
  }
}
export function drawMath(ctx:CanvasRenderingContext2D,layout:MathMetrics,x:number,baseline:number,colour='#f5f0d8',scale=1):void{
  ctx.save();ctx.fillStyle=colour;ctx.strokeStyle=colour;ctx.lineCap='round';ctx.lineJoin='round';
  for(const p of layout.primitives){
    if(p.kind==='text'){
      ctx.font=`${Math.max(1,p.size*scale)}px "DejaVu Sans Mono", monospace`;
      ctx.textBaseline='alphabetic';ctx.fillText(p.text,x+p.x*scale,baseline+p.baseline*scale);
    }else{
      ctx.lineWidth=Math.max(1,p.width*scale);ctx.beginPath();ctx.moveTo(x+p.x1*scale,baseline+p.y1*scale);
      ctx.lineTo(x+p.x2*scale,baseline+p.y2*scale);ctx.stroke();
    }
  }
  ctx.restore();
}
