/** Public, original NotesUG video identity. All elements are rendered locally on canvas. */
export type NotesUGVideoBrand = {
  enabled: boolean;
  lessonTitle: string;
  teacherName?: string;
};
export type VideoScene = 'intro' | 'lesson' | 'outro';

const LIMIT_TITLE=90;
const LIMIT_TEACHER=60;
export function cleanVideoLabel(value:string,max=LIMIT_TITLE):string{
  return value.replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
}
export function videoBrandTiming(brand:NotesUGVideoBrand|undefined){
  return brand?.enabled?{introMs:2500,outroMs:1900}:{introMs:0,outroMs:0};
}
export function brandText(brand:NotesUGVideoBrand){
  return {
    title:cleanVideoLabel(brand.lessonTitle)||'Classroom lesson',
    teacher:cleanVideoLabel(brand.teacherName??'',LIMIT_TEACHER),
  };
}
function rounded(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,r:number){
  ctx.beginPath();ctx.roundRect(x,y,w,h,r);
}
const font=(ctx:CanvasRenderingContext2D,size:number,weight=700)=>{
  ctx.font=`${weight} ${size}px "Trebuchet MS", "Segoe UI", sans-serif`;
};
function fitTitle(ctx:CanvasRenderingContext2D,text:string,width:number){
  for(let size=78;size>=39;size-=3){
    font(ctx,size,700);
    if(ctx.measureText(text).width<=width)return size;
  }
  return 39;
}
function backdrop(ctx:CanvasRenderingContext2D,w:number,h:number,elapsed:number){
  const g=ctx.createLinearGradient(0,0,w,h);
  g.addColorStop(0,'#102e27');g.addColorStop(.55,'#173b31');g.addColorStop(1,'#081b21');
  ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
  const sx=w/1920,sy=h/1080;
  ctx.save();ctx.scale(sx,sy);
  // Original architectural schoolboard shapes; no borrowed video or image asset.
  for(let i=0;i<10;i++){
    ctx.lineWidth=1.5;
    ctx.strokeStyle='rgba(225,222,192,.055)';
    const delta=(elapsed/40+i*68)%1080;
    ctx.beginPath();ctx.moveTo(1070+i*92,-120);ctx.lineTo(580+i*92,1240);
    ctx.stroke();
    ctx.globalAlpha=.16;ctx.fillStyle='#c8daac';
    ctx.beginPath();ctx.arc(1460+(i%3)*96,delta,3+(i%4)*1.3,0,Math.PI*2);ctx.fill();
    ctx.globalAlpha=1;
  }
  ctx.strokeStyle='#c99c57';ctx.lineWidth=8;ctx.strokeRect(65,64,1790,952);
  ctx.strokeStyle='rgba(242,231,201,.3)';ctx.lineWidth=2;ctx.strokeRect(81,79,1758,922);
  ctx.restore();
}
function heading(ctx:CanvasRenderingContext2D,title:string,teacher:string){
  ctx.save();
  ctx.fillStyle='#e8cc7a';font(ctx,39,800);ctx.fillText('NotesUG',158,274);
  ctx.fillStyle='#afc9b8';font(ctx,28,500);ctx.fillText('EDUSHARE ACADEMY',160,323);
  ctx.fillStyle='#f3f3ea';
  fitTitle(ctx,title,1540);
  ctx.fillText(title,157,530,1540);
  ctx.fillStyle='#e7c875';ctx.fillRect(160,569,580,5);
  if(teacher){ctx.fillStyle='#e5ece2';font(ctx,35,500);ctx.fillText('With '+teacher,160,646,1500);}
  ctx.fillStyle='#a3c9b1';font(ctx,25,500);ctx.fillText('Learn clearly. Teach confidently.',160,903);
  ctx.restore();
}
export function paintNotesUGVideoScene(
  ctx:CanvasRenderingContext2D,w:number,h:number,scene:VideoScene,
  brand:NotesUGVideoBrand,elapsedMs:number
){
  const {title,teacher}=brandText(brand);
  const xs=w/1920,ys=h/1080;
  if(scene==='intro'||scene==='outro'){
    backdrop(ctx,w,h,elapsedMs);
    ctx.save();ctx.scale(xs,ys);
    if(scene==='intro')heading(ctx,title,teacher);
    else{
      ctx.fillStyle='#e8cc7a';font(ctx,63,800);ctx.fillText('NotesUG',160,352);
      ctx.fillStyle='#f4f2e7';font(ctx,74,800);ctx.fillText('Thank you for learning!',160,482,1520);
      ctx.fillStyle='#cedfd3';font(ctx,34,500);ctx.fillText('Keep learning with EduShare Academy',162,575,1510);
      ctx.fillStyle='#b7cbbd';font(ctx,25,500);ctx.fillText('notesug.com',162,905);
    }
    ctx.restore();
  }else{
    // Watermark sits on the wooden chalk tray, never on the teacher's notes.
    ctx.save();ctx.scale(xs,ys);
    ctx.fillStyle='rgba(6,26,23,.89)';rounded(ctx,1460,1018,390,49,11);ctx.fill();
    ctx.strokeStyle='#c9a45d';ctx.lineWidth=2;ctx.stroke();
    ctx.fillStyle='#ead38b';font(ctx,25,800);ctx.fillText('NotesUG',1480,1051);
    ctx.fillStyle='#c5dace';font(ctx,15,600);ctx.fillText('EDUSHARE ACADEMY',1640,1050);
    ctx.restore();
  }
}
