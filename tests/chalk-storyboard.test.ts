import {createLesson} from '@edushare/lesson-format';
import {LessonSchema} from '@edushare/shared-types';
import {describe,expect,it} from 'vitest';
import {planChalkSection} from '../apps/web/src/chalkboard/chalkNotes';

const sourceId='pdf-source';
const selectionId='selection-1';
const pageId='chalkboard-1';
const base=()=>{
  const lesson=createLesson({id:'school-test',title:'SOCIAL STUDIES MARKING GUIDE'});
  return {...lesson,
    sources:[{id:sourceId,fileName:'social-studies.pdf',sha256:'a'.repeat(64),pageCount:1}],
    selections:[{id:selectionId,sourceId,page:1,kind:'text' as const,
      text:'1. Name one type of weather.\nAns: Sunny weather.',
      bbox:{x:20,y:50,width:360,height:130}}],
    pages:[{id:pageId,index:0,chalkColumns:3 as const}],
    actions:[
      {id:'page-created',t:1,type:'page.add' as const,pageId},
      {id:'page-shown',t:2,type:'page.show' as const,pageId},
    ],
  };
};
describe('teacher-approved chalkboard scripts',()=>{
  const take={id:'take-1',selectionId,columns:3 as const,pageIds:[pageId],startMs:2,endMs:1500,approvedAt:new Date().toISOString()};
  it('saves source identity, approved pages and recording time without a schema version bump',()=>{
    const parsed=LessonSchema.safeParse({...base(),chalkTake:take});
    expect(parsed.success).toBe(true);
    if(parsed.success){
      expect(parsed.data.chalkTake?.columns).toBe(3);
      expect(parsed.data.chalkTake?.pageIds).toEqual([pageId]);
    }
  });
  it('accepts old lessons with no approved chalkboard',()=>{
    expect(LessonSchema.safeParse(createLesson({id:'legacy',title:'Previous lesson'})).success).toBe(true);
  });
  it('rejects an orphaned PDF selection or absent page',()=>{
    expect(LessonSchema.safeParse({...base(),chalkTake:{...take,selectionId:'not-a-PDF-selection'}}).success).toBe(false);
    expect(LessonSchema.safeParse({...base(),chalkTake:{...take,pageIds:['wrong-page']}}).success).toBe(false);
  });
  it('rejects empty/zero-duration recording scripts',()=>{
    expect(LessonSchema.safeParse({...base(),chalkTake:{...take,startMs:1550,endMs:1500}}).success).toBe(false);
    expect(LessonSchema.safeParse({...base(),chalkTake:{...take,pageIds:[]}}).success).toBe(false);
  });
  it('preview planning leaves the original lesson unchanged and does not persist pages or strokes',()=>{
    const original=createLesson({id:'preview',title:'Social Studies'});
    const before=JSON.stringify(original);
    const plan=planChalkSection('1. What provides solar energy?\nAns: Sunny weather.',2);
    expect(plan.pages.length).toBeGreaterThan(0);
    expect(JSON.stringify(original)).toBe(before);
    expect(original.actions).toEqual([]);
    expect(original.pages).toEqual([]);
  });
});
