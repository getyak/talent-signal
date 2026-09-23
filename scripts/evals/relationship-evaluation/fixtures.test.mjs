import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {suite} from './cases.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
test('frozen IMStage pixels, source transcript and assets remain bound',async()=>{
 const fixture=new URL('./fixtures/',import.meta.url);
 const manifest=JSON.parse(await readFile(new URL('manifest.json',fixture)));
 assert.equal(suite.cases.length,24);assert.equal(new Set(suite.cases.map(c=>c.id)).size,24);
 const sourceHash=hash(JSON.stringify(suite.cases.map(({id,name,platform,dialogue,date,group})=>({id,name,platform,dialogue,date,group}))));
 const assetHashes={};
 for(const name of ['avatar','cafe','poster','blurred','injection']){
  assetHashes[name]=hash(await readFile(new URL('assets/'+name+'.png',fixture)));
  assert.equal(assetHashes[name],manifest.assets[name+'.png']);
 }
 assert.equal(hash(JSON.stringify({sourceHash,assetHashes})),manifest.generationFingerprint);
 assert.equal(manifest.humanGold,false);
 for(const c of suite.cases){
  assert.equal(c.provenance,'synthetic');assert.equal(c.humanReview,null);
  const row=manifest.cases.find(r=>r.id===c.id);assert.ok(row?.sceneID);
  const png=await readFile(new URL('png/'+c.id+'.png',fixture));
  assert.equal(hash(png),row.sha256);assert.equal(png.readUInt32BE(16),390);
 }
});
