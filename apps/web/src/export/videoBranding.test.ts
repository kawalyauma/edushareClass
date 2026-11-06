import {describe,expect,it} from 'vitest';
import {brandText,cleanVideoLabel,videoBrandTiming} from './videoBranding';

describe('NotesUG academy video brand',()=>{
  it('produces predictable intro/outro lengths when enabled',()=>{
    expect(videoBrandTiming({enabled:true,lessonTitle:'Mathematics'})).toEqual({introMs:2500,outroMs:1900});
    expect(videoBrandTiming({enabled:false,lessonTitle:'Mathematics'})).toEqual({introMs:0,outroMs:0});
    expect(videoBrandTiming(undefined)).toEqual({introMs:0,outroMs:0});
  });
  it('preserves a school lesson title while removing control characters',()=>{
    expect(cleanVideoLabel('  P.6\n Fractions\t and  Decimals  ')).toBe('P.6 Fractions and Decimals');
    expect(cleanVideoLabel('x'.repeat(100)).length).toBe(90);
  });
  it('does not attribute a teacher name unless one is supplied',()=>{
    expect(brandText({enabled:true,lessonTitle:'',teacherName:'  '})).toEqual({title:'Classroom lesson',teacher:''});
    expect(brandText({enabled:true,lessonTitle:'Science',teacherName:' Ms. K  '})).toEqual({title:'Science',teacher:'Ms. K'});
    expect(brandText({enabled:true,lessonTitle:'Science',teacherName:'X'.repeat(120)}).teacher.length).toBe(60);
  });
});
