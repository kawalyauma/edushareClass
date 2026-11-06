import {useMemo,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import type {RefObject} from 'react';
import type {BoardStudio} from './useBoardStudio';
import {lastActionEnd} from './useBoardStudio';
import {isSupportedMath} from '@edushare/math-notation';
import {RecordingControls} from '../recording/RecordingControls';
import type {LessonRecording} from '../recording/useLessonRecording';
import {planChalkSection} from '../chalkboard/chalkNotes';
import {ChalkDraftGallery} from '../chalkboard/ChalkDraftGallery';
export function BoardControls({studio,recording,boardCanvas,selectionId,onSelectionChange}: {
  studio:BoardStudio;recording:LessonRecording;boardCanvas:RefObject<HTMLCanvasElement|null>;
  selectionId:string;onSelectionChange:(id:string)=>void;
}){
  const navigate=useNavigate();
  const [chalkColumns,setChalkColumns]=useState<1|2|3>(2);
  const [notice,setNotice]=useState<string|null>(null);
  const [typedText,setTypedText]=useState('');
  const [titleDraft,setTitleDraft]=useState(studio.lesson.title);
  const savePng=()=>{
    const canvas=boardCanvas.current;
    if(!canvas){setNotice('Teaching board canvas is not ready.');return;}
    canvas.toBlob(blob=>{
      if(!blob){setNotice('The browser could not create a board PNG.');return;}
      const url=URL.createObjectURL(blob);
      const a=document.createElement('a');
      a.href=url;
      a.download=(studio.lesson.title.replace(/[^a-z0-9_-]+/gi,'-').slice(0,64)||'teaching-board')+'.png';
      document.body.appendChild(a);a.click();a.remove();
      window.setTimeout(()=>URL.revokeObjectURL(url),1000);
      setNotice('Board image downloaded at 1920 × 1080 resolution.');
    },'image/png');
  };
  const selected=studio.lesson.selections.find(s=>s.id===selectionId)??studio.lesson.selections.at(-1);
  // Every section generates its completed boards in memory first. No stroke
  // actions, media chunks or lesson pages are saved until teacher approval.
  const draft=useMemo(()=>{
    const text=selected?.displayText??selected?.text;
    if(!text)return {plan:null,error:null};
    try{return {plan:planChalkSection(text,chalkColumns,studio.speed,studio.lesson.title),error:null};}
    catch(error){return {plan:null,error:error instanceof Error?error.message:String(error)};}
  },[selected?.id,selected?.text,selected?.displayText,chalkColumns,studio.speed,studio.lesson.title]);

  const currentIndex=Math.max(0,studio.liveBoard.pages.findIndex(p=>p.id===studio.currentPageId));
  const run=(p:Promise<unknown>)=>{void p.then(()=>setNotice('Saved locally.')).catch(e=>setNotice(e instanceof Error?e.message:String(e)));};
  return <div className="board-controls" aria-label="Teacher board controls">
    <fieldset className="chalk-section-fieldset"><legend>Prepare your chalkboard storyboards</legend>
      <p className="board-note"><strong>Step 1:</strong> Import your lesson PDF, choose <strong>Drag over a complete PDF section</strong>, and highlight the passage you want to teach.</p>
      <p className="board-note"><strong>Step 2:</strong> Review the exact PDF selection and its original crop, then inspect the completed board drafts below. Changing columns updates the previews without saving anything.</p>
      <label>Chalkboard columns
        <select aria-label="Chalkboard columns" value={chalkColumns}
          onChange={e=>setChalkColumns(Number(e.target.value) as 1|2|3)}>
          <option value={1}>1 — large teaching notes</option>
          <option value={2}>2 — class explanations</option>
          <option value={3}>3 — marking guide and revision</option>
        </select>
      </label>
      {!selected?.text&&<p className="board-note">Select a text-bearing PDF area to preview the draft boards.</p>}
      {draft.error&&<p role="alert" className="pdf-inline-error">{draft.error}</p>}
      {draft.plan&&<ChalkDraftGallery plan={draft.plan} title={studio.lesson.title}/>}
      <button type="button" className="btn" data-variant="primary"
        disabled={!draft.plan||studio.working||recording.phase!=='idle'}
        onClick={()=>{if(selected&&draft.plan)run(studio.writePdfChalkSection(selected,chalkColumns).then(()=>{
          navigate({search:'?panel=board'},{replace:true});
        }));}}>
        Approve draft boards &amp; prepare recording
      </button>
      <p className="board-note"><strong>Step 3:</strong> After approval, start recording on the teaching board. Press Play writing when you want chalk notes to appear, and Pause writing whenever you want to explain.</p>
      {studio.lesson.chalkTake&&<p role="status" className="chalk-approved">Approved recording script: {studio.lesson.chalkTake.pageIds.length} board(s), {studio.lesson.chalkTake.columns} columns. Ready to cue again.</p>}
    </fieldset>
    <fieldset><legend>Lesson details</legend>
      <label>Lesson title <input aria-label="Edit lesson title" maxLength={200}
        value={titleDraft} onChange={e=>setTitleDraft(e.target.value)}/></label>
      <div className="board-control-row">
        <button className="btn" type="button"
          disabled={!titleDraft.trim()||titleDraft.trim()===studio.lesson.title||studio.working}
          onClick={()=>run(studio.updateLesson(l=>({...l,title:titleDraft.trim()})))}>Save title</button>
        <button className="btn" type="button" onClick={savePng}>Download current board PNG</button>
      </div>
      <p className="board-note">Download captures only the current teaching board frame, not the PDF or controls.</p>
    </fieldset>
    <fieldset><legend>Board pages</legend>
      <div className="board-control-row">
        <button className="btn" type="button" disabled={currentIndex===0} onClick={()=>run(studio.showPage(studio.liveBoard.pages[currentIndex-1]!.id))}>Previous</button>
        <span>Page {studio.liveBoard.pages.length?currentIndex+1:0} / {studio.liveBoard.pages.length}</span>
        <button className="btn" type="button" disabled={currentIndex>=studio.liveBoard.pages.length-1} onClick={()=>run(studio.showPage(studio.liveBoard.pages[currentIndex+1]!.id))}>Next</button>
        <button className="btn" type="button" onClick={()=>run(studio.newPage())}>+ New page</button>
      </div>
    </fieldset>
    <fieldset><legend>Manual tools</legend>
      <div className="board-control-row">
        <button className="btn" type="button" aria-pressed={studio.tool==='pen'} onClick={()=>studio.setTool('pen')}>Pen</button>
        <button className="btn" type="button" aria-pressed={studio.tool==='eraser'} onClick={()=>studio.setTool('eraser')}>Eraser</button>
        <button className="btn" type="button" disabled={!studio.history.canUndo} onClick={()=>run(studio.undo())}>Undo</button>
        <button className="btn" type="button" disabled={!studio.history.canRedo} onClick={()=>run(studio.redo())}>Redo</button>
      </div>
      <label>Pen colour <input aria-label="Pen colour" type="color" value={studio.colour} onChange={e=>studio.setColour(e.target.value)}/></label>
      <label>Pen width <input aria-label="Pen width" type="range" min="2" max="18" step="1" value={studio.width} onChange={e=>studio.setWidth(Number(e.target.value))}/><span>{studio.width.toFixed(1)}</span></label>
      <label>Appearance <select aria-label="Stroke appearance" value={studio.style} onChange={e=>studio.setStyle(e.target.value as 'ink'|'chalk')}><option value="chalk">Chalk</option><option value="ink">Ink</option></select></label>
      <label>Board colour <select aria-label="Board colour" value={studio.liveBoard.theme} onChange={e=>run(studio.changeTheme(e.target.value as 'green'|'black'|'white'))}><option value="green">Green</option><option value="black">Black</option><option value="white">White</option></select></label>
      <button className="btn" type="button" onClick={()=>{if(window.confirm('Clear everything on this page? You can undo this action.'))run(studio.clear());}}>Clear current page</button>
    </fieldset>
    <fieldset><legend>Write your own text</legend>
      <label htmlFor="teacher-board-text">Type a heading, explanation or question to animate as handwriting. No PDF needed.</label>
      <textarea id="teacher-board-text" aria-label="Text to handwrite" rows={3} maxLength={300}
        value={typedText} onChange={e=>setTypedText(e.target.value)}
        placeholder="Today we are learning about fractions" />
      <div className="board-control-row">
        <button className="btn" type="button" disabled={!typedText.trim()||studio.working}
          onClick={()=>run(studio.placeTypedText(typedText).then(()=>setTypedText('')))}>Write my text on board</button>
        <span className="board-note">{typedText.length}/300</span>
      </div>
      <p className="board-note">Your typed notes are saved as teacher-authored content, separately from original PDF selections. Unsupported handwriting symbols are reported, not silently changed.</p>
    </fieldset>
    <fieldset><legend>Send PDF selection to board</legend>
      <label>Selected source
        <select aria-label="Choose source selection" value={selected?.id??''} onChange={e=>onSelectionChange(e.target.value)}>
          {!selected&&<option value="">Upload and select PDF text first</option>}
          {studio.lesson.selections.map(s=><option key={s.id} value={s.id}>Page {s.page}: {(s.displayText??s.text??'Original PDF image crop').slice(0,55)}</option>)}
        </select>
      </label>
      <div className="board-control-row">
        <button className="btn" type="button" disabled={!selected?.text} onClick={()=>{if(selected)run(studio.placeSelection(selected,'handwriting'));}}>Write text by hand</button>
        <button className="btn" type="button" disabled={!selected?.text || !isSupportedMath(selected.displayText??selected.text??'')} onClick={()=>{if(selected)run(studio.placeSelection(selected,'math'));}}>Typeset exact maths</button>
        <button className="btn" type="button" disabled={!selected?.cropAssetId} onClick={()=>{if(selected)run(studio.placeSelection(selected,'crop'));}}>Place original crop</button>
      </div>
      <p className="board-note">Mathematics uses a deliberately restricted syntax (e.g. \frac{1}{2}, x^{2}, \sqrt{9}); unsupported symbols and ambiguous source extraction must use the original PDF crop. No automatic mathematical corrections.</p>
      <label>Handwriting speed <input aria-label="Handwriting speed" type="range" min="0.25" max="4" step="0.25" value={studio.speed} onChange={e=>studio.setSpeed(Number(e.target.value))}/><span>{studio.speed}×</span></label>
    </fieldset>
    <fieldset><legend>Handwriting playback</legend>
      <div className="board-control-row">
        <button type="button" className="btn" onClick={()=>studio.startPlayback(0,lastActionEnd(studio.lesson.actions))}>Replay lesson</button>
        <button type="button" className="btn" disabled={!studio.isPlaying} onClick={studio.pause}>Pause</button>
        <button type="button" className="btn" disabled={studio.isPlaying} onClick={studio.resume}>Resume</button>
        <button type="button" className="btn" onClick={studio.showAll}>Show completed</button>
      </div>
    </fieldset>
    {studio.page&&studio.page.content.length>0&&<fieldset><legend>Placed content</legend><ul className="board-content-list">
      {studio.page.content.map((c,i)=><li key={c.id}>
        <span>{i+1}. {c.mode} at ({Math.round(c.target.x)}, {Math.round(c.target.y)})</span>
        <div className="board-control-row">
          <button type="button" className="btn" aria-label={`Move content ${i+1} left`} onClick={()=>run(studio.move(c.id,Math.max(0,c.target.x-40),c.target.y))}>←</button>
          <button type="button" className="btn" aria-label={`Move content ${i+1} right`} onClick={()=>run(studio.move(c.id,Math.min(1800,c.target.x+40),c.target.y))}>→</button>
          <button type="button" className="btn" aria-label={`Move content ${i+1} up`} onClick={()=>run(studio.move(c.id,c.target.x,Math.max(0,c.target.y-40)))}>↑</button>
          <button type="button" className="btn" aria-label={`Move content ${i+1} down`} onClick={()=>run(studio.move(c.id,c.target.x,Math.min(1000,c.target.y+40)))}>↓</button>
          <button type="button" className="btn" aria-label={`Remove content ${i+1}`} onClick={()=>run(studio.remove(c.id))}>Remove</button>
        </div>
      </li>)}
    </ul></fieldset>}
    <RecordingControls recording={recording}/>
    {studio.error&&<p role="alert" className="pdf-inline-error">{studio.error}</p>}
    {notice&&<p role="status">{notice}</p>}
    <p className="board-note">Keyboard on board: Ctrl+Z undo, Ctrl+Shift+Z redo, N new page, Space playback. Lessons and drawing actions save to this browser.</p>
  </div>;
}
