/** Non-destructive local timeline edits. All source media and original board actions remain immutable. */
export interface SegmentRef { id:string; startMs:number; endMs?:number; status:'recording'|'complete'|'recovered'|'discarded'; }
export interface TimelineClip {
  id:string;
  segmentId:string;
  /** Milliseconds measured from the start of the original MediaRecorder segment. */
  sourceInMs:number;
  sourceOutMs:number;
  /** Preview-only playback speed; exported media must be processed to apply this value. */
  rate:number;
}
export interface TimelineEdit { clips:TimelineClip[]; excludedSegmentIds:string[]; }
export interface TimelineHistory {past:TimelineEdit[]; future:TimelineEdit[];}
export interface TimelineLesson {segments:SegmentRef[]; timeline?:TimelineEdit; timelineHistory?:TimelineHistory;}
export type TimelineCommand =
  | {type:'trim';clipId:string;sourceInMs:number;sourceOutMs:number}
  | {type:'move';clipId:string;direction:-1|1}
  | {type:'rate';clipId:string;rate:number}
  | {type:'delete';clipId:string}
  | {type:'restore';segmentId:string}
  | {type:'replace';clipId:string;newSegmentId:string};
const available=(s:SegmentRef)=>s.status==='complete'||s.status==='recovered';
const duration=(s:SegmentRef)=>s.endMs===undefined?0:Math.max(0,s.endMs-s.startMs);
export function effectiveTimeline(lesson:TimelineLesson):TimelineEdit {
  const existing=lesson.timeline?.clips??[];
  const excluded=new Set(lesson.timeline?.excludedSegmentIds??[]);
  const valid=new Map(lesson.segments.filter(s=>available(s)&&duration(s)>0).map(s=>[s.id,s]));
  const clips=existing.filter(c=>valid.has(c.segmentId)&&c.sourceOutMs>c.sourceInMs).map(c=>{
    const end=duration(valid.get(c.segmentId)!);
    return {...c,sourceInMs:Math.min(c.sourceInMs,Math.max(0,end-1)),sourceOutMs:Math.min(c.sourceOutMs,end)};
  }).filter(c=>c.sourceOutMs>c.sourceInMs);
  const included=new Set(clips.map(c=>c.segmentId));
  for(const s of lesson.segments){
    if(available(s)&&duration(s)>0&&!included.has(s.id)&&!excluded.has(s.id)){
      clips.push({id:`clip:${s.id}`,segmentId:s.id,sourceInMs:0,sourceOutMs:duration(s),rate:1});
    }
  }
  return {clips,excludedSegmentIds:[...excluded]};
}
export function editTimeline(lesson:TimelineLesson,command:TimelineCommand):TimelineEdit{
  const base=effectiveTimeline(lesson);
  const clips=base.clips.map(c=>({...c}));
  const excluded=new Set(base.excludedSegmentIds);
  const index='clipId' in command?clips.findIndex(c=>c.id===command.clipId):-1;
  if(index<0&&command.type!=='restore')throw new Error('Selected clip is not available.');
  switch(command.type){
    case 'trim':{
      const clip=clips[index]!;
      const segment=lesson.segments.find(s=>s.id===clip.segmentId)!;
      const max=duration(segment);
      const {sourceInMs:a,sourceOutMs:b}=command;
      if(!Number.isInteger(a)||!Number.isInteger(b)||a<0||b>max||b-a<100)throw new Error('Trim range must fit the saved clip and leave at least 100 ms.');
      clips[index]={...clip,sourceInMs:a,sourceOutMs:b};break;
    }
    case 'move':{
      const dest=index+command.direction;if(dest<0||dest>=clips.length)throw new Error('Clip cannot move further.');
      [clips[index],clips[dest]]=[clips[dest]!,clips[index]!];break;
    }
    case 'rate':{
      if(!Number.isFinite(command.rate)||command.rate<0.5||command.rate>2)throw new Error('Preview rate must be between 0.5 and 2.');
      clips[index]={...clips[index]!,rate:command.rate};break;
    }
    case 'delete':{
      const removed=clips.splice(index,1)[0]!;
      if(!clips.some(c=>c.segmentId===removed.segmentId))excluded.add(removed.segmentId);
      break;
    }
    case 'restore':{
      const s=lesson.segments.find(x=>x.id===command.segmentId);
      if(!s||!available(s)||!duration(s))throw new Error('Original recording is not available.');
      excluded.delete(s.id);
      if(!clips.some(c=>c.segmentId===s.id))clips.push({id:`clip:${s.id}`,segmentId:s.id,sourceInMs:0,sourceOutMs:duration(s),rate:1});
      break;
    }
    case 'replace':{
      const s=lesson.segments.find(x=>x.id===command.newSegmentId);
      if(!s||!available(s)||!duration(s))throw new Error('Replacement recording is not ready.');
      const prior=clips[index]!;
      if(clips.some((c,i)=>i!==index&&c.segmentId===s.id))throw new Error('Replacement recording is already used by another clip.');
      clips[index]={id:prior.id,segmentId:s.id,sourceInMs:0,sourceOutMs:duration(s),rate:1};
      if(!clips.some(c=>c.segmentId===prior.segmentId))excluded.add(prior.segmentId);
      excluded.delete(s.id);break;
    }
  }
  return {clips,excludedSegmentIds:[...excluded]};
}
export function timelineDuration(clips:TimelineClip[]):number{
  return clips.reduce((sum,c)=>sum+(c.sourceOutMs-c.sourceInMs)/c.rate,0);
}
/** Maps an edited timeline playhead into the immutable source recording/board event clock. */
export function locateTimelineTime(lesson:TimelineLesson,t:number):{clip:TimelineClip;sourceTimeMs:number;clipOffsetMs:number}|null {
  if(!Number.isFinite(t)||t<0)return null;
  let remaining=t;
  const all=effectiveTimeline(lesson).clips;
  for(const c of all){
    const len=(c.sourceOutMs-c.sourceInMs)/c.rate;
    if(remaining<len||Math.abs(remaining-len)<0.01&&c===all.at(-1)){
      const segment=lesson.segments.find(s=>s.id===c.segmentId)!;
      return {clip:c,sourceTimeMs:segment.startMs+c.sourceInMs+Math.min(len,remaining)*c.rate,clipOffsetMs:Math.min(len,remaining)};
    }
    remaining-=len;
  }
  return null;
}
export function appendTimelineHistory(lesson:TimelineLesson,edit:TimelineEdit):{timeline:TimelineEdit;timelineHistory:TimelineHistory}{
 const prev=effectiveTimeline(lesson),history=lesson.timelineHistory??{past:[],future:[]};
 return {timeline:edit,timelineHistory:{past:[...history.past.slice(-24),prev],future:[]}};
}
export function undoTimeline(lesson:TimelineLesson):{timeline:TimelineEdit;timelineHistory:TimelineHistory}|null{
 const history=lesson.timelineHistory;if(!history?.past.length)return null;
 return {timeline:history.past.at(-1)!,timelineHistory:{past:history.past.slice(0,-1),future:[effectiveTimeline(lesson),...history.future].slice(0,25)}};
}
export function redoTimeline(lesson:TimelineLesson):{timeline:TimelineEdit;timelineHistory:TimelineHistory}|null{
 const history=lesson.timelineHistory;if(!history?.future.length)return null;
 return {timeline:history.future[0]!,timelineHistory:{past:[...history.past.slice(-24),effectiveTimeline(lesson)],future:history.future.slice(1)}};
}
