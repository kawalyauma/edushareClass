import {createLesson} from '@edushare/lesson-format';
import {describe,expect,it} from 'vitest';
import {LessonSchema} from '@edushare/shared-types';

describe('teacher-authored handwriting provenance',()=>{
  it('allows a handwritten text note with no fictitious PDF source',()=>{
    const lesson=createLesson({id:'teacher-lesson',title:'P6 Fractions'});
    const noteId='teacher-note-1',pageId='board-page-1',placementId='place-note-1';
    const authored={
      ...lesson,
      teacherNotes:[{id:noteId,text:'Fractions are parts of a whole',createdAt:new Date().toISOString()}],
      pages:[{id:pageId,index:0}],
      actions:[
        {id:'create-page',type:'page.add',pageId,t:1},
        {id:placementId,type:'content.place',pageId,selectionId:noteId,
          target:{x:90,y:90,width:1700,height:130},mode:'handwriting',t:2},
      ],
    };
    const parsed=LessonSchema.safeParse(authored);
    expect(parsed.success).toBe(true);
    if(parsed.success){
      expect(parsed.data.sources).toEqual([]);
      expect(parsed.data.selections).toEqual([]);
      expect(parsed.data.teacherNotes?.[0]?.text).toBe('Fractions are parts of a whole');
    }
  });
  it('rejects handwritten content referencing a non-existent note or PDF selection',()=>{
    const lesson=createLesson({id:'teacher-lesson',title:'Science'});
    const parsed=LessonSchema.safeParse({...lesson,
      pages:[{id:'page',index:0}],
      actions:[
        {id:'add',type:'page.add',pageId:'page',t:1},
        {id:'place',type:'content.place',pageId:'page',selectionId:'not-a-note',t:2,
          mode:'handwriting',target:{x:90,y:90,width:400,height:50}}
      ]
    });
    expect(parsed.success).toBe(false);
  });
  it('rejects teacher notes longer than 300 characters',()=>{
    const lesson=createLesson({id:'test',title:'Science'});
    expect(LessonSchema.safeParse({...lesson,teacherNotes:[{
      id:'too-long',text:'a'.repeat(301),createdAt:new Date().toISOString()}]}).success).toBe(false);
  });
});
