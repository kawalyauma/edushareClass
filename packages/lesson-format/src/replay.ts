import type { BoardAction, Lesson, Rect, Stroke } from '@edushare/shared-types';

export interface PlacedContent {
  id: string;
  selectionId: string;
  target: Rect;
  mode: 'handwriting' | 'crop' | 'math';
  strokes: Stroke[];
  strokeTimes: number[];
}
export interface InkStroke {id:string;stroke:Stroke;startMs:number;}
export interface BoardPageState {id:string;content:PlacedContent[];ink:InkStroke[];}
export type BoardTheme='green'|'black'|'white';
export interface BoardState {pages:BoardPageState[];currentPageId:string|null;speed:number;theme:BoardTheme;}
export const initialBoardState=():BoardState=>({pages:[],currentPageId:null,speed:1,theme:'green'});

function mapPage(state:BoardState,pageId:string,fn:(page:BoardPageState)=>BoardPageState):BoardState {
  return {...state,pages:state.pages.map(p=>p.id===pageId?fn(p):p)};
}
/**
 * Pure action reducer. No DOM, Date, Math.random or media access.
 * Unchanged legacy actions are still supported; new Phase 4 actions extend the log.
 */
export function applyAction(state:BoardState,a:BoardAction):BoardState {
  switch(a.type){
    case 'page.add':
      if(state.pages.some(p=>p.id===a.pageId))return state;
      return {...state,pages:[...state.pages,{id:a.pageId,content:[],ink:[]}],currentPageId:state.currentPageId??a.pageId};
    case 'page.show':
      return state.pages.some(p=>p.id===a.pageId)?{...state,currentPageId:a.pageId}:state;
    case 'content.place':
      return mapPage(state,a.pageId,p=>({...p,content:[...p.content,{id:a.id,selectionId:a.selectionId,target:a.target,mode:a.mode,strokes:[],strokeTimes:[]}]}));
    case 'stroke.write':
      return mapPage(state,a.pageId,p=>({...p,content:p.content.map(c=>c.id===a.contentId?
        {...c,strokes:[...c.strokes,a.stroke],strokeTimes:[...c.strokeTimes,a.t]}:c)}));
    case 'content.move':
      return mapPage(state,a.pageId,p=>({...p,content:p.content.map(c=>c.id===a.contentId?{...c,target:a.target}:c)}));
    case 'content.remove':
      return mapPage(state,a.pageId,p=>({...p,content:p.content.filter(c=>c.id!==a.contentId)}));
    case 'ink.draw':
      return mapPage(state,a.pageId,p=>({...p,ink:[...p.ink,{id:a.id,stroke:a.stroke,startMs:a.t}]}));
    case 'ink.erase':
      return mapPage(state,a.pageId,p=>({...p,ink:p.ink.filter(ink=>!a.strokeIds.includes(ink.id))}));
    case 'board.clear':
      return mapPage(state,a.pageId,p=>({...p,content:[],ink:[]}));
    case 'pace.set': return {...state,speed:a.speed};
    case 'board.theme.set': return {...state,theme:a.theme};
    case 'history.undo':case 'history.redo':return state;
  }
}
/** Undo/redo are themselves timestamped actions; seeking reconstructs the correct historical result. */
export function replay(lesson:Pick<Lesson,'actions'>,untilMs=Infinity):BoardState {
  const eligible=lesson.actions.filter(a=>a.t<=untilMs);
  const undone=new Set<string>();
  for(const a of eligible){
    if(a.type==='history.undo')undone.add(a.targetActionId);
    if(a.type==='history.redo')undone.delete(a.targetActionId);
  }
  let state=initialBoardState();
  for(const a of eligible){if(!undone.has(a.id))state=applyAction(state,a);}
  return state;
}
/** Identify the most recent undoable user operation, omitting automated stroke actions. */
export const UNDOABLE=new Set<BoardAction['type']>(['ink.draw','ink.erase','content.place','content.move','content.remove','board.clear','board.theme.set']);
export function historyStatus(actions:BoardAction[]):{canUndo:string|null;canRedo:string|null}{
  const undone=new Map<string,number>();
  let lastEditIndex=-1;
  actions.forEach((a,i)=>{
    if(UNDOABLE.has(a.type))lastEditIndex=i;
    if(a.type==='history.undo')undone.set(a.targetActionId,i);
    else if(a.type==='history.redo')undone.delete(a.targetActionId);
  });
  const edits=actions.filter(a=>UNDOABLE.has(a.type));
  return {canUndo:edits.slice().reverse().find(a=>!undone.has(a.id))?.id??null,
    // A new edit invalidates redo of an older abandoned branch, without deleting the log.
    canRedo:edits.slice().reverse().find(a=>(undone.get(a.id)??-1)>lastEditIndex)?.id??null};
}
