import { rectFromCorners } from './geometry';
import type { Rect } from './geometry';

/** Thin portable shape of PDF.js TextItem (separates our geometry tests from PDF.js). */
export interface PdfTextItem {
  str: string;
  transform: [number,number,number,number,number,number];
  width: number;
  height: number;
  dir?: string;
  hasEOL?: boolean;
}
export interface LineSelection {
  text: string;
  bbox: Rect;
  /** Original text items, in source order; never silently normalise scientific notation. */
  chunks: string[];
  suspicious: boolean;
  warnings: string[];
}

/** Geometry based on PDF user coordinates, no OCR and no invented characters. */
export function itemBounds(item: PdfTextItem): Rect {
  const [a,b,c,d,x,y] = item.transform;
  // Text baseline is at y; PDF.js height is the line's vertical metric.
  const height = Math.max(0.5,Math.abs(item.height) || Math.hypot(c,d));
  const width = Math.max(0.5,Math.abs(item.width) || Math.hypot(a,b)*Math.max(1,item.str.length)*0.25);
  // Baseline handles most upright PDF text. Rotated text is flagged by the audit.
  if (Math.abs(b)>0.05 || Math.abs(c)>0.05) return rectFromCorners(x,y-height,x+width,y);
  return {x,y:y-height,width,height};
}

export function textWarnings(text: string, chunks: PdfTextItem[]): string[] {
  const warnings: string[]=[];
  if (/\uFFFD|\u0000|\u25A1|\u25AF/.test(text)) warnings.push('PDF text contains missing or replacement glyphs: use the source image crop.');
  if (chunks.some(c=>Math.abs(c.transform[1])>0.05||Math.abs(c.transform[2])>0.05)) warnings.push('Rotated or skewed glyphs require visual inspection.');
  if (/[=+÷×√∫∑^_≤≥²³½¼¾]|\b(?:sin|cos|tan)\b/i.test(text)) warnings.push('Mathematical notation may not survive font extraction; verify against the source crop.');
  if (chunks.some(c=>c.dir==='rtl')) warnings.push('Right-to-left text ordering needs visual verification.');
  return warnings;
}

/**
 * Reconstruct one visual line using actual PDF text items, with conservative spacing.
 * Gap insertion is explicitly visible in the selection preview, where teachers can correct it.
 */
export function groupTextLines(items: PdfTextItem[]): LineSelection[] {
  const sorted=items.filter(i=>typeof i.str==='string' && i.str.length>0).map(i=>({item:i,box:itemBounds(i)}));
  // PDF page coordinate y grows upwards.
  sorted.sort((a,b)=>{
    const dy=(b.box.y+b.box.height)-(a.box.y+a.box.height);
    return Math.abs(dy)>Math.max(a.box.height,b.box.height)*0.55?dy:a.box.x-b.box.x;
  });
  const groups:typeof sorted[]=[];
  for(const part of sorted){
    const last=groups[groups.length-1];
    const currentBaseline=part.box.y+part.box.height;
    const previous=last?.[0];
    if(!previous || Math.abs(currentBaseline-(previous.box.y+previous.box.height))>Math.max(part.box.height,previous.box.height)*0.55 || last?.at(-1)?.item.hasEOL) groups.push([part]);
    else last!.push(part);
  }
  return groups.map(group=>{
    group.sort((a,b)=>a.box.x-b.box.x);
    const chunks=group.map(g=>g.item.str);
    let combined='';let prior:typeof group[number]|undefined;
    for(const part of group){
      if(prior && !combined.endsWith(' ') && !part.item.str.startsWith(' ')) {
        const gap=part.box.x-(prior.box.x+prior.box.width);
        if(gap>Math.max(1.1,Math.min(prior.box.height,part.box.height)*0.28))combined+=' ';
      }
      combined+=part.item.str;
      prior=part;
    }
    const x=Math.min(...group.map(g=>g.box.x));const y=Math.min(...group.map(g=>g.box.y));
    const right=Math.max(...group.map(g=>g.box.x+g.box.width));const top=Math.max(...group.map(g=>g.box.y+g.box.height));
    const warning=textWarnings(combined,group.map(g=>g.item));
    return {text:combined,bbox:rectFromCorners(x,y,right,top),chunks,suspicious:warning.length>0,warnings:warning};
  });
}

export function classifyPdfPage(itemCount:number, text:string):'text'|'mixed'|'image-only' {
  if(itemCount===0 || text.trim().length===0)return 'image-only';
  if(text.trim().length<12)return 'mixed';
  return 'text';
}
