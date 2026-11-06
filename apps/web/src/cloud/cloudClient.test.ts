import {describe,it,expect} from 'vitest';
import {checkedBaseURL} from './cloudClient';
describe('Phase 09 private API address validation',()=>{
 it('requires TLS for nonlocal cloud connections',()=>{
  expect(()=>checkedBaseURL('http://example.com')).toThrow(/HTTPS/);
  expect(checkedBaseURL('https://school.example.com/')).toBe('https://school.example.com');
 });
 it('permits explicit localhost development without exposing bearer tokens to URL credentials',()=>{
  expect(checkedBaseURL('http://localhost:8000')).toBe('http://localhost:8000');
  expect(()=>checkedBaseURL('https://user:pass@example.com')).toThrow();
 });
});
