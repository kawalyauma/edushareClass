import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import type {RefObject} from 'react';
import type {RecordingSegment} from '@edushare/shared-types';
import {SessionClock,supportedRecorderMime} from '@edushare/recording-core';
import type {RecorderStatus} from '@edushare/recording-core';
import type {BoardStudio} from '../board/useBoardStudio';
import {lastActionEnd} from '../board/useBoardStudio';
import {LocalMediaChunks} from './mediaStore';

interface Session {
  id:string;
  mimeType:string;
  recorder:MediaRecorder;
  mic:MediaStream;
  board:MediaStream;
  mixed:MediaStream;
  audio:AudioContext;
  analyser:AnalyserNode;
  clock:SessionClock;
  unbindClock:()=>void;
  chunkIds:string[];
  sequence:number;
  queue:Promise<void>;
  error:string|null;
  stopped:Promise<void>;
}
export interface RecoveryFile {id:string;status:RecordingSegment['status'];chunks:number;}
const readableError=(error:unknown)=>error instanceof Error?error.message:String(error);
const release=(session:Session)=>{
  session.unbindClock();
  for(const stream of [session.mic,session.board,session.mixed])for(const track of stream.getTracks())track.stop();
  void session.audio.close().catch(()=>{});
};

/** Recording source is ONLY the board canvas; the PDF/controls never enter captureStream. */
export function useLessonRecording(studio:BoardStudio,canvas:RefObject<HTMLCanvasElement|null>){
  const store=useMemo(()=>new LocalMediaChunks(),[]);
  const active=useRef<Session|null>(null);
  const [phase,setPhase]=useState<RecorderStatus>('idle');
  const [error,setError]=useState<string|null>(null);
  const [notice,setNotice]=useState('Microphone access starts only when you press Record.');
  const [devices,setDevices]=useState<MediaDeviceInfo[]>([]);
  const [deviceId,setDeviceId]=useState('');
  const [muted,setMuted]=useState(false);
  const [level,setLevel]=useState(0);
  const [elapsed,setElapsed]=useState(0);
  const [recovered,setRecovered]=useState<RecoveryFile[]>([]);
  const [download,setDownload]=useState<{url:string;fileName:string}|null>(null);
  const meterRef=useRef<number|null>(null);
  const urlRef=useRef<string|null>(null);
  const changeDownload=useCallback((blob:Blob,filename:string)=>{
    if(urlRef.current)URL.revokeObjectURL(urlRef.current);
    const url=URL.createObjectURL(blob);urlRef.current=url;
    setDownload({url,fileName:filename});
  },[]);
  const refreshDevices=useCallback(async()=>{
    if(!navigator.mediaDevices?.enumerateDevices)return;
    const inputs=(await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='audioinput');
    setDevices(inputs);
  },[]);
  const refreshRecovery=useCallback(async()=>{
    const candidates=studio.lesson.segments.filter(s=>s.status!=='discarded');
    const all=await Promise.all(candidates.map(async s=>({id:s.id,status:s.status,chunks:(await store.readSegment(studio.lesson.id,s.id)).length})));
    setRecovered(all.filter(x=>x.chunks>0));
  },[store,studio.lesson]);
  useEffect(()=>{void refreshDevices().catch(()=>{});},[refreshDevices]);
  useEffect(()=>{void refreshRecovery().catch(()=>{});},[refreshRecovery]);
  useEffect(()=>()=>{
    if(meterRef.current!==null)cancelAnimationFrame(meterRef.current);
    if(active.current){const old=active.current;active.current=null;
      if(old.recorder.state!=='inactive')old.recorder.stop();release(old);}
    if(urlRef.current)URL.revokeObjectURL(urlRef.current);
  },[]);
  const paintMeter=useCallback((session:Session)=>{
    const sample=new Uint8Array(session.analyser.fftSize);
    const tick=()=>{
      if(active.current!==session)return;
      session.analyser.getByteTimeDomainData(sample);
      let sum=0;for(const value of sample){const f=(value-128)/128;sum+=f*f;}
      setLevel(Math.min(100,Math.round(Math.sqrt(sum/sample.length)*220)));
      setElapsed(session.clock.elapsed());
      meterRef.current=requestAnimationFrame(tick);
    };
    tick();
  },[]);
  const start=useCallback(async()=>{
    if(active.current||phase!=='idle')throw new Error('A recording is already in progress.');
    if(urlRef.current){URL.revokeObjectURL(urlRef.current);urlRef.current=null;}
    setError(null);setDownload(null);setNotice('Requesting the teacher microphone…');setPhase('requesting');
    let mic:MediaStream|null=null,board:MediaStream|null=null,mixed:MediaStream|null=null,audio:AudioContext|null=null;
    let unbind:(()=>void)|null=null;
    let segmentId:string|null=null;
    let pendingSegment:RecordingSegment|null=null;
    try{
      const element=canvas.current;
      if(!element||!element.captureStream)throw new Error('Board canvas capture is unavailable in this browser.');
      if(!globalThis.MediaRecorder||!navigator.mediaDevices?.getUserMedia)throw new Error('This browser does not support microphone+board recording. Use current Chrome/Chromium over HTTPS or localhost.');
      const mime=supportedRecorderMime(MediaRecorder.isTypeSupported.bind(MediaRecorder));
      if(!mime)throw new Error('No supported MediaRecorder format with both video and audio.');
      mic=await navigator.mediaDevices.getUserMedia({audio:deviceId?{deviceId:{exact:deviceId},echoCancellation:true,noiseSuppression:true}:{echoCancellation:true,noiseSuppression:true},video:false});
      await refreshDevices();
      audio=new AudioContext();
      if(audio.state==='suspended')await audio.resume();
      const source=audio.createMediaStreamSource(mic);
      const analyser=audio.createAnalyser();analyser.fftSize=1024;
      const destination=audio.createMediaStreamDestination();
      source.connect(analyser);source.connect(destination); // No speakers: avoids feedback/echo.
      board=element.captureStream(30);
      if(!board.getVideoTracks().length)throw new Error('No video track available from teaching board.');
      mixed=new MediaStream([...board.getVideoTracks(),...destination.stream.getAudioTracks()]);
      const recorder=new MediaRecorder(mixed,{mimeType:mime,videoBitsPerSecond:4_000_000});
      segmentId=crypto.randomUUID();
      const startMs=lastActionEnd(studio.lesson.actions)+1;
      const clock=new SessionClock(startMs,performance.now(),()=>performance.now());
      const segment:RecordingSegment={id:segmentId,startMs,status:'recording',audioChunkIds:[],videoChunkIds:[]};
      pendingSegment=segment;
      await studio.upsertSegment(segment);
      unbind=studio.setRecordingClock(()=>clock.lessonTime());
      let onStop:()=>void=()=>{};
      const stopped=new Promise<void>(resolve=>{onStop=resolve;});
      const session:Session={id:segmentId,mimeType:mime,recorder,mic,board,mixed,audio,analyser,clock,unbindClock:unbind,
        chunkIds:[],sequence:0,queue:Promise.resolve(),error:null,stopped};
      recorder.addEventListener('stop',onStop,{once:true});
      recorder.addEventListener('error',()=>{session.error='Recorder reported an error; recovery may be partial.';});
      recorder.addEventListener('dataavailable',event=>{
        if(!event.data.size)return;
        const seq=session.sequence++;
        const id=LocalMediaChunks.idFor(studio.lesson.id,session.id,seq);
        const elapsedMs=clock.elapsed();
        session.queue=session.queue.then(async()=>{
          await store.save({id,lessonId:studio.lesson.id,segmentId:session.id,seq,elapsedMs,mimeType:mime,data:event.data});
          session.chunkIds.push(id);
          await studio.upsertSegment({...segment,videoChunkIds:[...session.chunkIds]});
        }).catch(e=>{session.error=`A recording chunk could not be persisted: ${readableError(e)}`;});
      });
      recorder.start(1000);
      active.current=session;
      setMuted(false);setLevel(0);setElapsed(0);setPhase('recording');
      setNotice('Recording the board and live microphone to this browser. No cloud upload.');
      paintMeter(session);
    }catch(e){
      if(unbind)unbind();
      for(const stream of [mic,board,mixed])stream?.getTracks().forEach(t=>t.stop());
      if(audio)void audio.close().catch(()=>{});
      if(pendingSegment)void studio.upsertSegment({...pendingSegment,status:'discarded'}).catch(()=>{});
      const message=readableError(e);setError(message);setPhase('idle');setNotice('Recording did not start.');
      throw e;
    }
  },[canvas,deviceId,phase,paintMeter,refreshDevices,store,studio]);
  const stop=useCallback(async()=>{
    const session=active.current;
    if(!session||!['paused','recording'].includes(phase))return;
    setPhase('stopping');setNotice('Finalising the saved media chunks…');
    try{
      if(session.recorder.state!=='inactive')session.recorder.stop();
      await session.stopped;
      await session.queue;
      const completed=session.chunkIds.length>0&&!session.error;
      const status:RecordingSegment['status']=completed?'complete':session.chunkIds.length?'recovered':'discarded';
      await studio.upsertSegment({id:session.id,startMs:session.clock.startMs,endMs:session.clock.lessonTime(),status,audioChunkIds:[],videoChunkIds:[...session.chunkIds]});
      if(session.chunkIds.length){const blob=await store.toBlob(studio.lesson.id,session.id);
        if(blob)changeDownload(blob,`${studio.lesson.id}-${session.id}.${blob.type.includes('mp4')?'mp4':'webm'}`);
      }
      if(session.error){setError(session.error);setNotice('Recording ended with a media persistence warning.');}
      else if(completed)setNotice(`Saved ${session.chunkIds.length} audio/video chunks locally. Download your browser recording.`);
      else setNotice('No media data was saved. Please retry.');
      await refreshRecovery();
    }catch(e){setError(readableError(e));setNotice('Recording stopped, but final metadata could not be saved. Check recovery.');}
    finally{
      active.current=null;release(session);setLevel(0);setPhase('idle');
      if(meterRef.current!==null){cancelAnimationFrame(meterRef.current);meterRef.current=null;}
    }
  },[phase,studio,store,changeDownload,refreshRecovery]);
  const pause=useCallback(()=>{
    const session=active.current;if(!session||phase!=='recording')return;
    session.recorder.pause();session.clock.pause();setPhase('paused');
  },[phase]);
  const resume=useCallback(()=>{
    const session=active.current;if(!session||phase!=='paused')return;
    session.clock.resume();session.recorder.resume();setPhase('recording');
  },[phase]);
  const toggleMute=useCallback(()=>{
    const session=active.current;if(!session)return;
    const next=!muted;for(const track of session.mic.getAudioTracks())track.enabled=!next;
    setMuted(next);
  },[muted]);
  const restore=useCallback(async(segmentId:string)=>{
    const segment=studio.lesson.segments.find(s=>s.id===segmentId);
    if(!segment)throw new Error('Segment no longer belongs to this lesson.');
    const blob=await store.toBlob(studio.lesson.id,segmentId);
    if(!blob)throw new Error('No locally saved chunks remain for this segment.');
    if(segment.status==='recording')await studio.upsertSegment({...segment,status:'recovered'});
    changeDownload(blob,`${studio.lesson.id}-${segmentId}.${blob.type.includes('mp4')?'mp4':'webm'}`);
    setNotice('Recovered the persisted chunks. Final seconds may be missing after a crash.');
  },[studio,store,changeDownload]);
  return {phase,start,stop,pause,resume,toggleMute,muted,level,elapsed,notice,error,devices,deviceId,setDeviceId,
    recovered,restore,refreshRecovery,download};
}
export type LessonRecording=ReturnType<typeof useLessonRecording>;
