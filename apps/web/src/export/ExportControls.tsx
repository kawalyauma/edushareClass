import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import type {BoardStudio} from '../board/useBoardStudio';
import {LocalMediaChunks} from '../recording/mediaStore';
import {planExport,exportMetadata} from '@edushare/export-core';
import {exportLessonBrowser} from './browserExport';

type Output={url:string;fileName:string;metaUrl:string};
export function ExportControls({studio}:{studio:BoardStudio}){
 const store=useMemo(()=>new LocalMediaChunks(),[]);
 const [running,setRunning]=useState(false),[progress,setProgress]=useState(0),[notice,setNotice]=useState('No export started.'),[branding,setBranding]=useState('');
 const [output,setOutput]=useState<Output|null>(null);
 const abortRef=useRef<AbortController|null>(null);
 const urls=useRef<string[]>([]);
 const plan=useMemo(()=>{try{return {ok:true as const,value:planExport(studio.lesson)};}catch(e){return {ok:false as const,error:e instanceof Error?e.message:String(e)};}},[studio.lesson]);
 const release=useCallback(()=>{for(const url of urls.current)URL.revokeObjectURL(url);urls.current=[];setOutput(null);},[]);
 useEffect(()=>()=>{abortRef.current?.abort();for(const url of urls.current)URL.revokeObjectURL(url);},[]);
 const start=useCallback(async()=>{
   if(running||!plan.ok)return;
   const abort=new AbortController();abortRef.current=abort;setRunning(true);setProgress(0);release();setNotice('Preparing local 1080p source clips…');
   try{
     const result=await exportLessonBrowser({plan:plan.value,readSegment:id=>store.toBlob(studio.lesson.id,id),
       signal:abort.signal,branding,progress:p=>setProgress(Math.round(p*100))});
     const metadata=exportMetadata(studio.lesson,plan.value,result.mimeType);
     const videoUrl=URL.createObjectURL(result.blob);
     const metaUrl=URL.createObjectURL(new Blob([JSON.stringify(metadata,null,2)],{type:'application/json'}));
     urls.current=[videoUrl,metaUrl];
     const ext=result.mimeType.includes('mp4')?'mp4':'webm';
     setOutput({url:videoUrl,fileName:`${studio.lesson.id}-edited.${ext}`,metaUrl});
     setNotice(`Local export complete (${Math.round(result.blob.size/1024/1024)} MiB). Download both video and provenance manifest.`);
   }catch(e){setNotice(e instanceof Error?e.message:String(e));}
   finally{abortRef.current=null;setRunning(false);}
 },[running,plan,release,store,studio.lesson,branding]);
 return <section className="export-controls" aria-label="Local edited video export">
  <h2>Export lesson video</h2>
  <p className="board-note">Renders the edited, reordered board-only clips at 1920×1080 with the saved teacher audio. This happens locally in real time; keep this tab visible and awake.</p>
  {plan.ok?<p className="board-note">{plan.value.clips.length} clip(s) · about {(plan.value.durationMs/60000).toFixed(1)} min output · 30 fps</p>:<p className="pdf-inline-error" role="alert">{plan.error}</p>}
  <label>Optional teaching-board caption (leave blank for exact board-only output) <input type="text" maxLength={40} value={branding} onChange={e=>setBranding(e.target.value)}/></label>
  <div className="board-control-row">
    <button className="btn" type="button" disabled={running||!plan.ok} onClick={()=>void start()}>Export edited recording</button>
    <button className="btn" type="button" disabled={!running} onClick={()=>abortRef.current?.abort()}>Cancel</button>
  </div>
  <progress aria-label="Export progress" max="100" value={progress}/>
  {output&&<div className="board-control-row"><a href={output.url} download={output.fileName} className="btn">Download {output.fileName.split('.').at(-1)?.toUpperCase()} video</a>
    <a href={output.metaUrl} download={`${studio.lesson.id}-export-manifest.json`} className="btn">Download edit/source manifest</a></div>}
  <p role="status">{notice}</p>
  <p className="board-note">Your browser determines whether WebM or MP4 is available. This is not a guaranteed MP4. A separate local FFmpeg worker can make H.264/AAC MP4 without uploading your recordings; see docs/phase-08-acceptance.md. Synchronisation and 30-minute playback QA remain required.</p>
 </section>;
}
