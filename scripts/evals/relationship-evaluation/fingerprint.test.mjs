import {test} from 'node:test';
import assert from 'node:assert/strict';
import {hash,reusable} from './fingerprint.mjs';
const identity={caseHash:'case-v1',pngHash:'png-v1',buildFingerprint:'build-v1',graderHash:'grader-v1',runnerHash:'runner-v1',model:'model-v1',endpoint:'https://example.com',preprocessing:true,fault:null};
test('only an exact completed run can be reused',()=>{
  const report={runFingerprint:hash(identity),finishedAt:'2026-09-24T00:00:00Z',verdict:{status:'fail'}};
  assert.equal(reusable(report,identity),true);
  for(const key of Object.keys(identity))assert.equal(reusable(report,{...identity,[key]:'changed'}),false,key);
  assert.equal(reusable({verdict:report.verdict},identity),false);
  assert.equal(reusable({...report,finishedAt:null},identity),false);
});
