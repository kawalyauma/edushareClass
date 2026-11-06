import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import type {BoardAction,Lesson,RecordingSegment,Rect,SourceSelection,Stroke} from '@edushare/shared-types';
import {historyStatus,replay} from '@edushare/lesson-format';
import {planHandwriting} from '@edushare/stroke-engine';
import {parseMath,layoutMath} from '@edushare/math-notation';

const newId=()=>crypto.randomUUID();
const logicalTime=(actions:BoardAction[]):number=>actions.reduce((t,a)=>Math.max(t,a.t+(a.type==='stroke.write'?a.stroke.durationMs:0)),0)+1;
export const lastActionEnd=(actions:BoardAction[]):number=>actions.reduce((max,a)=>Math.max(max,a.t+(a.type==='stroke.write'?a.stroke.durationMs:0)),0);
const defaultRect=(index:number):Rect=>({x:90,y:Math.min(875,85+index*145),width:1740,height:118});
export type BoardTool='pen'|'eraser';
const action=(l:Lesson,type:BoardAction['type'],props:Record<string,unknown>,t=logicalTime(l.actions)):BoardAction=>
    ({id:newId(),t,type,...props}) as BoardAction;
const ensurePage=(l:Lesson,makeAction:typeof action=action):{next:Lesson;pageId:string}=>{
    const state=replay(l);if(state.currentPageId)return {next:l,pageId:state.currentPageId};
    const pageId=newId();const a=makeAction(l,'page.add',{pageId});
    return {next:{...l,pages:[...l.pages,{id:pageId,index:l.pages.length}],actions:[...l.actions,a]},pageId};
  };

export function useBoardStudio(external:Lesson,saveLesson:(lesson:Lesson)=>Promise<void>){
  const [lesson,setLesson]=useState(external);
  const recordingClock=useRef<(()=>number)|null>(null);
  const setRecordingClock=useCallback((read:()=>number)=>{recordingClock.current=read;return ()=>{if(recordingClock.current===read)recordingClock.current=null;};},[]);
  const makeAction=useCallback<typeof action>((l,type,props,t)=>action(l,type,props,t??Math.max(logicalTime(l.actions),recordingClock.current?.()??0)),[]);
  const latest=useRef(external);
  const [error,setError]=useState<string|null>(null);
  const [working,setWorking]=useState(false);
  const [tool,setTool]=useState<BoardTool>('pen');
  const [colour,setColour]=useState(()=>replay(external).theme==='white'?'#172f49':'#f5f0d8');
  const [width,setWidth]=useState(3.6);
  const [speed,setSpeed]=useState(1);
  const [style,setStyle]=useState<'ink'|'chalk'>('chalk');
  const [playhead,setPlayhead]=useState(Infinity);
  const [isPlaying,setIsPlaying]=useState(false);
  const raf=useRef<number|null>(null);
  const playback=useRef<{start:number;stop:number;at:number}|null>(null);
  const pending=useRef(Promise.resolve());
  useEffect(()=>{latest.current=external;setLesson(external);},[external]);
  useEffect(()=>()=>{if(raf.current!==null)cancelAnimationFrame(raf.current);},[]);
  const commit=useCallback(async(fn:(l:Lesson)=>Lesson)=>{
    const previous=latest.current;
    const next=fn(previous);
    latest.current=next;setLesson(next);setWorking(true);setError(null);
    const current=pending.current.catch(()=>{}).then(()=>saveLesson(next));
    pending.current=current;
    try{await current;}
    catch(e){setError(e instanceof Error?e.message:String(e));
      if(latest.current===next){latest.current=previous;setLesson(previous);}
      throw e;
    }finally{setWorking(false);}
  },[saveLesson]);
  const startPlayback=useCallback((start:number,stop:number)=>{
    if(raf.current!==null)cancelAnimationFrame(raf.current);
    const at=performance.now();playback.current={start,stop,at};setPlayhead(start);setIsPlaying(true);
    const tick=(now:number)=>{
      const p=playback.current;if(!p)return;
      const position=Math.min(p.stop,p.start+(now-p.at));
      setPlayhead(position);
      if(position<p.stop)raf.current=requestAnimationFrame(tick);
      else {raf.current=null;playback.current=null;setIsPlaying(false);setPlayhead(Infinity);}
    };
    raf.current=requestAnimationFrame(tick);
  },[]);
  const pause=useCallback(()=>{
    if(raf.current!==null)cancelAnimationFrame(raf.current);
    raf.current=null;playback.current=null;setIsPlaying(false);
  },[]);
  const resume=useCallback(()=>startPlayback(Number.isFinite(playhead)?playhead:0,lastActionEnd(latest.current.actions)),[startPlayback,playhead]);
  const showAll=useCallback(()=>{pause();setPlayhead(Infinity);},[pause]);
  const board=useMemo(()=>replay(lesson,playhead),[lesson,playhead]);
  const liveBoard=useMemo(()=>replay(lesson),[lesson]);
  const currentPageId=liveBoard.currentPageId;
  const page=liveBoard.pages.find(p=>p.id===currentPageId);
  const newPage=useCallback(async()=>{
    await commit(l=>{const pageId=newId();const add=makeAction(l,'page.add',{pageId});
      const shown=makeAction({...l,actions:[...l.actions,add]},'page.show',{pageId});
      return {...l,pages:[...l.pages,{id:pageId,index:l.pages.length}],actions:[...l.actions,add,shown]};});
    showAll();
  },[commit,showAll,makeAction]);
  const showPage=useCallback(async(pageId:string)=>{
    await commit(l=>({...l,actions:[...l.actions,makeAction(l,'page.show',{pageId})]}));showAll();
  },[commit,showAll,makeAction]);
  const placeSelection=useCallback(async(selection:SourceSelection,mode:'handwriting'|'crop'|'math')=>{
    let interval:{start:number;end:number}|null=null;
    await commit(l=>{
      const {next,pageId}=ensurePage(l,makeAction);
      const pageState=replay(next).pages.find(p=>p.id===pageId);
      const bottom=Math.max(35,...(pageState?.content.map(c=>c.target.y+c.target.height)??[]));
      const nextY=Math.max(90,bottom+38);
      const base=defaultRect(pageState?.content.length??0);
      let target:Rect={...base,y:nextY};
      const text=(selection.displayText??selection.text)?.trim();
      const plan=mode==='handwriting'&&text?planHandwriting({text,x:target.x+5,y:target.y,maxWidth:target.width-10,
          emSize:58,strokeWidth:width,color:colour,speed}):null;
      if(mode==='handwriting'&&!plan)throw new Error('This selection has no text. Place its original PDF crop instead.');
      if(plan?.unsupported.length)throw new Error(`Unsupported handwritten characters: ${plan.unsupported.map(x=>x.char).join(' ')}. Use the original PDF crop instead.`);
      if(plan)target={...target,height:Math.ceil(plan.height+28)};
      else if(mode==='math') {
        if(!text)throw new Error('No mathematical text selected. Use the original PDF crop.');
        const math=parseMath(text);
        if(!math.ok)throw new Error(`Maths cannot be represented exactly (${math.reason}). Use original source crop.`);
        const box=layoutMath(math.ast,62);
        const scale=Math.min(1,1680/Math.max(1,box.width),320/Math.max(1,box.ascent+box.descent));
        target={...target,width:Math.max(40,box.width*scale+24),height:(box.ascent+box.descent)*scale+24};
      } else {
        const ratio=selection.bbox.height/selection.bbox.width;
        const imageWidth=Math.min(1170,Math.max(180,selection.bbox.width*2.5));
        const fit=Math.min(1,680/(imageWidth*ratio));
        target={...target,width:imageWidth*fit,height:imageWidth*ratio*fit};
      }
      if(target.y+target.height>1020)throw new Error('This board page has no room for the selection. Add a new page first.');
      const place=makeAction(next,'content.place',{pageId,selectionId:selection.id,target,mode});
      const actions=[...next.actions,place];
      if(plan){
        const first=logicalTime(actions);
        for(const st of plan.strokes){
          actions.push({id:newId(),type:'stroke.write',t:first+st.startMs,pageId,contentId:place.id,
            stroke:{points:st.points,width:st.width,color:st.color,durationMs:st.durationMs}});
        }
        interval={start:place.t,end:first+plan.endMs};
      }
      return {...next,actions};
    });
    if(interval){const x=interval as {start:number;end:number};startPlayback(x.start,x.end);}else showAll();
  },[commit,colour,width,speed,startPlayback,showAll,makeAction]);
  const draw=useCallback(async(stroke:Stroke)=>{
    await commit(l=>{const {next,pageId}=ensurePage(l,makeAction);return {...next,actions:[...next.actions,makeAction(next,'ink.draw',{pageId,stroke})]};});showAll();
  },[commit,showAll,makeAction]);
  const erase=useCallback(async(strokeIds:string[])=>{
    if(!currentPageId||!strokeIds.length)return;
    await commit(l=>({...l,actions:[...l.actions,makeAction(l,'ink.erase',{pageId:currentPageId,strokeIds})]}));showAll();
  },[commit,currentPageId,showAll,makeAction]);
  const clear=useCallback(async()=>{
    if(!currentPageId)return;
    await commit(l=>({...l,actions:[...l.actions,makeAction(l,'board.clear',{pageId:currentPageId})]}));showAll();
  },[commit,currentPageId,showAll,makeAction]);
  const move=useCallback(async(contentId:string,x:number,y:number)=>{
    if(!currentPageId)return;
    await commit(l=>{const state=replay(l).pages.find(p=>p.id===currentPageId);
      const target=state?.content.find(c=>c.id===contentId)?.target;
      if(!target)return l;
      return {...l,actions:[...l.actions,makeAction(l,'content.move',{pageId:currentPageId,contentId,target:{...target,x,y}})]};});
  },[commit,currentPageId,makeAction]);
  const remove=useCallback(async(contentId:string)=>{
    if(!currentPageId)return;
    await commit(l=>({...l,actions:[...l.actions,makeAction(l,'content.remove',{pageId:currentPageId,contentId})]}));
  },[commit,currentPageId,makeAction]);
  const changeTheme=useCallback(async(theme:'green'|'black'|'white')=>{
    await commit(l=>({...l,actions:[...l.actions,makeAction(l,'board.theme.set',{theme})]}));
    setColour(theme==='white'?'#172f49':'#f5f0d8');
  },[commit,makeAction]);
  const history=historyStatus(lesson.actions);
  const undo=useCallback(async()=>{
    const target=historyStatus(latest.current.actions).canUndo;if(!target)return;
    await commit(l=>({...l,actions:[...l.actions,makeAction(l,'history.undo',{targetActionId:target})]}));showAll();
  },[commit,showAll,makeAction]);
  const redo=useCallback(async()=>{
    const target=historyStatus(latest.current.actions).canRedo;if(!target)return;
    await commit(l=>({...l,actions:[...l.actions,makeAction(l,'history.redo',{targetActionId:target})]}));showAll();
  },[commit,showAll,makeAction]);
  const upsertSegment=useCallback(async(segment:RecordingSegment)=>{
    await commit(l=>({...l,segments:[...l.segments.filter(s=>s.id!==segment.id),segment]}));
  },[commit]);
  return {lesson,board,liveBoard,page,currentPageId,setRecordingClock,upsertSegment,error,working,tool,setTool,colour,setColour,width,setWidth,
    speed,setSpeed,style,setStyle,playhead,isPlaying,pause,resume,showAll,startPlayback,
    newPage,showPage,placeSelection,draw,erase,clear,move,remove,changeTheme,undo,redo,history};
}
export type BoardStudio=ReturnType<typeof useBoardStudio>;
