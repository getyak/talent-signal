// Full authenticated queue + persistence probe against the isolated synthetic account.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {suite} from './cases.mjs';
import {hash} from './fingerprint.mjs';

const root=process.env.RELATIONSHIP_EVAL_DIR;
const repo=process.env.RELATIONSHIP_EVAL_REPO??process.cwd();
const label=process.env.RELATIONSHIP_EVAL_LABEL;
const endpoint=process.env.RELATIONSHIP_EVAL_API??'http://127.0.0.1:55450';
if(!root||!label||!/^[-a-z0-9]+$/u.test(label)||new URL(endpoint).hostname!=='127.0.0.1')throw Error('Explicit local synthetic environment required');
const {TalentSignalClient}=await import(pathToFileURL(repo+'/packages/contracts/dist/index.js'));
const account=JSON.parse(await readFile(root+'/product-account.json','utf8'));
if(account.email!=='relationship-eval@example.test')throw Error('Synthetic account required');
const client=new TalentSignalClient(endpoint);
await client.signInWithPassword({identifier:account.email,password:account.password,client_label:'relationship-eval'});
const output=root+'/product-probes/'+label;await mkdir(output,{recursive:true});
for(const caseID of (process.env.RELATIONSHIP_EVAL_CASES??'C06').split(',')){
 const c=suite.cases.find(c=>c.id===caseID);if(!c)throw Error('Unknown case');
 const objective=process.env.RELATIONSHIP_EVAL_OBJECTIVE??c.objective;
 const file=output+'/'+caseID+'.json';
 try{await readFile(file);throw Error('Preserve existing probe; choose a new label');}catch(e){if(e.code!=='ENOENT')throw e;}
 const sessionID=randomUUID(),messageID=randomUUID(),now=new Date().toISOString();
 const report={caseID,caseHash:hash(c),objective,objectiveHash:hash(objective),endpoint,sessionID,messageID,startedAt:now,mode:'authenticated-product-queue',humanReview:'pending'};
 try{
  report.sessionCreated=await client.saveAgentSession(sessionID,{expected_revision:0,idempotency_key:randomUUID(),payload:{id:sessionID,scopeKind:'unresolved_intent',personDisplayLabel:'',contextDisplayLabel:'',title:`${caseID} · ${label} · 合成评测`,turns:[],updatedAt:now,isUnread:false}});
  const png=await readFile(root+'/png/'+caseID+'.png');report.pngHash=hash(png);
  report.admission=await client.admitConversationQueueEntry({idempotency_key:randomUUID(),session_id:sessionID,message_id:messageID,objective,time_zone:c.timeZone,images:[{attachment_id:randomUUID(),file_name:caseID+'.png',media_type:'image/png',byte_size:png.length,content_hash:hash(png),data_base64:png.toString('base64')}]});
  await writeFile(file,JSON.stringify(report,null,2),{mode:0o600});
  console.log(JSON.stringify({caseID,sessionID,status:'admitted'}));
  const deadline=Date.now()+150000;
  while(Date.now()<deadline){
   report.queue=await client.getConversationQueue(sessionID);
   if(!report.queue.active&&!report.queue.queued.length)break;
   await new Promise(r=>setTimeout(r,1500));
  }
  report.readback=await client.getAgentSession(sessionID);
  report.imageReadbackHash=hash(Buffer.from(await(await client.openConversationMessageImage(sessionID,messageID,0)).arrayBuffer()));
  report.imageBytesMatch=report.imageReadbackHash===report.pngHash;
  const turns=report.readback.session.payload?.turns??[];
  report.completed=turns.some(t=>t.id===messageID)&&!report.queue.active&&!report.queue.queued.length;
  if(!report.completed)report.error='PRODUCT_QUEUE_DID_NOT_COMPLETE';
 }catch(e){report.error={code:e.code,message:e.message};}
 report.finishedAt=new Date().toISOString();await writeFile(file,JSON.stringify(report,null,2),{mode:0o600});
 console.log(JSON.stringify({caseID,sessionID,completed:report.completed,error:report.error,imageBytesMatch:report.imageBytesMatch}));
}
