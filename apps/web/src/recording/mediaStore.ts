import {DB_NAME,DB_VERSION,MEDIA_CHUNKS,LESSONS,SOURCE_ASSETS,CROP_ASSETS} from '../storage/projectStorage';

export interface SavedMediaChunk {
  id:string;
  lessonId:string;
  segmentId:string;
  seq:number;
  elapsedMs:number;
  mimeType:string;
  data:Blob;
}
const key=(lessonId:string,segmentId:string,seq:number)=>
  `${lessonId}::${segmentId}::${String(seq).padStart(9,'0')}`;
/** One write per MediaRecorder timeslice. No uploads, streaming server, or credentials. */
export class LocalMediaChunks {
  private dbPromise:Promise<IDBDatabase>|null=null;
  constructor(private readonly factory:IDBFactory|null=globalThis.indexedDB??null){}
  private async db():Promise<IDBDatabase>{
    if(!this.factory)throw new Error('IndexedDB unavailable: recording chunks cannot be saved safely.');
    this.dbPromise??=new Promise<IDBDatabase>((resolve,reject)=>{
      const req=this.factory!.open(DB_NAME,DB_VERSION);
      req.onupgradeneeded=()=>{
        const db=req.result;
        for(const name of [LESSONS,MEDIA_CHUNKS,SOURCE_ASSETS,CROP_ASSETS])
          if(!db.objectStoreNames.contains(name))db.createObjectStore(name,name===LESSONS?{keyPath:'id'}:undefined);
      };
      req.onsuccess=()=>{req.result.onversionchange=()=>{req.result.close();this.dbPromise=null;};resolve(req.result);};
      req.onerror=()=>reject(req.error??new Error('Unable to open recording storage'));
      req.onblocked=()=>reject(new Error('Close other tabs before opening recording storage.'));
    });
    this.dbPromise.catch(()=>{this.dbPromise=null;});return this.dbPromise;
  }
  private async transaction<T>(mode:IDBTransactionMode,run:(s:IDBObjectStore)=>IDBRequest<T>):Promise<T>{
    const db=await this.db();const tx=db.transaction(MEDIA_CHUNKS,mode);const req=run(tx.objectStore(MEDIA_CHUNKS));
    return new Promise<T>((resolve,reject)=>{
      let value:T;
      req.onsuccess=()=>{value=req.result;};
      req.onerror=()=>reject(req.error??new Error('Media chunk request failed'));
      tx.onerror=()=>reject(tx.error??new Error('Media chunk transaction failed'));
      tx.onabort=()=>reject(tx.error??new Error('Media chunk transaction aborted'));
      tx.oncomplete=()=>resolve(value);
    });
  }
  async save(chunk:SavedMediaChunk):Promise<void>{
    if(!chunk.data.size)throw new Error('Refusing empty recording chunk');
    await this.transaction('readwrite',s=>s.put(chunk,chunk.id));
  }
  async readSegment(lessonId:string,segmentId:string):Promise<SavedMediaChunk[]>{
    const prefix=`${lessonId}::${segmentId}::`;
    const range=IDBKeyRange.bound(prefix,prefix+'\uffff');
    const chunks=await this.transaction<SavedMediaChunk[]>('readonly',s=>s.getAll(range));
    return chunks.sort((a,b)=>a.seq-b.seq);
  }
  static idFor=key;
  async toBlob(lessonId:string,segmentId:string):Promise<Blob|null>{
    const chunks=await this.readSegment(lessonId,segmentId);
    if(!chunks.length)return null;
    const mime=chunks[0]!.mimeType;
    if(chunks.some(c=>c.mimeType!==mime))throw new Error('Segment has incompatible media formats');
    return new Blob(chunks.map(c=>c.data),{type:mime});
  }
}
