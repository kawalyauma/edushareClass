import {describe,it,expect} from 'vitest';
import {persistedRecordingDurationMs} from './probeMediaDuration';

describe('recorded media duration alignment',()=>{
  it('uses decoded browser media duration instead of a longer wall clock',()=>{
    expect(persistedRecordingDurationMs(12_500,9_702)).toBe(9_702);
  });
  it('falls back if decoding cannot determine the duration',()=>{
    expect(persistedRecordingDurationMs(9_500,null)).toBe(9_500);
    expect(persistedRecordingDurationMs(9_500,Number.POSITIVE_INFINITY)).toBe(9_500);
    expect(persistedRecordingDurationMs(9_500,0)).toBe(9_500);
  });
  it('never saves a nonpositive clip duration',()=>{
    expect(persistedRecordingDurationMs(0,null)).toBe(1);
  });
});
