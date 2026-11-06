import {useState} from 'react';
import type {BoardStudio} from './useBoardStudio';
import {lastActionEnd} from './useBoardStudio';
import {isSupportedMath} from '@edushare/math-notation';
export function BoardControls({studio}: {studio:BoardStudio}){
  const [selectionId,setSelectionId]=useState('');
  const [notice,setNotice]=useState<string|null>(null);
  const selected=studio.lesson.selections.find(s=>s.id===selectionId)??studio.lesson.selections.at(-1);
  const currentIndex=Math.max(0,studio.liveBoard.pages.findIndex(p=>p.id===studio.currentPageId));
  const run=(p:Promise<unknown>)=>{void p.then(()=>setNotice('Saved locally.')).catch(e=>setNotice(e instanceof Error?e.message:String(e)));};
  return <div className="board-controls" aria-label="Teacher board controls">
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
    <fieldset><legend>Send PDF selection to board</legend>
      <label>Selected source
        <select aria-label="Choose source selection" value={selected?.id??''} onChange={e=>setSelectionId(e.target.value)}>
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
    {studio.error&&<p role="alert" className="pdf-inline-error">{studio.error}</p>}
    {notice&&<p role="status">{notice}</p>}
    <p className="board-note">Keyboard on board: Ctrl+Z undo, Ctrl+Shift+Z redo, N new page, Space playback. Lessons and drawing actions save to this browser.</p>
  </div>;
}
