import {it,expect} from 'vitest';
import {CONTAINERS,nextRecorderState,SessionClock,supportedRecorderMime} from './index.js';
it('chooses a tested container, never assumes MP4',()=>{
 expect(supportedRecorderMime(type=>type==='video/webm')).toBe('video/webm');
 expect(supportedRecorderMime(()=>false)).toBeNull();
 expect(CONTAINERS.length).toBeGreaterThan(2);
});
it('refuses illegal state transitions',()=>{
 expect(nextRecorderState('idle','request')).toBe('requesting');
 expect(nextRecorderState('requesting','start')).toBe('recording');
 expect(()=>nextRecorderState('idle','pause')).toThrow('Illegal recording state');
});
it('keeps the audio+board event clock aligned through pauses',()=>{
 let now=1000;const c=new SessionClock(560,now,()=>now);
 now=1430;expect(c.lessonTime()).toBe(990);
 c.pause();now=2600;expect(c.lessonTime()).toBe(990);
 c.resume();now=2700;expect(c.lessonTime()).toBe(1090);
});
