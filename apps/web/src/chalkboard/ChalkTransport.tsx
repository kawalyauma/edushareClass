import {useState} from 'react';
import {useNavigate} from 'react-router-dom';
import type {BoardStudio} from '../board/useBoardStudio';
import type {LessonRecording} from '../recording/useLessonRecording';

const clockLabel=(ms:number)=>{
  const sec=Math.max(0,Math.floor(ms/1000));
  return `${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`;
};

/** Recorder runs continuously while the teacher independently starts/stops chalk writing. */
export function ChalkTransport({studio,recording}:{studio:BoardStudio;recording:LessonRecording}){
  const navigate=useNavigate();
  const [issue,setIssue]=useState<string|null>(null);
  const take=studio.lesson.chalkTake;
  const active=['recording','paused'].includes(recording.phase);
  const starting=recording.phase==='requesting'||recording.phase==='stopping';
  const mediaPaused=recording.phase==='paused';
  const writingProgress=take
    ?studio.playhead===Infinity?(studio.isPlaying?0:100)
      :Math.round(100*Math.min(1,Math.max(0,(studio.playhead-take.startMs)/(take.endMs-take.startMs))))
    :0;
  const run=(job:()=>Promise<void>|void)=>{
    try{
      const result=job();
      if(result instanceof Promise)void result.then(()=>setIssue(null))
        .catch(e=>setIssue(e instanceof Error?e.message:String(e)));
      else setIssue(null);
    }catch(e){setIssue(e instanceof Error?e.message:String(e));}
  };
  return <section className="chalk-transport" aria-label="Lesson recording and chalk writing">
    <div className="chalk-transport-heading">
      <strong>Teaching studio — prepare, then record</strong>
      <span className={active?'chalk-live':'chalk-ready'} aria-live="polite">
        {recording.phase==='recording'?'● RECORDING':recording.phase==='paused'?'Recording paused':
          starting?'Preparing recorder…':take?'Boards prepared':'Needs a board draft'}
      </span>
    </div>
    {!take?<>
      <p>Import a PDF, select the part you want to teach, review the board drafts and approve them before recording.</p>
      <div className="chalk-transport-actions">
        <button className="btn" onClick={()=>navigate({search:'?panel=source'})}>1. Import PDF</button>
        <button className="btn" onClick={()=>navigate({search:'?panel=controls'})}>2. Review board drafts</button>
      </div>
    </>:<>
      <p>{take.pageIds.length} approved chalkboard{take.pageIds.length===1?'':'s'} ·
        {take.columns} columns · Script duration {clockLabel(take.endMs-take.startMs)}</p>
      <div className="chalk-transport-actions">
        <button className="btn" type="button" data-variant="primary"
          disabled={active||starting||studio.working}
          onClick={()=>run(async()=>{
            studio.cueChalkTake();
            await recording.start();
          })}>● Start recording</button>
        <button className="btn chalk-play" type="button"
          disabled={starting||mediaPaused||studio.isPlaying}
          onClick={()=>run(studio.playChalkTake)}>
          ▶ {active?'Play writing':'Rehearse writing'}
        </button>
        <button className="btn chalk-pause" type="button"
          disabled={!studio.isPlaying||starting}
          onClick={()=>run(studio.pause)}>Ⅱ Pause writing</button>
        <button className="btn" type="button" disabled={starting}
          onClick={()=>run(studio.cueChalkTake)}>↺ Rewind writing</button>
        <button className="btn" type="button" disabled={!active||starting}
          onClick={()=>run(async()=>{
            studio.pause();
            await recording.stop();
          })}>■ Stop &amp; save video</button>
      </div>
      <div className="chalk-writing-meter">
        <label htmlFor="chalk-writing-progress">Chalk writing: {writingProgress}%</label>
        <progress id="chalk-writing-progress" max={100} value={writingProgress}/>
      </div>
      <p className="chalk-transport-explain">
        <strong>Play / Pause writing</strong> controls only the chalk animation. Your microphone
        and video continue recording, so you can pause the writing while explaining.
        To pause the actual recording, use the separate recording controls;
        the writing will freeze until you explicitly play it again.
      </p>
    </>}
    {issue&&<p role="alert" className="pdf-inline-error">{issue}</p>}
    {recording.error&&<p role="alert" className="pdf-inline-error">{recording.error}</p>}
    {recording.download&&<a className="btn" href={recording.download.url}
      download={recording.download.fileName}>Download recorded lesson video</a>}
  </section>;
}
