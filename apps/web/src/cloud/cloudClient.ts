/** Explicit opt-in cloud API. Tokens are kept in volatile memory only. */
export interface RemoteLesson {id:string;title:string;payload:Record<string,unknown>;version:number;published:boolean}
export interface RemoteFile {id:string;kind:'pdf'|'media';mime_type:string;sha256:string;size_bytes:number}
export function checkedBaseURL(input:string):string{
  let url:URL;
  try{url=new URL(input.trim());}catch{throw new Error('Enter a valid private cloud API address.');}
  if(url.username||url.password||url.search||url.hash)throw new Error('Cloud address must not include credentials or URL parameters.');
  if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)))
    throw new Error('Use HTTPS; insecure HTTP is allowed only for localhost development.');
  return url.href.replace(/\/$/,'');
}
export class CloudRequestError extends Error{
  constructor(public readonly status:number,message:string){super(message);this.name='CloudRequestError';}
}
export async function requestCloud<T>(base:string,path:string,token:string|null,method='GET',body?:BodyInit,headers:Record<string,string>={}):Promise<T>{
 const url=checkedBaseURL(base)+`/api/v1${path}`;
 const res=await fetch(url,{method,body,headers:{...headers,...(token?{Authorization:`Bearer ${token}`}:{})},cache:'no-store',credentials:'omit'});
 if(!res.ok){let message=`Cloud request failed (${res.status})`;
   try{const parsed=await res.json() as {detail?:unknown};if(typeof parsed.detail==='string')message=parsed.detail;
     else if(parsed.detail&&typeof parsed.detail==='object'&&'message' in parsed.detail)message=String(parsed.detail.message);
   }catch{/* preserve status */}
   throw new CloudRequestError(res.status,message);
 }
 return (res.status===204?undefined:await res.json()) as T;
}
