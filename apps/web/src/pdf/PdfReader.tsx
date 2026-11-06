import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import type {Lesson,PdfSource,SourceSelection} from '@edushare/shared-types';
import {ErrorBanner} from '../ui';
import type {PDFDocumentProxy} from './pdfjs';
import {openPdf} from './pdfjs';
import {PdfPage} from './PdfPage';
import {LocalPdfAssets,checkedPdfBytes,sha256} from './sourceAssets';

interface Props {lesson:Lesson;saveLesson:(next:Lesson)=>Promise<void>;onSelectionCreated?:(selection:SourceSelection)=>void}
const MODE_LABEL={text:'Select a PDF text line',section:'Drag over a complete PDF section',crop:'Select an image or scanned diagram'} as const;

function SelectionPreview({selection,assets,onCorrect}: {selection:SourceSelection|undefined;assets:LocalPdfAssets;onCorrect:(text:string)=>Promise<void>}){
  const [url,setUrl]=useState<string|null>(null);
  const [draft,setDraft]=useState('');
  const [error,setError]=useState<string|null>(null);
  const [saved,setSaved]=useState(false);
  useEffect(()=>{
    setDraft(selection?.displayText??selection?.text??'');setSaved(false);setError(null);
    let revoke:string|null=null;let cancelled=false;setUrl(null);
    if(selection?.cropAssetId)void assets.readCrop(selection.cropAssetId).then(blob=>{
      if(blob&&!cancelled){revoke=URL.createObjectURL(blob);setUrl(revoke);}
    }).catch(e=>{if(!cancelled)setError(e instanceof Error?e.message:String(e));});
    return()=>{cancelled=true;if(revoke)URL.revokeObjectURL(revoke);};
  },[selection?.id,selection?.displayText,selection?.text,selection?.cropAssetId,assets]);
  if(!selection)return <p>No selection yet. Select a line in the PDF, or switch to crop mode.</p>;
  const extracted=selection.text;
  return <div className="pdf-selection-preview">
    <p><strong>Selected:</strong> {selection.kind} · page {selection.page} · {selection.bbox.width.toFixed(1)}×{selection.bbox.height.toFixed(1)} PDF pt</p>
    {url?<img className="pdf-preview-image" alt="Original PDF crop for fidelity comparison" src={url}/>:<p>Loading original crop…</p>}
    {selection.kind==='formula'&&<p className="pdf-flag">Formula or uncertain glyphs: compare the image crop with the extracted text before using it on the board.</p>}
    {extracted!==undefined && <>
      <label htmlFor="pdf-original-text">Extracted PDF line (check geometry-based spaces)</label>
      <textarea id="pdf-original-text" readOnly value={extracted} rows={3}/>
      <button type="button" className="btn" onClick={()=>{void navigator.clipboard.writeText(extracted).catch(e=>setError(String(e)));}}>Copy exact extracted text</button>
      <label htmlFor="pdf-correction">Optional teacher correction (original is preserved)</label>
      <textarea id="pdf-correction" value={draft} rows={3} onChange={e=>{setDraft(e.target.value);setSaved(false);}}/>
      <button type="button" className="btn" onClick={()=>{void onCorrect(draft).then(()=>setSaved(true)).catch(e=>setError(String(e)));}}>Save teacher correction</button>
      {saved&&<p role="status">Correction saved separately from the original PDF text.</p>}
    </>}
    {extracted===undefined&&<p>This is an exact image crop. No OCR or inferred text has been added.</p>}
    {error&&<div role="alert" className="pdf-inline-error">{error}</div>}
  </div>;
}

export function PdfReader({lesson,saveLesson,onSelectionCreated}:Props){
  const assets=useMemo(()=>new LocalPdfAssets(),[]);
  const lessonRef=useRef(lesson);lessonRef.current=lesson;
  const [sourceId,setSourceId]=useState(lesson.sources.at(-1)?.id??'');
  const [doc,setDoc]=useState<PDFDocumentProxy|null>(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [password,setPassword]=useState<{update:(value:string)=>void;reason:number}|null>(null);
  const [passwordInput,setPasswordInput]=useState('');
  const [zoom,setZoom]=useState(1);
  const [rotation,setRotation]=useState(0);
  const [page,setPage]=useState(1);
  const [mode,setMode]=useState<'text'|'section'|'crop'>('text');
  const [saving,setSaving]=useState(false);
  const [lastSelectionId,setLastSelectionId]=useState<string|null>(null);
  const source=lesson.sources.find(s=>s.id===sourceId);
  const currentSelection=lesson.selections.find(s=>s.id===lastSelectionId)??lesson.selections.at(-1);
  const scrollerRef=useRef<HTMLDivElement>(null);
  const [windowStart,setWindowStart]=useState(1);
  const [baseSize,setBaseSize]=useState({width:600,height:840});
  const slotHeight=Math.ceil(Math.max(baseSize.width,baseSize.height)*zoom+52);
  useEffect(()=>{if(!sourceId&&lesson.sources.length)setSourceId(lesson.sources.at(-1)!.id);},[lesson.sources,sourceId]);
  useEffect(()=>{
    let cancelled=false;let task:{destroy:()=>Promise<void>}|null=null;
    setDoc(null);setError(null);setPassword(null);
    if(!source){setLoading(false);return;}
    setLoading(true);
    void (async()=>{
      const blob=await assets.readPdf(source.sha256);
      if(!blob)throw new Error('Original source bytes are missing. Re-upload the PDF to restore it.');
      const opened=await openPdf(new Uint8Array(await blob.arrayBuffer()),(update,reason)=>{if(!cancelled)setPassword({update,reason});});
      task=opened.task;
      if(cancelled){await opened.task.destroy();return;}
      setDoc(opened.document);
      const first=await opened.document.getPage(1);const v=first.getViewport({scale:1});
      if(!cancelled){setBaseSize({width:v.width,height:v.height});setPage(1);setWindowStart(1);}
    })().catch(e=>{if(!cancelled)setError(e instanceof Error?e.message:String(e));})
      .finally(()=>{if(!cancelled)setLoading(false);});
    return()=>{cancelled=true;if(task)void task.destroy().catch(()=>{});};
  },[sourceId,assets,source?.sha256]);

  const submitFile=async(file:File)=>{
    setError(null);setLoading(true);
    try{
      const bytes=await checkedPdfBytes(file);
      const hash=await sha256(bytes);
      const exists=lessonRef.current.sources.find(s=>s.sha256===hash);
      if(exists){setSourceId(exists.id);return;}
      const opened=await openPdf(bytes,(update,reason)=>setPassword({update,reason}));
      const count=opened.document.numPages;
      await opened.task.destroy();
      const nextSource:PdfSource={id:crypto.randomUUID(),fileName:file.name,sha256:hash,pageCount:count};
      await assets.savePdf(hash,new Blob([bytes.slice().buffer as ArrayBuffer],{type:'application/pdf'}));
      await saveLesson({...lessonRef.current,sources:[...lessonRef.current.sources,nextSource]});
      setSourceId(nextSource.id);
    }catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setLoading(false);}
  };
  const onCreate=useCallback(async(selection:SourceSelection)=>{
    setSaving(true);setError(null);
    try{
      await saveLesson({...lessonRef.current,selections:[...lessonRef.current.selections,selection]});
      setLastSelectionId(selection.id);
      onSelectionCreated?.(selection);
    }catch(e){setError(e instanceof Error?e.message:String(e));throw e;}
    finally{setSaving(false);}
  },[saveLesson,onSelectionCreated]);
  const onCorrect=async(displayText:string)=>{
    const id=currentSelection?.id;if(!id)return;
    await saveLesson({...lessonRef.current,selections:lessonRef.current.selections.map(s=>s.id===id?{...s,displayText}:s)});
  };
  const scrollToPage=(n:number)=>{
    if(!doc)return;
    const next=Math.min(doc.numPages,Math.max(1,n));
    setPage(next);setWindowStart(Math.max(1,next-2));
    if(scrollerRef.current)scrollerRef.current.scrollTop=(next-1)*slotHeight;
  };
  useEffect(()=>{if(doc&&scrollerRef.current)scrollerRef.current.scrollTop=(page-1)*slotHeight;},[zoom,rotation,doc]);
  const total=doc?.numPages??0;
  const visible=Array.from({length:Math.min(5,Math.max(0,total-windowStart+1))},(_,i)=>windowStart+i);
  return <div className="pdf-reader">
    <div className="pdf-tools">
      <label className="pdf-upload-label">PDF file <input type="file" aria-label="Upload a PDF file" accept=".pdf,application/pdf" onChange={e=>{const f=e.target.files?.[0];if(f)void submitFile(f);e.target.value='';}}/></label>
      {lesson.sources.length>1&&<label>Source <select aria-label="Choose PDF source" value={sourceId} onChange={e=>setSourceId(e.target.value)}>{lesson.sources.map(s=><option key={s.id} value={s.id}>{s.fileName}</option>)}</select></label>}
      {doc&&<>
        <div className="pdf-nav" aria-label="PDF page navigation">
          <button type="button" className="btn" onClick={()=>scrollToPage(page-1)} disabled={page===1}>Previous</button>
          <label>Page <input aria-label="Page number" type="number" min={1} max={total} value={page} onChange={e=>scrollToPage(Number(e.target.value))}/></label><span>of {total}</span>
          <button type="button" className="btn" onClick={()=>scrollToPage(page+1)} disabled={page===total}>Next</button>
        </div>
        <div className="pdf-zoom"><label>Zoom <input aria-label="PDF zoom" type="range" min="0.5" max="3" step="0.25" value={zoom} onChange={e=>setZoom(Number(e.target.value))}/></label><span>{Math.round(zoom*100)}%</span>
          <button type="button" className="btn" onClick={()=>setRotation(r=>(r+90)%360)}>Rotate 90°</button></div>
        <fieldset className="pdf-modes"><legend>Selection mode</legend>{(['text','section','crop'] as const).map(m=><label key={m}><input type="radio" name="pdf-mode" checked={mode===m} onChange={()=>setMode(m)}/>{MODE_LABEL[m]}</label>)}</fieldset>
      </>}
    </div>
    {password&&<form className="pdf-password" onSubmit={e=>{e.preventDefault();password.update(passwordInput);setPassword(null);setPasswordInput('');}}><label>{password.reason===2?'Incorrect password. Try again.':'PDF password required'} <input type="password" value={passwordInput} onChange={e=>setPasswordInput(e.target.value)}/></label><button className="btn" type="submit">Unlock PDF</button></form>}
    {error&&<ErrorBanner message={error}/>}
    {loading&&<p role="status">Loading original PDF locally…</p>}
    {!source&&!loading&&<p>Upload a PDF. Select a line to preserve its original text and a matching image crop, or drag over a diagram in image mode.</p>}
    {doc&&source&&<p className="pdf-footnote">Source: {source.fileName} · SHA-256: {source.sha256.slice(0,12)}…</p>}
    {doc&&source&&<div className="pdf-scroll-window" role="region" aria-label="PDF pages" ref={scrollerRef}
      onScroll={e=>{
        const current=Math.min(total,Math.max(1,Math.floor(e.currentTarget.scrollTop/slotHeight)+1));
        if(current!==page)setPage(current);
        const start=Math.max(1,current-2);
        if(start!==windowStart)setWindowStart(start);
      }}><div style={{height:total*slotHeight,position:'relative'}}>
        {visible.map(n=><div key={`${source.id}-${n}`} className="pdf-page-slot" style={{position:'absolute',top:(n-1)*slotHeight,left:0,width:'max-content',minWidth:'100%',height:slotHeight}}><PdfPage key={`${source.id}-${n}`} doc={doc} source={source} pageNumber={n} zoom={zoom} rotation={rotation} mode={mode} assets={assets} onCreate={onCreate}/></div>)}
      </div></div>}
    {doc&&<p className="pdf-footnote">Drag in section mode to capture several consecutive lines for a chalkboard layout. Only five pages are rendered near your current scroll position. Original PDF files and crops stay in this browser.</p>}
    <section className="pdf-selection-section" aria-label="Selection preview"><h3>Selection preview {saving?'· saving…':''}</h3><SelectionPreview selection={currentSelection} assets={assets} onCorrect={onCorrect}/></section>
  </div>;
}
