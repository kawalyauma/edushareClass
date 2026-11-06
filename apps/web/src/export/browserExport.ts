import type {ExportPlan} from '@edushare/export-core';
import {supportedRecorderMime} from '@edushare/recording-core';
import {paintNotesUGVideoScene,videoBrandTiming} from './videoBranding';
import type {NotesUGVideoBrand,VideoScene} from './videoBranding';

export interface BrowserExportOptions {
  plan:ExportPlan;
  readSegment:(segmentId:string)=>Promise<Blob|null>;
  progress:(fraction:number)=>void;
  signal:AbortSignal;
  branding?:string;
  videoBrand?:NotesUGVideoBrand;
}
export type BrowserExportResult={blob:Blob;mimeType:string};
const failAbort=()=>new DOMException('Video export cancelled.','AbortError');
const waitMedia=(video:HTMLVideoElement,event:'loadedmetadata'|'seeked',signal:AbortSignal):Promise<void>=>
 new Promise((resolve,reject)=>{
   if(signal.aborted){reject(failAbort());return;}
   const ready=()=>{cleanup();resolve();},bad=()=>{cleanup();reject(new Error('Recorded media is not decodable by this browser.'));},cancel=()=>{cleanup();reject(failAbort());};
   const cleanup=()=>{video.removeEventListener(event,ready);video.removeEventListener('error',bad);signal.removeEventListener('abort',cancel);};
   video.addEventListener(event,ready,{once:true});video.addEventListener('error',bad,{once:true});signal.addEventListener('abort',cancel,{once:true});
 });

/** Real-time browser compositor. Output remains browser-supported format (usually WebM), NOT promised MP4. */
export async function exportLessonBrowser(options:BrowserExportOptions):Promise<BrowserExportResult>{
 const {plan,readSegment,progress,signal}=options;
 if(signal.aborted)throw failAbort();
 if(!HTMLCanvasElement.prototype.captureStream || !globalThis.MediaRecorder || !globalThis.AudioContext)
   throw new Error('This browser cannot capture audio plus video from a 1080p canvas.');
 const mime=supportedRecorderMime(MediaRecorder.isTypeSupported.bind(MediaRecorder));
 if(!mime)throw new Error('No video/audio recording MIME type supported.');
 // Preflight *before* recording: missing media must not produce a silently incomplete lesson.
 const assets=new Map<string,Blob>();
 for(const clip of plan.clips){
   if(signal.aborted)throw failAbort();
   if(!assets.has(clip.segmentId)){
     const blob=await readSegment(clip.segmentId);
     if(!blob?.size)throw new Error(`Saved source recording ${clip.segmentId} was not found. Export aborted.`);
     assets.set(clip.segmentId,blob);
   }
 }
 const canvas=document.createElement('canvas');canvas.width=plan.width;canvas.height=plan.height;
 const ctx=canvas.getContext('2d',{alpha:false});if(!ctx)throw new Error('1080p canvas rendering unavailable.');
 const source=document.createElement('video');source.preload='auto';source.playsInline=true;
 const audio=new AudioContext();
 const destination=audio.createMediaStreamDestination();
 const node=audio.createMediaElementSource(source);
 node.connect(destination); // Do not connect to system speakers: avoids microphone feedback.
 const surface=canvas.captureStream(plan.fps);
 const combined=new MediaStream([...surface.getVideoTracks(),...destination.stream.getAudioTracks()]);
 const recorder=new MediaRecorder(combined,{mimeType:mime,videoBitsPerSecond:5_000_000});
 const blobs:Blob[]=[];
 const timing=videoBrandTiming(options.videoBrand);
 const totalDuration=plan.durationMs+timing.introMs+timing.outroMs;
 let scene:VideoScene=timing.introMs?'intro':'lesson';
 let sceneElapsed=0;
 const updateProgress=(elapsed:number)=>progress(Math.min(1,Math.max(0,elapsed/totalDuration)));

 let raf:number|null=null,recorderStarted=false;
 const urls:string[]=[];
 let failRecord:(cause:Error)=>void=()=>{};
 const stopPromise=new Promise<void>((resolve,reject)=>{
   failRecord=reject;
   recorder.addEventListener('dataavailable',e=>{if(e.data.size)blobs.push(e.data);});
   recorder.addEventListener('stop',()=>resolve(),{once:true});
   recorder.addEventListener('error',()=>reject(new Error('MediaRecorder failed while exporting.')),{once:true});
 });
 const paint=()=>{
   ctx.fillStyle='#10151a';ctx.fillRect(0,0,plan.width,plan.height);
   if(source.readyState>=2&&source.videoWidth>0&&source.videoHeight>0){
     const scale=Math.min(plan.width/source.videoWidth,plan.height/source.videoHeight);
     const w=source.videoWidth*scale,h=source.videoHeight*scale;
     ctx.drawImage(source,(plan.width-w)/2,(plan.height-h)/2,w,h);
   }
   if(options.videoBrand?.enabled)paintNotesUGVideoScene(
     ctx,plan.width,plan.height,scene,options.videoBrand,sceneElapsed
   );
   if(scene==='lesson'&&options.branding?.trim()){
     const text=options.branding.trim().slice(0,40);
     ctx.fillStyle='rgba(0,24,19,.77)';
     ctx.fillRect(24,plan.height-107,Math.min(930,text.length*21+48),68);
     ctx.fillStyle='#f2e8cd';ctx.font='bold 30px sans-serif';
     ctx.fillText(text,47,plan.height-62,860);
   }
 };
 const loop=()=>{paint();raf=requestAnimationFrame(loop);};
 const hold=async(ms:number,progressStartMs:number)=>{
   if(ms<=0)return;
   const started=performance.now();
   await new Promise<void>((resolve,reject)=>{
     let frame:number|null=null;
     const cancel=()=>{if(frame!==null)cancelAnimationFrame(frame);
       signal.removeEventListener('abort',cancel);
       reject(failAbort());
     };
     const tick=()=>{
       if(signal.aborted){cancel();return;}
       sceneElapsed=Math.min(ms,performance.now()-started);
       updateProgress(progressStartMs+sceneElapsed);
       if(sceneElapsed>=ms){signal.removeEventListener('abort',cancel);resolve();return;}
       frame=requestAnimationFrame(tick);
     };
     signal.addEventListener('abort',cancel,{once:true});tick();
   });
 };

 const cancel=()=>{source.pause();if(recorder.state!=='inactive')recorder.stop();};
 signal.addEventListener('abort',cancel,{once:true});
 try{
   if(audio.state==='suspended')await audio.resume();
   recorder.start(1000);recorderStarted=true;loop();
   if(timing.introMs)await hold(timing.introMs,0);
   scene='lesson';sceneElapsed=0;
   for(const clip of plan.clips){
     if(signal.aborted)throw failAbort();
     const url=URL.createObjectURL(assets.get(clip.segmentId)!);urls.push(url);
     source.pause();source.src=url;source.load();
     if(source.readyState<1)await waitMedia(source,'loadedmetadata',signal);
     if(source.duration*1000+100 < clip.sourceOutMs)
       throw new Error('Source video decoded duration is shorter than the selected trim.');
     source.playbackRate=clip.rate;
     const seekAt=clip.sourceInMs/1000;
     if(Math.abs(source.currentTime-seekAt)>0.02){source.currentTime=seekAt;await waitMedia(source,'seeked',signal);}
     // This must be initiated by a user click; some browsers require a fresh user gesture.
     await source.play();
     await new Promise<void>((resolve,reject)=>{
       let frame=0;
       const advance=()=>{
         if(signal.aborted){reject(failAbort());return;}
         const mediaMs=source.currentTime*1000;
         const portion=Math.min(1,Math.max(0,(mediaMs-clip.sourceInMs)/(clip.sourceOutMs-clip.sourceInMs)));
         updateProgress(timing.introMs+clip.targetStartMs+portion*(clip.targetEndMs-clip.targetStartMs));
         if(mediaMs+15>=clip.sourceOutMs){source.pause();resolve();return;}
         if(source.ended){reject(new Error('Source media ended before the selected trim completed.'));return;}
         // This only drives progress/completion; the rendering loop is separate.
         frame=requestAnimationFrame(advance);
       };
       advance();
       // On abort, advance detects it in the next animation frame.
       void frame;
     });
   }
   source.pause();
   if(timing.outroMs){
     scene='outro';sceneElapsed=0;
     await hold(timing.outroMs,timing.introMs+plan.durationMs);
   }
   if(recorder.state!=='inactive')recorder.stop();
   await stopPromise;
   if(signal.aborted)throw failAbort();
   const blob=new Blob(blobs,{type:mime});
   if(!blob.size)throw new Error('Browser returned an empty export.');
   progress(1);return {blob,mimeType:mime};
 }catch(e){
   if(recorderStarted&&recorder.state!=='inactive')recorder.stop();
   // Prevent unresolved recorder errors from producing unhandled rejections.
   void stopPromise.catch(()=>{});
   if(e instanceof Error)throw e;
   throw new Error(String(e));
 }finally{
   signal.removeEventListener('abort',cancel);
   if(raf!==null)cancelAnimationFrame(raf);
   source.pause();source.removeAttribute('src');source.load();
   for(const url of urls)URL.revokeObjectURL(url);
   for(const track of combined.getTracks())track.stop();
   await audio.close().catch(()=>{});
   void failRecord;
 }
}
