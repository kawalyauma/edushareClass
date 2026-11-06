import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import type {BoardStudio} from '../board/useBoardStudio';
import type {LessonRecording} from '../recording/useLessonRecording';
import {LocalMediaChunks} from '../recording/mediaStore';
import {effectiveTimeline,editTimeline,appendTimelineHistory,undoTimeline,redoTimeline,timelineDuration,locateTimelineTime} from '@edushare/timeline-editor';
import type {TimelineCommand} from '@edushare/timeline-editor';

const fmt=(n:number)=>`${(n/1000).toFixed(2)} s`;
/** Local editor: trims/reorders clips without ever modifying the source blob or PDF. */
export function TimelineEditor({studio,recording}:{studio:BoardStudio;recording:LessonRecording}){
  const timeline=useMemo(()=>effectiveTimeline(studio.lesson),[studio.lesson]);
  const [chosen,setChosen]=useState('');
  const selected=timeline.clips.find(c=>c.id===chosen)??timeline.clips[0];
  const selectedSegment=studio.lesson.segments.find(s=>s.id===selected?.segmentId);
  const [start,setStart]=useState('0');
  const [end,setEnd]=useState('0');
  const [cursor,setCursor]=useState(0);
  const [notice,setNotice]=useState('Recording edits are autosaved locally. Original chunks remain unchanged.');
  const [previewURL,setPreviewURL]=useState<string|null>(null);
  const video=useRef<HTMLVideoElement|null>(null);
  const store=useMemo(()=>new LocalMediaChunks(),[]);
  const clipKey=selected?.id??'';
  useEffect(()=>{
    if(!selected)return;
    setStart(String(selected.sourceInMs));setEnd(String(selected.sourceOutMs));setCursor(selected.sourceInMs);
    studio.seek((selectedSegment?.startMs??0)+selected.sourceInMs);
    // Deliberately only on selection switch: trim fields remain editable while typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[clipKey]);
  useEffect(()=>{
    setPreviewURL(null);
    if(!selected)return;
    let disposed=false;
    let created:string|null=null;
    void store.toBlob(studio.lesson.id,selected.segmentId).then(blob=>{
      if(disposed)return;
      if(!blob){setNotice('The original media for this clip is missing. It cannot be previewed.');setPreviewURL(null);return;}
      created=URL.createObjectURL(blob);setPreviewURL(created);
    }).catch(e=>{if(!disposed){setPreviewURL(null);setNotice(e instanceof Error?e.message:String(e));}});
    return()=>{disposed=true;if(created)URL.revokeObjectURL(created);};
  },[clipKey,selected?.segmentId,studio.lesson.id,store]);
  const apply=useCallback(async(command:TimelineCommand)=>{
    try{
      await studio.updateLesson(lesson=>({...lesson,...appendTimelineHistory(lesson,editTimeline(lesson,command))}));
      setNotice('Timeline edit saved locally; original recording is unchanged.');
    }catch(e){setNotice(e instanceof Error?e.message:String(e));}
  },[studio]);
  const shiftHistory=useCallback(async(dir:'undo'|'redo')=>{
    try{
      await studio.updateLesson(l=>{
        const patch=dir==='undo'?undoTimeline(l):redoTimeline(l);
        if(!patch)throw new Error(`There is no timeline edit to ${dir}.`);
        return {...l,...patch};
      });
      setNotice('Timeline edit history restored and saved.');
    }catch(e){setNotice(e instanceof Error?e.message:String(e));}
  },[studio]);
  const seek=(ms:number)=>{
    if(!selected)return;
    const x=Math.max(selected.sourceInMs,Math.min(ms,selected.sourceOutMs));
    setCursor(x);if(video.current){video.current.pause();video.current.currentTime=x/1000;}
    studio.seek((selectedSegment?.startMs??0)+x);
  };
  const clipIndex=selected?timeline.clips.findIndex(x=>x.id===selected.id):-1;
  const total=timelineDuration(timeline.clips);
  const restoreIds=timeline.excludedSegmentIds.filter(id=>studio.lesson.segments.some(s=>s.id===id));
  return <section className="timeline-editor" aria-label="Non-destructive lesson timeline">
    <h2>Lesson timeline and editing</h2>
    <p className="board-note">{timeline.clips.length} clip(s), edited duration {fmt(total)}. Original microphone recordings, PDF sources and board events are kept unchanged.</p>
    <div className="board-control-row">
      <button className="btn" type="button" disabled={!studio.lesson.timelineHistory?.past.length || recording.phase!=='idle'} onClick={()=>void shiftHistory('undo')}>Undo timeline edit</button>
      <button className="btn" type="button" disabled={!studio.lesson.timelineHistory?.future.length || recording.phase!=='idle'} onClick={()=>void shiftHistory('redo')}>Redo timeline edit</button>
    </div>
    {timeline.clips.length>0?<>
      <ol className="timeline-clip-list">
        {timeline.clips.map((c,i)=><li key={c.id}>
          <button className="btn" type="button" aria-pressed={selected?.id===c.id} onClick={()=>setChosen(c.id)}>
            {i+1}. {c.segmentId.slice(0,8)} · {fmt((c.sourceOutMs-c.sourceInMs)/c.rate)} ({c.rate}×)
          </button>
        </li>)}
      </ol>
      {selected&&<fieldset disabled={recording.phase!=='idle'}><legend>Selected clip</legend>
        <div className="board-control-row">
          <button className="btn" type="button" disabled={clipIndex===0} onClick={()=>void apply({type:'move',clipId:selected.id,direction:-1})}>Move earlier</button>
          <button className="btn" type="button" disabled={clipIndex===timeline.clips.length-1} onClick={()=>void apply({type:'move',clipId:selected.id,direction:1})}>Move later</button>
          <button className="btn" type="button" onClick={()=>void apply({type:'delete',clipId:selected.id})}>Remove clip from timeline</button>
        </div>
        <div className="board-control-row">
          <label>Trim start (seconds) <input type="number" min="0" step="0.1" value={Number(start)/1000} onChange={e=>setStart(String(Math.round(Number(e.target.value)*1000)))}/></label>
          <label>Trim end (seconds) <input type="number" min="0" step="0.1" value={Number(end)/1000} onChange={e=>setEnd(String(Math.round(Number(e.target.value)*1000)))}/></label>
          <button className="btn" type="button" onClick={()=>void apply({type:'trim',clipId:selected.id,sourceInMs:Number(start),sourceOutMs:Number(end)})}>Apply trim</button>
        </div>
        <label>Preview speed <select aria-label="Preview clip speed" value={selected.rate} onChange={e=>void apply({type:'rate',clipId:selected.id,rate:Number(e.target.value)})}>
          {[0.5,0.75,1,1.25,1.5,2].map(r=><option value={r} key={r}>{r}×</option>)}
        </select></label>
        <label>Clip scrubber <input type="range" min={selected.sourceInMs} max={selected.sourceOutMs} step="50" value={Math.min(selected.sourceOutMs,Math.max(selected.sourceInMs,cursor))} onChange={e=>seek(Number(e.target.value))}/></label>
        <div className="board-note">Current source position {fmt(cursor)} · Board action time {fmt((selectedSegment?.startMs??0)+cursor)}</div>
        {previewURL?<video ref={video} aria-label="Local recording preview" src={previewURL} controls playsInline preload="metadata" style={{maxWidth:'100%',maxHeight:260}}
          onLoadedMetadata={e=>{e.currentTarget.playbackRate=selected.rate;e.currentTarget.currentTime=selected.sourceInMs/1000;}}
          onTimeUpdate={e=>{const player=e.currentTarget;const ms=Math.round(player.currentTime*1000);if(ms>=selected.sourceOutMs){player.pause();player.currentTime=selected.sourceOutMs/1000;}
            if(ms<selected.sourceInMs){player.currentTime=selected.sourceInMs/1000;return;}
            setCursor(Math.min(ms,selected.sourceOutMs));studio.seek((selectedSegment?.startMs??0)+ms);
          }}/>:<p className="board-note">No local video available for this clip. Original file has not been deleted.</p>}
        <div className="board-control-row">
          <button className="btn" type="button" onClick={()=>seek(selected.sourceInMs)}>Show board at clip start</button>
          <button className="btn" type="button" onClick={()=>studio.showAll()}>Return to live board</button>
        </div>
        <p className="board-note">To re-record this section, show its board snapshot, press Start recording above, and then replace this clip with the new completed segment below. No old recording is destroyed.</p>
        <label>Replace with newly recorded segment <select id="replacement-segment" defaultValue=""><option value="">Choose completed unused recording</option>
          {studio.lesson.segments.filter(s=>s.status==='complete'&&!timeline.clips.some(c=>c.segmentId===s.id)).map(s=><option key={s.id} value={s.id}>{s.id.slice(0,12)}</option>)}
        </select></label>
        <button className="btn" type="button" onClick={()=>{const el=document.getElementById('replacement-segment') as HTMLSelectElement|null;if(el?.value)void apply({type:'replace',clipId:selected.id,newSegmentId:el.value});else setNotice('Choose a completed replacement recording first.');}}>Replace this clip</button>
      </fieldset>}
    </>:<p className="board-note">Record a segment to begin editing.</p>}
    {restoreIds.length>0&&<fieldset><legend>Removed from timeline (recordings preserved)</legend>
      {restoreIds.map(id=><div key={id} className="board-control-row"><code>{id.slice(0,12)}</code><button className="btn" type="button" onClick={()=>void apply({type:'restore',segmentId:id})}>Restore clip</button></div>)}
    </fieldset>}
    <p role="status">{notice}</p>
    <p className="board-note">Preview is local and non-destructive. Trim/speed/order are edit decisions, not yet a rendered export; see Phase 8 for rendering. Audio waveform analysis depends on browser codec support and is not available here.</p>
    <p className="board-note">Edited time-to-original-board mapping is calculated for every clip. Seek uses the original event log; recordings are not silently retimed in storage.</p>
  </section>;
}
