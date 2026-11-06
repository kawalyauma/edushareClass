/** Decode the actual *playable* browser video duration, not only the capture wall clock.
 * MediaRecorder WebM frequently reports Infinity until a large seek discovers the end.
 * This is local and does not upload the teacher's recording. */
export function persistedRecordingDurationMs(clockMs:number,decodedMs:number|null):number {
  if(decodedMs!==null&&Number.isFinite(decodedMs)&&decodedMs>0)
    return Math.max(1,Math.round(decodedMs));
  return Math.max(1,Math.round(clockMs));
}
export async function probeRecordedVideoDurationMs(blob:Blob):Promise<number|null>{
  if(!blob.size||typeof document==='undefined')return null;
  const url=URL.createObjectURL(blob);
  const video=document.createElement('video');
  video.preload='metadata';video.muted=true;video.playsInline=true;
  const awaitEvent=(name:'loadedmetadata'|'seeked',timeoutMs:number)=>{
    return new Promise<void>((resolve,reject)=>{
      const done=()=>{cleanup();resolve();};
      const failed=()=>{cleanup();reject(new Error('Media duration could not be decoded.'));};
      const cleanup=()=>{clearTimeout(timer);video.removeEventListener(name,done);video.removeEventListener('error',failed);};
      const timer=setTimeout(failed,timeoutMs);
      video.addEventListener(name,done,{once:true});
      video.addEventListener('error',failed,{once:true});
    });
  };
  try{
    const metadata=awaitEvent('loadedmetadata',6500);
    video.src=url;video.load();
    await metadata;
    if(!Number.isFinite(video.duration)||video.duration<=0){
      const seek=awaitEvent('seeked',6500);
      video.currentTime=1e10;
      await seek;
    }
    const seconds=Number.isFinite(video.duration)&&video.duration>0?video.duration:
      Number.isFinite(video.currentTime)&&video.currentTime>0?video.currentTime:null;
    return seconds===null?null:Math.round(seconds*1000);
  }catch{
    return null;
  }finally{
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  }
}
