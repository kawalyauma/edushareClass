import type {LessonRecording} from './useLessonRecording';
const format=(time:number)=>`${String(Math.floor(time/60000)).padStart(2,'0')}:${String(Math.floor(time%60000/1000)).padStart(2,'0')}`;
export function RecordingControls({recording}: {recording:LessonRecording}){
 const busy=recording.phase!=='idle';
 const run=(promise:Promise<unknown>)=>{void promise.catch(()=>{});};
 return <fieldset className="recording-controls"><legend>Teacher voice + board recording</legend>
  <p className="board-note">Only the 1920×1080 teaching board is captured. Your own microphone is the only voice source; PDF sidebar, tools and webcam are excluded.</p>
  <label>Microphone
   <select aria-label="Microphone input device" value={recording.deviceId} disabled={busy} onChange={e=>recording.setDeviceId(e.target.value)}>
    <option value="">System default microphone</option>
    {recording.devices.filter(d=>d.deviceId).map((d,i)=><option value={d.deviceId} key={d.deviceId}>{d.label||`Microphone ${i+1}`}</option>)}
   </select>
  </label>
  <div className="board-control-row">
   <button className="btn" type="button" disabled={busy} onClick={()=>run(recording.start())}>Start recording</button>
   <button className="btn" type="button" disabled={recording.phase!=='recording'} onClick={recording.pause}>Pause</button>
   <button className="btn" type="button" disabled={recording.phase!=='paused'} onClick={recording.resume}>Resume</button>
   <button className="btn" type="button" disabled={!['recording','paused'].includes(recording.phase)} onClick={()=>run(recording.stop())}>Stop &amp; save</button>
   <button className="btn" type="button" disabled={!['recording','paused'].includes(recording.phase)} onClick={recording.toggleMute}>{recording.muted?'Unmute':'Mute'} mic</button>
  </div>
  <div role="status" aria-live="polite">{recording.phase} · {format(recording.elapsed)} · Microphone level {recording.level}%</div>
  <meter aria-label="Microphone live level" min={0} max={100} value={recording.muted?0:recording.level}/>
  {recording.download&&<a className="btn" download={recording.download.fileName} href={recording.download.url}>Download recorded video (browser format)</a>}
  {recording.recovered.length>0&&<div className="recording-recovery">
    <strong>Locally saved sessions</strong>
    {recording.recovered.map(seg=><div className="board-control-row" key={seg.id}>
      <span>{seg.status==='recording'?'Interrupted':seg.status} · {seg.chunks} chunk(s)</span>
      <button className="btn" type="button" onClick={()=>run(recording.restore(seg.id))}>Open saved video</button>
    </div>)}
   </div>}
  {recording.error&&<p role="alert" className="pdf-inline-error">{recording.error}</p>}
  <p className="board-note" role="status">{recording.notice}</p>
  <p className="board-note">This is a browser recording (usually WebM), not a guaranteed MP4. Keep the tab open while recording. Export/synchronisation acceptance belongs to later phases.</p>
 </fieldset>;
}
