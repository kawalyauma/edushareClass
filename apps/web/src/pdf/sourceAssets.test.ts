import {beforeEach,describe,expect,it,vi,afterEach} from 'vitest';
import { webcrypto } from 'node:crypto';
import {IDBFactory} from 'fake-indexeddb';
import {LocalPdfAssets,checkedPdfBytes,sha256} from './sourceAssets';
describe('on-device source assets',()=>{
 let store:LocalPdfAssets;
 beforeEach(()=>{vi.stubGlobal('crypto', webcrypto);store=new LocalPdfAssets(new IDBFactory());});
 afterEach(()=>vi.unstubAllGlobals());
 it('persists source bytes and original image crops',async()=>{
  const bytes=new Blob(['%PDF-1.7\n']);const crop=new Blob(['png']);
  await store.savePdf('a'.repeat(64),bytes);await store.saveCrop('crop-1',crop);
  expect(await (await store.readPdf('a'.repeat(64)))?.text()).toBe('%PDF-1.7\n');
  expect(await (await store.readCrop('crop-1'))?.text()).toBe('png');
 });
 it('rejects non-PDF content',async()=>{
  await expect(checkedPdfBytes(new File(['Not pdf'],'fake.pdf',{type:'application/pdf'}))).rejects.toThrow('signature');
 });
 it('calculates stable SHA-256',async()=>{
  expect(await sha256(new TextEncoder().encode('test'))).toBe('9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08');
 });
});
