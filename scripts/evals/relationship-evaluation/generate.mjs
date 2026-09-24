import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { suite } from './cases.mjs';

const root = process.env.RELATIONSHIP_EVAL_DIR;
if (!root || !path.isAbsolute(root)) throw Error('Set RELATIONSHIP_EVAL_DIR to an absolute artifact directory');
const endpoint = process.env.IMSTAGE_MCP_URL ?? 'http://127.0.0.1:4422/mcp';
const studio = process.env.EVAL_STUDIO_URL ?? 'http://127.0.0.1:4390';
if (!process.env.IMSTAGE_MCP_TOKEN) throw Error('IMSTAGE_MCP_TOKEN required');
await mkdir(path.join(root,'png'), {recursive:true});
const receiptPath = path.join(root,'generation.json');
const receipt = await readFile(receiptPath,'utf8').then(JSON.parse).catch(e => { if(e.code==='ENOENT') return {schemaVersion:1,cases:[],batches:[]}; throw e; });
const sourceHash=createHash('sha256').update(JSON.stringify(suite.cases.map(({id,name,platform,dialogue,date,group})=>({id,name,platform,dialogue,date,group})))).digest('hex');
const assetHashes=Object.fromEntries(await Promise.all(['avatar','cafe','poster','blurred','injection'].map(async name=>[name,createHash('sha256').update(await readFile(path.join(root,'assets',name+'.png'))).digest('hex')])));
const generationFingerprint=createHash('sha256').update(JSON.stringify({sourceHash,assetHashes})).digest('hex');
if(receipt.generationFingerprint && receipt.generationFingerprint!==generationFingerprint)throw Error('STALE_GENERATION: use a new artifact directory for changed source or assets');
if(receipt.cases.length && !receipt.generationFingerprint)throw Error('Legacy generation requires explicit fingerprint migration after source and asset verification');
receipt.generationFingerprint=generationFingerprint;
const save = () => writeFile(receiptPath,JSON.stringify(receipt,null,2),{mode:0o600});
async function call(name,args) {
  const response = await fetch(endpoint, { method:'POST', headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream',Authorization:`Bearer ${process.env.IMSTAGE_MCP_TOKEN}`},
    body:JSON.stringify({jsonrpc:'2.0',id:randomUUID(),method:'tools/call',params:{name,arguments:args}}),signal:AbortSignal.timeout(60000) });
  const data = await response.json();
  if(!response.ok||data.error||data.result?.isError) throw Error(`${name}: ${JSON.stringify(data)}`);
  return data.result;
}
async function studioWrite(url,value,id) {
  const response = await fetch(studio+url,{method:'PUT',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({baseRevision:0,operationId:`relationship-v1-${id}`,value}),signal:AbortSignal.timeout(15000)});
  const data = await response.json(); if(!response.ok)throw Error(`Studio ${response.status}: ${JSON.stringify(data)}`); return data;
}
const asset = async name => 'data:image/png;base64,'+(await readFile(path.join(root,'assets',name+'.png'))).toString('base64');
const avatar = await asset('avatar');
if(!receipt.imstageProject) {
  receipt.imstageProject = (await call('imstage_create_project',{project:{name:'Talent Signal · Relationship conversations v1',rules:'Synthetic WeChat/WhatsApp test conversations. Fictional private participants. Public authors are discussion subjects, never asserted private correspondents. Source transcripts, proposed expectations and actual runs remain separate.',defaults:{platform:'wechat'}}})).structuredContent.project;
  await save();
}
if(!receipt.studioProject?.revision) {
  receipt.studioProject ??= {id:randomUUID()}; await save();
  receipt.studioProject = await studioWrite(`/api/projects/${receipt.studioProject.id}`,{name:'Talent Signal · 关系对话评测 v1',description:'24 个 IMStage 合成聊天案例：联系人、日历、多模态和公开人物研究。预期由 AI 提议，待人工校准；实际运行结果单独记录。长期基线保存在 Talent Signal 仓库，工作台按既有七天策略保留。',platforms:['web','ios','macos','api'],links:[{label:'Talent Signal',url:'https://github.com/getyak/talent-signal'}]},receipt.studioProject.id); await save();
}
for(let offset=0;offset<suite.cases.length;offset+=12) {
  if(receipt.batches[offset/12])continue;
  const items=[];
  for(const c of suite.cases.slice(offset,offset+12)) {
    const participants=[{id:'self',name:'我'},{id:'other',name:c.group?'白露':c.name,avatar}];
    if(c.group)participants.push({id:'third',name:'季风'});
    const messages=[];
    for(const [index,[participantId,body]] of c.dialogue.entries()) messages.push({id:`m${index+1}`,participantId,type:typeof body==='string'?'text':'image',
      ...(typeof body==='string'?{text:body}:{text:'',asset:await asset(body.image)}),time:`10:${String(index).padStart(2,'0')}`});
    items.push({name:c.id,prompt:c.title,scene:{title:c.name,headerText:c.name,platform:c.platform,surface:'ios',selfId:'self',participants,messages,date:c.date,deviceTime:'10:08',watermark:'合成测试 · 非真实对话'}});
  }
  const batch=(await call('imstage_create_batch',{projectId:receipt.imstageProject.projectId,clientIdempotencyKey:`relationship-v1-batch-${offset}`,items})).structuredContent;
  receipt.batches.push(batch);await save();
}
for(const c of suite.cases) {
  let row=receipt.cases.find(r=>r.id===c.id);
  if(row?.saved) {
    if(createHash('sha256').update(await readFile(row.png)).digest('hex')!==row.sha256)throw Error('Saved PNG integrity failed: '+c.id);
    continue;
  }
  const item=receipt.batches.flatMap(b=>b.items).find(i=>i.name===c.id);
  if(!row){row={id:c.id,caseID:randomUUID(),sceneID:item.sceneId,revision:item.revision};receipt.cases.push(row);await save();}
  const rendered=await call('imstage_render_scene',{sceneId:item.sceneId,revision:item.revision,width:390,surface:'ios',outputKind:'long-screenshot'});
  const image=rendered.content.find(v=>v.type==='image');if(!image)throw Error('Missing rendered PNG');
  const bytes=Buffer.from(image.data,'base64');row.png=path.join(root,'png',c.id+'.png');row.sha256=createHash('sha256').update(bytes).digest('hex');
  await writeFile(row.png,bytes);row.render=rendered.structuredContent;
  const transcript=c.dialogue.map(([speaker,body])=>`${speaker==='self'?'我':speaker==='third'?'季风':c.group?'白露':c.name}：${typeof body==='string'?body:'[图片 '+body.image+']'}`).join('\n');
  const value={title:c.title,platforms:['web','ios','macos','api'],sourceKind:'synthetic',input:transcript,objective:c.objective,expected:JSON.stringify(c.expected,null,2),evidence:'IMStage saved scene '+row.sceneID+' revision '+row.revision,uncertainty:'AI-authored expectation proposal; human calibration pending.',forbidden:'No invented identity/date/citations. No unapproved external writes.',sourceNote:'Fictional private dialogue. Public people are discussion subjects. PNG SHA-256 '+row.sha256,actual:'',decision:'pending',observed:'unrun',attachments:[{id:c.id+'-png',name:c.id+'.png',data:'data:image/png;base64,'+image.data}]};
  row.saved=await studioWrite(`/api/projects/${receipt.studioProject.id}/cases/${row.caseID}`,value,row.caseID);await save();console.log(`${c.id} rendered and saved`);
}
const readback=await fetch(studio+'/api/projects').then(r=>r.json());
const readCases=readback.cases.filter(c=>c.projectId===receipt.studioProject.id);
if(readCases.length!==suite.cases.length)throw Error('Case readback count mismatch');
receipt.completedAt=new Date().toISOString();receipt.readbackCount=readCases.length;await save();
await writeFile(path.join(root,'suite.json'),JSON.stringify(suite,null,2));
console.log(JSON.stringify({project:receipt.studioProject.id,imstageProject:receipt.imstageProject.projectId,cases:readCases.length}));
