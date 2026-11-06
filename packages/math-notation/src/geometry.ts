/** Pure geometry for source-faithful teacher-authored diagrams. Board units, top-left origin. */
export interface Box {x:number;y:number;width:number;height:number;}
export interface Anchor {id:string;x:number;y:number;text:string;}
export interface PositionedLabel extends Box {id:string;text:string;}
const overlaps=(a:Box,b:Box)=>a.x<b.x+b.width&&b.x<a.x+a.width&&a.y<b.y+b.height&&b.y<a.y+a.height;
export function positionLabels(anchors:Anchor[],obstacles:Box[],bounds:Box):{labels:PositionedLabel[];unplaced:string[]}{
  const labels:PositionedLabel[]=[];const unplaced:string[]=[];
  for(const a of anchors){
    const width=Math.max(20,a.text.length*16),height=26,offset=18;
    const offsets=[[offset,-height-offset],[-width-offset,-height-offset],[offset,offset],[-width-offset,offset],[-width/2,-height-offset],[-width/2,offset],[offset,-height/2],[-width-offset,-height/2]];
    let placed=false;
    for(const [dx,dy]of offsets){const box={id:a.id,text:a.text,x:a.x+dx!,y:a.y+dy!,width,height};
      if(box.x<bounds.x||box.y<bounds.y||box.x+width>bounds.x+bounds.width||box.y+height>bounds.y+bounds.height)continue;
      if([...obstacles,...labels].some(o=>overlaps(box,o)))continue;
      labels.push(box);placed=true;break;
    }
    if(!placed)unplaced.push(a.id);
  }
  return {labels,unplaced};
}
export interface GeometryStroke {kind:'line'|'circle'|'polygon'|'arrow';points:{x:number;y:number}[];radius?:number;}
export function makeVennDiagram(bounds:Box,labels:[string,string]):{strokes:GeometryStroke[];labels:PositionedLabel[];unplaced:string[]}{
  const r=Math.min(bounds.width*.24,bounds.height*.33);
  const cx=bounds.x+bounds.width*.42,cy=bounds.y+bounds.height*.51;
  const centres=[{x:cx,y:cy},{x:cx+r*.8,y:cy}];
  const shapes:GeometryStroke[]=centres.map(c=>({kind:'circle',points:[c],radius:r}));
  const placed=positionLabels(centres.map((c,i)=>({id:`set${i}`,x:c.x,y:c.y-r,text:labels[i]!})),[],bounds);
  return {strokes:shapes,...placed};
}
/** Does not interpolate beyond the provided points or invent numerical graph labels. */
export function makePolyline(points:{x:number;y:number}[]):GeometryStroke|null{
  if(points.length<2||points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)))return null;
  return {kind:'line',points:points.map(p=>({...p}))};
}
