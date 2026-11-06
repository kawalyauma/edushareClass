import { CROP_ASSETS, DB_NAME, DB_VERSION, LESSONS, MEDIA_CHUNKS, SOURCE_ASSETS } from '../storage/projectStorage';

/** Raw PDF bytes and PNG crops remain on-device. No source content is sent to a server. */
export class LocalPdfAssets {
  private dbPromise:Promise<IDBDatabase>|null=null;
  constructor(private readonly factory:IDBFactory|null = globalThis.indexedDB??null) {}
  private async open():Promise<IDBDatabase>{
    if(!this.factory)throw new Error('IndexedDB is unavailable. PDF files cannot be persisted.');
    this.dbPromise??=new Promise<IDBDatabase>((resolve,reject)=>{
      const req=this.factory!.open(DB_NAME,DB_VERSION);
      req.onupgradeneeded=()=>{
        const db=req.result;
        for(const name of [LESSONS,MEDIA_CHUNKS,SOURCE_ASSETS,CROP_ASSETS]){
          if(!db.objectStoreNames.contains(name))db.createObjectStore(name,name===LESSONS?{keyPath:'id'}:undefined);
        }
      };
      req.onsuccess=()=>{req.result.onversionchange=()=>{req.result.close();this.dbPromise=null;};resolve(req.result);};
      req.onerror=()=>reject(req.error??new Error('Unable to open local PDF store'));
      req.onblocked=()=>reject(new Error('Close other studio tabs to upgrade local PDF storage.'));
    });
    this.dbPromise.catch(()=>{this.dbPromise=null;});
    return this.dbPromise;
  }
  private async transact<T>(store:string,mode:IDBTransactionMode,action:(s:IDBObjectStore)=>IDBRequest<T>):Promise<T>{
    const db=await this.open();const tx=db.transaction(store,mode);const req=action(tx.objectStore(store));
    return new Promise<T>((resolve,reject)=>{
      let value:T;
      req.onsuccess=()=>{value=req.result;};
      req.onerror=()=>reject(req.error??new Error('PDF storage request failed'));
      tx.onerror=()=>reject(tx.error??new Error('PDF storage transaction failed'));
      tx.onabort=()=>reject(tx.error??new Error('PDF storage transaction aborted'));
      tx.oncomplete=()=>resolve(value);
    });
  }
  savePdf(sha256:string,bytes:Blob):Promise<IDBValidKey>{return this.transact(SOURCE_ASSETS,'readwrite',s=>s.put(bytes,sha256));}
  readPdf(sha256:string):Promise<Blob|undefined>{return this.transact(SOURCE_ASSETS,'readonly',s=>s.get(sha256));}
  saveCrop(id:string,blob:Blob):Promise<IDBValidKey>{return this.transact(CROP_ASSETS,'readwrite',s=>s.put(blob,id));}
  readCrop(id:string):Promise<Blob|undefined>{return this.transact(CROP_ASSETS,'readonly',s=>s.get(id));}
}

/** Reject suspicious file types, incomplete signatures and dangerously large uploads. */
export async function checkedPdfBytes(file:File):Promise<Uint8Array>{
  const LIMIT=50*1024*1024;
  if(!file.size || file.size>LIMIT)throw new Error('Choose a PDF smaller than 50 MB.');
  const head=new Uint8Array(await file.slice(0,5).arrayBuffer());
  if(String.fromCharCode(...head)!=='%PDF-')throw new Error('This file does not have a valid PDF signature.');
  return new Uint8Array(await file.arrayBuffer());
}
export async function sha256(bytes:Uint8Array):Promise<string>{
  if(!globalThis.crypto?.subtle)throw new Error('SHA-256 requires a secure browser origin (HTTPS or localhost).');
  const hash=await globalThis.crypto.subtle.digest('SHA-256',bytes.slice().buffer);
  return Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
}
