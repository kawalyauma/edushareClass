import type {TimelineClip,TimelineLesson} from '@edushare/timeline-editor';
import {effectiveTimeline,timelineDuration} from '@edushare/timeline-editor';

export interface ExportClipPlan {
  clipId:string;segmentId:string;sourceInMs:number;sourceOutMs:number;rate:number;
  targetStartMs:number;targetEndMs:number;
}
export interface ExportPlan {width:1920;height:1080;fps:30;durationMs:number;clips:ExportClipPlan[];}
const MAX_CLIPS=100;
const MAX_DURATION_MS=15*60_000; // memory/realtime browser safety budget, not a product-wide limit
export function planExport(lesson:TimelineLesson):ExportPlan {
  const clips=effectiveTimeline(lesson).clips;
  if(!clips.length)throw new Error('There are no saved recording clips to export.');
  if(clips.length>MAX_CLIPS)throw new Error('Too many clips for local browser export; use the optional offline FFmpeg worker.');
  const durationMs=timelineDuration(clips);
  if(!Number.isFinite(durationMs)||durationMs<=0||durationMs>MAX_DURATION_MS)throw new Error('Local browser export supports at most 15 minutes. Use the offline FFmpeg worker for longer lessons.');
  let cursor=0;
  const plan:ExportClipPlan[]=clips.map((clip:TimelineClip)=>{
    const segment=lesson.segments.find(s=>s.id===clip.segmentId);
    if(!segment||segment.status!=='complete'&&segment.status!=='recovered')throw new Error('Export includes an incomplete or missing recording.');
    if(!segment.endMs)throw new Error('Recording duration is unknown; recover/finish this clip first.');
    if(clip.sourceInMs<0||clip.sourceOutMs>segment.endMs-segment.startMs||clip.sourceOutMs<=clip.sourceInMs)throw new Error('Clip trim exceeds its original recording.');
    const start=cursor;cursor+=(clip.sourceOutMs-clip.sourceInMs)/clip.rate;
    return {clipId:clip.id,segmentId:clip.segmentId,sourceInMs:clip.sourceInMs,sourceOutMs:clip.sourceOutMs,rate:clip.rate,targetStartMs:start,targetEndMs:cursor};
  });
  return {width:1920,height:1080,fps:30,durationMs,clips:plan};
}
/** Metadata accompanies downloads, but original teacher audio and PDF sources are never uploaded. */
export function exportMetadata(lesson:{id:string;title:string;sources:{id:string;sha256:string;fileName:string}[]},plan:ExportPlan,mimeType:string){
  return {format:'edushareclass-export-v1',lessonId:lesson.id,title:lesson.title,
    sourceProof:lesson.sources.map(s=>({id:s.id,sha256:s.sha256,fileName:s.fileName})),
    width:plan.width,height:plan.height,fps:plan.fps,mimeType,durationMs:plan.durationMs,clips:plan.clips};
}
