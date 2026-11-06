import {glyphAdvance,planHandwriting} from '@edushare/stroke-engine';
import type {HandwritingPlan} from '@edushare/stroke-engine';

export type ChalkColumns=1|2|3;
export type ChalkRowStyle='heading'|'question'|'answer'|'body';
export interface ChalkRow {
  original:string; written:string; style:ChalkRowStyle;
  x:number;y:number;width:number;height:number;
  plan:HandwritingPlan;
}
export interface ChalkPage {columns:ChalkColumns;rows:ChalkRow[];}
export interface ChalkSectionPlan {pages:ChalkPage[];characterCount:number;}

const chalkColours={heading:'#f0d477',question:'#f0eee4',answer:'#ead074',body:'#ecede3'} as const;
const maxLength=1600;
const maxRows=90;
const X0=111,WIDTH=1700,GAP=41,TOP=207,BOTTOM=954;
function columnsSize(columns:ChalkColumns){
  return {width:(WIDTH-(columns-1)*GAP)/columns,x:(index:number)=>X0+index*((WIDTH-(columns-1)*GAP)/columns+GAP)};
}
/** The original source is preserved on the selection. Board whitespace is display-only. */
export function classifyChalkRow(text:string,index:number):ChalkRowStyle{
  if(index===0 && text.length<=65 && /^[A-Z0-9\s,:–—-]+$/.test(text))return 'heading';
  if(/^\s*(?:answers?\s*:|ans\s*:|accept any one\s*:|solution\s*:|working\s*:)/i.test(text))return 'answer';
  if(/^\d{1,3}[.)]\s/.test(text)||/\?\s*(?:\(\d+\s*marks?\))?$/i.test(text))return 'question';
  return 'body';
}
const measure=(str:string,em:number):number=>{
  let n=0;
  for(const c of str)n+=c===' '?em*.39:em*(glyphAdvance(c)*.79+.045);
  return n;
};
/** Wrap at word boundaries, not mid-word; never replace a PDF glyph. */
export function wrapChalkLine(value:string,width:number,em:number):string{
  const words=value.trim().split(/\s+/u).filter(Boolean);
  const out:string[]=[];let current='';
  for(const word of words){
    if(measure(word,em)>width)throw new Error(
      'A word is too wide for this chalkboard layout. Use fewer columns or choose a smaller PDF section.');
    const next=current?current+' '+word:word;
    if(current&&measure(next,em)>width){out.push(current);current=word;}else current=next;
  }
  if(current)out.push(current);
  return out.join('\n');
}
/**
 * Keep each question with its following answer lines when a short marking
 * guide is distributed across 2 or 3 columns. Contiguous groups preserve the
 * exact reading order and avoid marooning one answer in an almost empty column.
 */
function balanceQuestionColumns(page:ChalkPage){
  if(page.columns===1)return;
  const groups:ChalkRow[][]=[];
  let group:ChalkRow[]=[];
  for(const row of page.rows){
    if(row.style==='question' && group.some(r=>r.style==='question')){
      groups.push(group);group=[];
    }
    group.push(row);
  }
  if(group.length)groups.push(group);
  const cols=page.columns;
  if(groups.length<cols)return;
  const sizes=groups.map(g=>g.reduce((h,r)=>h+r.height+(r.style==='question'?12:6),0));
  const available=BOTTOM-TOP;
  if(sizes.some(s=>s>available))return;
  const total=sizes.reduce((a,b)=>a+b,0);
  const target=total/cols;
  let best:{cost:number;cuts:number[]}|null=null;
  const choose=(cuts:number[])=>{
    const boundaries=[0,...cuts,groups.length];
    const heights=boundaries.slice(1).map((end,i)=>
      sizes.slice(boundaries[i]!,end).reduce((sum,x)=>sum+x,0));
    if(heights.some(h=>h>available))return;
    const cost=heights.reduce((sum,h)=>sum+(h-target)**2,0);
    if(!best||cost<best.cost)best={cost,cuts};
  };
  if(cols===2){
    for(let a=1;a<groups.length;a++)choose([a]);
  }else{
    for(let a=1;a<groups.length-1;a++)
      for(let b=a+1;b<groups.length;b++)choose([a,b]);
  }
  if(!best)return;
  const boundaries=[0,...(best as {cost:number;cuts:number[]}).cuts,groups.length];
  const dims=columnsSize(cols);
  for(let col=0;col<cols;col++){
    let y=TOP;
    for(let gi=boundaries[col]!;gi<boundaries[col+1]!;gi++)
      for(const row of groups[gi]!){
        const x=dims.x(col),dx=x-row.x,dy=y-row.y;
        row.x=x;row.y=y;
        for(const stroke of row.plan.strokes)
          for(const point of stroke.points){point.x+=dx;point.y+=dy;}
        y+=row.height+(row.style==='question'?12:6);
      }
  }
}

/**
 * Plans real stroke-by-stroke chalk writing; no OCR, summarising, answer invention,
 * raster font reveal, or compression of a whole PDF page.
 * Overflow flows to the next column, then to a NEW board page.
 */
export function planChalkSection(sourceText:string,columns:ChalkColumns=2,speed=1,boardTitle=''):ChalkSectionPlan{
  if(![1,2,3].includes(columns))throw new Error('Choose one, two or three chalkboard columns.');
  const original=sourceText.replace(/\r\n/g,'\n');
  if(!original.trim())throw new Error('Select a text-bearing PDF section first.');
  if(original.length>maxLength)throw new Error(
    'This PDF section is too long for one operation. Choose up to 1600 characters at a time.');
  const lines=original.split('\n').map(s=>s.trim()).filter(Boolean);
  // The title is still displayed on the chalkboard header, so avoid repeating
  // it again in the first column when it is already the exact PDF heading.
  const normalise=(value:string)=>value.trim().replace(/\s+/g,' ').toLocaleLowerCase('en');
  if(lines.length>1&&boardTitle&&normalise(lines[0]!)===normalise(boardTitle))lines.shift();
  if(lines.length>maxRows)throw new Error('Choose fewer than 90 PDF lines at once.');
  const pages:ChalkPage[]=[];
  const dims=columnsSize(columns);
  const em=columns===1?49:columns===2?37:30;
  const lineHeight=em*1.26;
  let col=0,y=TOP,page:ChalkPage={columns,rows:[]};
  const nextColumn=()=>{
    col++;y=TOP;
    if(col>=columns){pages.push(page);page={columns,rows:[]};col=0;}
    if(pages.length>=8)throw new Error('Too many boards. Choose a smaller PDF section.');
  };
  lines.forEach((line,index)=>{
    const style=classifyChalkRow(line,index);
    const text=wrapChalkLine(line,dims.width-15,em);
    const x=dims.x(col);
    const height=text.split('\n').length*lineHeight+15;
    if(height>BOTTOM-TOP)throw new Error('A selected PDF line cannot fit. Select a shorter section.');
    if(y+height>BOTTOM)nextColumn();
    const rowY=y;
    const plan=planHandwriting({
      text,x:dims.x(col),y:rowY,maxWidth:dims.width-12,
      emSize:em,lineHeight,strokeWidth:columns===3?2.65:3.25,
      color:chalkColours[style],speed,handStyle:'classroom',
      characterSpacing:.045,penLiftMs:46,wordPauseMs:165,
    });
    if(plan.unsupported.length){
      const chars=[...new Set(plan.unsupported.map(p=>p.char))];
      throw new Error('Original PDF contains unsupported chalk characters ('+
        chars.slice(0,8).join(' ')+'). Compare the source crop or use teacher correction; no text was changed.');
    }
    page.rows.push({original:line,written:text,style,x:dims.x(col),y:rowY,width:dims.width-12,height,plan});
    y+=height+(style==='question'?12:6);
  });
  if(page.rows.length)pages.push(page);
  if(pages.length===1)balanceQuestionColumns(pages[0]!);
  return {pages,characterCount:original.length};
}
