import {BOARD_HEIGHT,BOARD_WIDTH} from '@edushare/shared-types';
import {planHandwriting,paintStroke} from '@edushare/stroke-engine';

export type ChalkboardTheme='green'|'black'|'white';
let backgroundCache:{key:string;canvas:HTMLCanvasElement}|null=null;
const palette={
  green:{top:'#0b2721',mid:'#143e30',bottom:'#0d3229',white:'#eff1e6',gold:'#f0d578'},
  black:{top:'#101419',mid:'#202b31',bottom:'#0f171c',white:'#f2f0e7',gold:'#f1d37a'},
  white:{top:'#edeae3',mid:'#f9faf7',bottom:'#dddcd4',white:'#203348',gold:'#9c7317'},
} as const;
function handwriting(ctx:CanvasRenderingContext2D,value:string,x:number,y:number,em:number,color:string,width:number){
  const plan=planHandwriting({text:value,x,y,maxWidth:width,emSize:em,
    strokeWidth:em*.062,color,speed:1,characterSpacing:.045,handStyle:'classroom'});
  if(plan.unsupported.length){
    // Never change a lesson title. Only the decorative header uses a font fallback.
    ctx.save();ctx.font=`46px "Trebuchet MS",sans-serif`;ctx.fillStyle=color;
    ctx.fillText(value,x,y+em,Math.max(200,width));ctx.restore();return;
  }
  for(const s of plan.strokes)paintStroke(ctx,s,1,'chalk');
}
function paintBoardBackground(ctx:CanvasRenderingContext2D,theme:ChalkboardTheme,columns:1|2|3,title:string,showHeading:boolean){
  const c=palette[theme];
  const wood=ctx.createLinearGradient(0,0,0,1080);
  wood.addColorStop(0,'#503321');wood.addColorStop(.024,'#b88453');
  wood.addColorStop(.05,'#5e3725');wood.addColorStop(.955,'#79452c');
  wood.addColorStop(.985,'#bc8651');wood.addColorStop(1,'#3d241a');
  ctx.fillStyle=wood;ctx.fillRect(0,0,BOARD_WIDTH,BOARD_HEIGHT);
  // Hand-grained frame: no repeating photo and no external image dependency.
  let seed=71;
  const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<185;i++){
    ctx.beginPath();ctx.strokeStyle=i%5===0?'#f6c9981c':'#25150f2b';
    ctx.lineWidth=.6+random()*2;
    const y=5+random()*1070;
    if(i%3===0){const x=5+random()*1910;ctx.moveTo(x,0);ctx.lineTo(x+random()*19,34);}
    else{const x=random()*1910;ctx.moveTo(x,y);ctx.lineTo(Math.min(1915,x+140+random()*520),y+random()*1.8);}
    ctx.stroke();
  }
  ctx.fillStyle='#291b15';ctx.fillRect(38,39,1844,979);
  const surface=ctx.createLinearGradient(0,40,1680,1020);
  surface.addColorStop(0,c.top);surface.addColorStop(.45,c.mid);surface.addColorStop(1,c.bottom);
  ctx.fillStyle=surface;ctx.fillRect(49,52,1822,953);
  // A worn, hand-cleaned classroom board with subtle old chalk marks.
  for(let i=0;i<205;i++){
    const x=56+random()*1810,y=57+random()*940;
    ctx.fillStyle=theme==='white'?'#11352807':'#edf4e704';
    ctx.beginPath();ctx.ellipse(x,y,2+random()*39,1+random()*16,random()*3,0,Math.PI*2);ctx.fill();
  }
  ctx.lineWidth=3;ctx.strokeStyle='#ddd1a94d';ctx.strokeRect(47,50,1826,957);
  ctx.lineWidth=2;ctx.strokeStyle='#122218a8';ctx.strokeRect(57,60,1805,936);
  // Board header visually mirrors the three-column handwritten reference.
  if(showHeading){
  handwriting(ctx,'NotesUG.com',95,76,49,c.gold,460);
  const titleDisplay=title.trim()?title.trim().slice(0,64):'CLASSROOM NOTES';
  const em=titleDisplay.length>35?36:49;
  handwriting(ctx,titleDisplay,570,83,em,c.white,1190);
  ctx.beginPath();ctx.moveTo(100,172);ctx.lineTo(1810,172);
  ctx.strokeStyle=theme==='white'?'#53687a55':'#e9e7d55b';ctx.lineWidth=2;ctx.stroke();
  if(columns>1){
    for(let i=1;i<columns;i++){
      const inner=1700, gap=41;
      const colWidth=(inner-(columns-1)*gap)/columns;
      const mid=111+i*colWidth+(i-1)*gap+gap/2;
      ctx.beginPath();ctx.moveTo(mid,210);ctx.lineTo(mid+2,965);
      ctx.lineWidth=2.6;ctx.strokeStyle=theme==='white'?'#44545563':'#cdddc49a';ctx.stroke();
    }
  }
  }
  // Light dust on wooden ledge and several chalk pieces near the corner.
  const ledge=ctx.createLinearGradient(0,1017,0,1070);
  ledge.addColorStop(0,'#432817');ledge.addColorStop(.34,'#b17a4b');ledge.addColorStop(.62,'#73452d');ledge.addColorStop(1,'#4d2d20');
  ctx.fillStyle=ledge;ctx.fillRect(26,1019,1868,45);
  ctx.fillStyle='#e4e2ce55';ctx.fillRect(242,1026,1400,2);
  for(let i=0;i<7;i++){
    ctx.fillStyle=['#efebe1','#efbe65','#b4d1b0','#d7a5a1','#f6e5b4','#c4d6f1','#ede6d1'][i]!;
    const x=760+i*49;
    ctx.beginPath();ctx.roundRect(x,1030,39,9,4);ctx.fill();
  }
  ctx.fillStyle='#6c5b48';ctx.beginPath();ctx.roundRect(1282,1011,116,31,6);ctx.fill();
  ctx.fillStyle='#a28c70';ctx.fillRect(1291,1015,96,4);
}
export function drawClassroomChalkboard(
  ctx:CanvasRenderingContext2D,theme:ChalkboardTheme,columns:1|2|3,title:string,showHeading=true
){
  const key=theme+'|'+columns+'|'+title+'|'+showHeading;
  if(!backgroundCache||backgroundCache.key!==key){
    const canvas=document.createElement('canvas');canvas.width=BOARD_WIDTH;canvas.height=BOARD_HEIGHT;
    const paint=canvas.getContext('2d');
    if(paint)paintBoardBackground(paint,theme,columns,title,showHeading);
    backgroundCache={key,canvas};
  }
  ctx.drawImage(backgroundCache.canvas,0,0);
}
