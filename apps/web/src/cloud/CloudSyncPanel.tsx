import {useCallback,useEffect,useState} from 'react';
import type {BoardStudio} from '../board/useBoardStudio';
import {checkedBaseURL,requestCloud,CloudRequestError} from './cloudClient';
import type {RemoteFile,RemoteLesson} from './cloudClient';

/** Cloud sync is never on by default. Source media remains local unless a teacher uploads a chosen file. */
export function CloudSyncPanel({studio}:{studio:BoardStudio}){
 const [enabled,setEnabled]=useState(false);
 const [base,setBase]=useState('http://localhost:8000');
 const [email,setEmail]=useState(''),[password,setPassword]=useState('');
 const [token,setToken]=useState<string|null>(null);
 const [remote,setRemote]=useState<RemoteLesson|null>(null);
 const [files,setFiles]=useState<RemoteFile[]>([]);
 const [status,setStatus]=useState('Cloud is off. This lesson stays in your browser.');
 const [working,setWorking]=useState(false);
 const [uploadFile,setUploadFile]=useState<File|null>(null);
 const [allowOverwrite,setAllowOverwrite]=useState(false);
 const signOut=()=>{setToken(null);setPassword('');setRemote(null);setFiles([]);setStatus('Cloud disconnected. Nothing is uploaded automatically.');};
 useEffect(()=>{if(!enabled)signOut();},[enabled]);
 useEffect(()=>{setRemote(null);setFiles([]);setAllowOverwrite(false);},[studio.lesson.id,base]);
 const run=useCallback(async(fn:()=>Promise<void>)=>{
    setWorking(true);try{await fn();}catch(e){setStatus(e instanceof Error?e.message:String(e));}finally{setWorking(false);}
 },[]);
 const login=()=>void run(async()=>{
   checkedBaseURL(base);
   const x=await requestCloud<{access_token:string;role:string}>(base,'/auth/login',null,'POST',JSON.stringify({email,password}),{'Content-Type':'application/json'});
   setToken(x.access_token);setPassword('');setStatus(`Signed in as ${email}. Your files have not been uploaded.`);
 });
 const refresh=()=>void run(async()=>{
   if(!token)return;
   try{
     const x=await requestCloud<RemoteLesson>(base,`/lessons/${encodeURIComponent(studio.lesson.id)}`,token);
     setRemote(x);setAllowOverwrite(false);setStatus(`Private cloud copy found at revision ${x.version}.`);
   }catch(e){if(e instanceof CloudRequestError&&e.status===404){setRemote(null);setStatus('No cloud copy exists for this lesson.');}else throw e;}
   setFiles(await requestCloud<RemoteFile[]>(base,`/lessons/${encodeURIComponent(studio.lesson.id)}/files`,token).catch(()=>[]));
 });
 const backup=()=>void run(async()=>{
   if(!token)return;
   if(remote&&!allowOverwrite){setStatus('A cloud version exists. Review it and explicitly allow replacement first.');return;}
   const version=remote?.version??0;
   const payload=studio.lesson;
   try{
     const saved=await requestCloud<{version:number}>(base,`/lessons/${encodeURIComponent(payload.id)}`,token,'PUT',
       JSON.stringify({title:payload.title,payload}),{'Content-Type':'application/json','If-Match':`"${version}"`});
     setRemote({id:payload.id,title:payload.title,payload:payload as unknown as Record<string,unknown>,version:saved.version,published:false});
     setAllowOverwrite(false);setStatus(`Lesson metadata backed up privately (revision ${saved.version}). Original PDFs and voice clips remain on this device.`);
   }catch(e){if(e instanceof CloudRequestError&&e.status===409){setStatus('Version conflict. Load the remote revision before deciding whether to overwrite; local work remains unchanged.');setAllowOverwrite(false);}else throw e;}
 });
 const upload=()=>void run(async()=>{
   if(!token||!uploadFile)return;
   if(!remote){setStatus('Back up lesson metadata before uploading a file.');return;}
   const kind=uploadFile.type==='application/pdf'?'pdf':uploadFile.type==='video/webm'||uploadFile.type==='video/mp4'?'media':null;
   if(!kind)throw new Error('Choose a PDF, WebM or MP4 only.');
   if(uploadFile.size>25*1024*1024)throw new Error('The browser upload form is limited to 25 MiB. Use the resumable upload API for larger private recordings.');
   const hash=await crypto.subtle.digest('SHA-256',await uploadFile.arrayBuffer());
   const sha=Array.from(new Uint8Array(hash)).map(n=>n.toString(16).padStart(2,'0')).join('');
   const file=await requestCloud<{id:string;sha256:string}>(base,`/lessons/${encodeURIComponent(studio.lesson.id)}/files?kind=${kind}`,token,'POST',uploadFile,
     {'Content-Type':uploadFile.type,'X-Content-SHA256':sha});
   setStatus(`Explicit private ${kind} upload saved with verified SHA-256 (${file.id.slice(0,8)}).`);
   setFiles(await requestCloud<RemoteFile[]>(base,`/lessons/${encodeURIComponent(studio.lesson.id)}/files`,token));
   setUploadFile(null);
 });
 const downloadRemote=()=>{
   if(!remote)return;
   const data=new Blob([JSON.stringify(remote.payload,null,2)],{type:'application/json'});
   const url=URL.createObjectURL(data);const a=document.createElement('a');a.href=url;a.download=`${remote.id}-cloud-metadata.json`;a.click();URL.revokeObjectURL(url);
 };
 return <section className="cloud-sync" aria-label="Optional private school cloud">
  <h2>Optional private school backup</h2>
  <label><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/> Enable cloud for this browser session</label>
  {!enabled?<p className="board-note">Off by default. No account, cloud upload or network transfer is required to record lessons.</p>:<>
    <p className="board-note">Teacher audio, scanned PDF pages and media are private. Cloud backup is always opt-in and sends only what you choose.</p>
    <label>Cloud API (HTTPS except localhost) <input type="url" value={base} disabled={Boolean(token)} onChange={e=>setBase(e.target.value)}/></label>
    {!token?<>
      <label>Email <input type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)}/></label>
      <label>Password <input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}/></label>
      <button type="button" className="btn" disabled={working||!email||!password} onClick={login}>Sign in</button>
    </>:<>
      <div className="board-control-row">
        <button className="btn" type="button" disabled={working} onClick={refresh}>Check cloud version</button>
        <button className="btn" type="button" disabled={working||Boolean(remote&&!allowOverwrite)} onClick={backup}>Back up lesson metadata</button>
        <button className="btn" type="button" onClick={signOut}>Sign out</button>
      </div>
      {remote&&<fieldset><legend>Existing private backup</legend>
        <p className="board-note">Cloud revision {remote.version}. Remote title: {remote.title}. Confirm changes before overwriting the cloud copy.</p>
        <label><input type="checkbox" checked={allowOverwrite} onChange={e=>setAllowOverwrite(e.target.checked)}/> I reviewed the remote version and agree to overwrite it with this lesson's local metadata</label>
        <button className="btn" type="button" onClick={downloadRemote}>Download cloud metadata JSON</button>
      </fieldset>}
      <fieldset><legend>Explicit file transfer (never automatic)</legend>
        <label>Choose private PDF or video <input type="file" accept=".pdf,.webm,.mp4,application/pdf,video/webm,video/mp4" onChange={e=>setUploadFile(e.target.files?.[0]??null)}/></label>
        <button className="btn" disabled={working||!uploadFile||!remote} type="button" onClick={upload}>Upload selected private file</button>
        {files.length>0&&<ul>{files.map(f=><li key={f.id}>{f.kind} · {(f.size_bytes/1024).toFixed(0)} KiB · SHA-256 {f.sha256.slice(0,12)}…</li>)}</ul>}
      </fieldset>
    </>}
  </>}
  <p role="status">{status}</p>
  <p className="board-note">Account token stays only in memory. The cloud metadata backup does not contain original PDF/media bytes; restoring a complete lesson requires its source files too. No auto-sync or cross-device source reconstruction is claimed.</p>
 </section>;
}
