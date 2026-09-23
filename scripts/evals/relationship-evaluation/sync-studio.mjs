import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import path from 'node:path';
import {suite} from './cases.mjs';
import {grade} from './grade.mjs';
import {hash} from './fingerprint.mjs';
const root=process.env.RELATIONSHIP_EVAL_DIR;
if(!root||!path.isAbsolute(root))throw Error('Private artifact directory required');
const label=process.env.RELATIONSHIP_EVAL_LABEL??'baseline';
if(!/^[a-z0-9-]+$/u.test(label))throw Error('Invalid label');
const origin=process.env.EVAL_STUDIO_URL??'http://127.0.0.1:4390';
const generation=JSON.parse(await readFile(path.join(root,'generation.json'),'utf8'));
const snapshot=await fetch(origin+'/api/projects').then(r=>r.json());
const rows=[];
const escape=s=>String(s??'').replace(/[&<>"']/gu,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const preview=path.join(root,'preview',label);await mkdir(path.join(preview,'png'),{recursive:true});
for(const c of suite.cases) {
  const receipt=generation.cases.find(r=>r.id===c.id);
  const saved=snapshot.cases.find(row=>row.id===receipt.caseID&&row.projectId===generation.studioProject.id);
  if(!saved)throw Error('Missing case '+c.id);
  const run=await readFile(path.join(root,'runs',label,c.id+'.json'),'utf8').then(JSON.parse).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
  if(run&&run.caseHash!==hash(c))throw Error('Case definition changed since run '+c.id);
  const verdict=run?grade(c,run):{status:'unrun',failures:[],humanReview:'pending'};
  const actual=run?JSON.stringify({run:label,model:run.model,commit:run.commit,mode:run.mode,persistence:run.persistence,preprocessingMode:run.preprocessingMode??'Independent Doubao probe and raw-image workspace core',mechanicalVerdict:verdict,reply:run.result?.block?.body??null,error:run.error??null,tools:run.toolCalls.map(t=>({name:t.name,failed:!!t.error||!!t.result?.isError})),usage:run.usage??null,humanSemanticReview:'pending'},null,2):'';
  const displayedExpectations={...c.expected,defaultContact:c.group?'no_single_counterparty':{name:c.name,status:'review_before_save',emailOrCompanyRequired:false}};
  const value={...saved,expected:JSON.stringify(displayedExpectations,null,2),actual,observed:run?(verdict.status==='fail'?'fail':'unknown'):'unrun',decision:'pending'};
  const response=await fetch(`${origin}/api/projects/${generation.studioProject.id}/cases/${receipt.caseID}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({baseRevision:saved.revision,operationId:`eval-${label}-${c.id}-${hash(actual+value.expected).slice(0,16)}`,value})});
  if(!response.ok)throw Error('Case update failed '+c.id+': '+await response.text());
  const updated=await response.json();
  // A source/expectation edit invalidates results. If so, save actual separately.
  if(actual&&updated.actual!==actual) {
    const follow=await fetch(`${origin}/api/projects/${generation.studioProject.id}/cases/${receipt.caseID}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({baseRevision:updated.revision,operationId:`run-${label}-${c.id}-${hash(actual).slice(0,16)}`,value:{...updated,actual,observed:value.observed,decision:'pending'}})});
    if(!follow.ok)throw Error('Actual result save failed '+c.id);
  }
  await copyFile(receipt.png,path.join(preview,'png',c.id+'.png'));
  rows.push({id:c.id,title:c.title,category:c.category,verdict,caseID:receipt.caseID,reply:run?.result?.block?.body??'',error:run?.error?.message??'',expected:displayedExpectations,actual});
}
const readback=await fetch(origin+'/api/projects').then(r=>r.json());
for(const row of rows) {
  const actual=readback.cases.find(c=>c.id===row.caseID);
  if(!actual||actual.actual!==row.actual||actual.decision!=='pending')throw Error('Result readback failed '+row.id);
}
await writeFile(path.join(root,'runs',label,'adjudication.json'),JSON.stringify({label,graderHash:hash(await readFile(new URL('./grade.mjs',import.meta.url))),rows},null,2));
const cards=rows.map(r=>`<article data-status="${r.verdict.status}"><div><span class="tag">${escape(r.id)} · ${escape(r.verdict.status)}</span><h2>${escape(r.title)}</h2><p class="fail">${escape(r.verdict.failures.join(' · ')||r.error)}</p><details><summary>预期行为（待人工校准）</summary><pre>${escape(JSON.stringify(r.expected,null,2))}</pre></details><h3>实际回复</h3><p class="reply">${escape(r.reply||r.error||'尚未运行')}</p><a href="${escape(origin)}/#project/${generation.studioProject.id}/case/${r.caseID}">打开案例与原始记录 →</a></div><img loading="lazy" src="png/${r.id}.png" alt="${escape(r.id)} 合成聊天截图"></article>`).join('');
await writeFile(path.join(preview,'index.html'),`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>关系对话评测 · ${escape(label)}</title><style>body{font:16px/1.65 system-ui;margin:0;background:#f5f4ef;color:#26352f}main{max-width:1120px;margin:auto;padding:40px 24px}h1{font-size:36px;margin:8px 0}h2{font-size:21px;margin:12px 0}.intro{max-width:800px;color:#546158}.tag{font:13px ui-monospace;background:#e7e8df;padding:5px 9px;border-radius:5px}article{display:grid;grid-template-columns:1fr 280px;gap:40px;border-top:1px solid #d5d8cd;padding:36px 0}article img{width:100%;border:1px solid #d8d9d1;border-radius:20px}pre{white-space:pre-wrap;font-size:13px}.reply{white-space:pre-wrap}.fail{color:#923e31}a{color:#246551}details{margin:18px 0}h3{font-size:14px;letter-spacing:.08em;color:#627468}nav{position:sticky;top:0;background:#f5f4eff0;padding:12px 0}button{border:1px solid #b8c6ba;border-radius:16px;padding:7px 14px;background:white;margin:4px;cursor:pointer}@media(max-width:650px){article{grid-template-columns:1fr;gap:20px}article img{max-width:330px}main{padding:20px}h1{font-size:28px}}</style><main><p>Talent Signal / Evaluation</p><h1>关系对话，逐条验证。</h1><p class="intro">${escape(label)} · 24 个合成聊天案例。图片、预期、真实工具记录与回复分别保留。机械检查通过不代表人工质量认证；未运行、失败和基础设施错误均不会显示为通过。</p><nav>${['all','fail','error','mechanical_pass','unrun'].map(s=>`<button onclick="document.querySelectorAll('article').forEach(a=>a.hidden='${s}'!=='all'&amp;&amp;a.dataset.status!=='${s}')">${s}</button>`).join('')}</nav>${cards}</main></html>`);
console.log(JSON.stringify({readbackCases:rows.length,report:path.join(preview,'index.html'),project:origin+'/#project/'+generation.studioProject.id}));
