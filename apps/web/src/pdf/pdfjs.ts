/** Load the heavyweight PDF engine only when a teacher opens a PDF. No server upload. */
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { PDFDocumentProxy } from 'pdfjs-dist';
export type { PDFDocumentProxy };
let engine:Promise<typeof import('pdfjs-dist')>|null=null;
export function pdfEngine(){
  engine??=import('pdfjs-dist').then(pdfjs=>{
    pdfjs.GlobalWorkerOptions.workerSrc=workerUrl;
    return pdfjs;
  });
  return engine;
}
export async function openPdf(bytes:Uint8Array,onPassword?:(update:(password:string)=>void,reason:number)=>void){
  const pdfjs=await pdfEngine();
  // Do not evaluate JavaScript embedded in PDFs or fetch external attachments.
  const task=pdfjs.getDocument({data:bytes.slice(),isEvalSupported:false,useSystemFonts:true,stopAtErrors:true});
  if(onPassword)task.onPassword=onPassword;
  return {task,document:await task.promise};
}
