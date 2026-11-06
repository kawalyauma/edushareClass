/** Browser feature and codec selection: never promise MP4 support without probing. */
export const CONTAINERS = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
] as const;
export function supportedRecorderMime(isSupported:(mime:string)=>boolean):string|null {
  return CONTAINERS.find(mime => isSupported(mime)) ?? null;
}
export type RecorderStatus = 'idle'|'requesting'|'recording'|'paused'|'stopping'|'error';
/** Explicit transition model, independent of mutable browser event order. */
export function nextRecorderState(current:RecorderStatus,event:'request'|'start'|'pause'|'resume'|'stop'|'finish'|'fail'|'reset'):RecorderStatus {
  if(event==='fail')return 'error';
  const legal:Record<RecorderStatus,Partial<Record<typeof event,RecorderStatus>>>= {
    idle:{request:'requesting'}, requesting:{start:'recording',reset:'idle'},
    recording:{pause:'paused',stop:'stopping'},paused:{resume:'recording',stop:'stopping'},
    stopping:{finish:'idle'},error:{reset:'idle'}
  };
  const next=legal[current][event];
  if(!next)throw new Error(`Illegal recording state: ${current} → ${event}`);
  return next;
}
/** Clock is on the same monotonic performance.now axis used by board events. */
export class SessionClock {
  private pausedAt:number|null=null;
  private pauseDuration=0;
  constructor(readonly startMs:number,private readonly origin:number,private readonly now:()=>number){}
  elapsed():number {const current=this.pausedAt??this.now();return Math.max(0,Math.round(current-this.origin-this.pauseDuration));}
  lessonTime():number{return this.startMs+this.elapsed();}
  pause():void{if(this.pausedAt===null)this.pausedAt=this.now();}
  resume():void{if(this.pausedAt!==null){this.pauseDuration+=this.now()-this.pausedAt;this.pausedAt=null;}}
}
