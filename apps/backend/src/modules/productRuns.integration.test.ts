import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { captureProductStep } from "@talent-signal/agent";
import { registerProductRunMonitoring, ProductRunService } from "./productRuns.js";
import { inTransaction } from "../database/pool.js";
import { saveProductRunOutput } from "./productRunStorage.js";
import type { AuthContext } from "./auth.js";

const database = process.env.PRODUCT_RUN_TEST_DATABASE_URL;
if (database && (!['127.0.0.1','localhost'].includes(new URL(database).hostname) || !['/get23_proof','/lab_regression_ci'].includes(new URL(database).pathname)))
  throw new Error('Use the owned get23_proof disposable database.');
const pool = database ? new Pool({ connectionString: database, max: 6 }) : null;
const auth: AuthContext = { accountId: randomUUID(), accountSlug: `runs-${randomUUID()}`, userId: randomUUID(),
  userEmail: 'runs@example.test', userKind: 'simulated_human', sessionId: randomUUID() };
const app = Fastify();
let service: ProductRunService;
let arrived=0; let release:()=>void; const barrier=new Promise<void>(resolve=>{release=resolve;});
beforeAll(async () => {
  if (!pool) return;
  await pool.query("INSERT INTO accounts(id,slug,name) VALUES($1,$2,'GET23 isolated test')",[auth.accountId,auth.accountSlug]);
  await pool.query("INSERT INTO users(id,account_id,email,display_name,kind) VALUES($1,$2,$3,'GET23','simulated_human')",[auth.userId,auth.accountId,auth.userEmail]);
  const authenticate = async (request: import('fastify').FastifyRequest) => { request.auth = auth; };
  registerProductRunMonitoring(app,pool,authenticate);
  app.post('/v1/chat/tasks',{preHandler:authenticate},async request => {
    const input=request.body as { task_id:string; fail?:boolean; concurrent?:boolean };
    if(input.concurrent) return inTransaction(pool!, async client=>{
      await client.query('SELECT 1'); arrived++; if(arrived===6) release(); await barrier;
      return captureProductStep('transaction.answer','context',{},async()=>({task_id:input.task_id,blocks:[{body:'transaction done'}]}));
    });
    return captureProductStep('test.answer','context',{ objective:'Test concurrent capture'},async()=> {
      if(input.fail) throw new Error('synthetic provider failure');
      return {task_id:input.task_id,blocks:[{title:'Answer',body:'Wednesday is tentative.\nAsk "which date".'}]};
    });
  });
  await app.ready(); service=new ProductRunService(pool);
},30_000);
afterAll(async()=>{await app.close();await pool?.end();});
const suite=database?describe:describe.skip;
suite('product runs and durable feedback',()=>{
  async function run(platform='web',fail=false){
    const id=randomUUID(),payload={task_id:id,idempotency_key:randomUUID(),objective:'Clarify the date',fail};
    const response=await app.inject({method:'POST',url:'/v1/chat/tasks',headers:{'x-talent-signal-platform':platform},payload});
    return {id,payload,response};
  }
  it('captures every request before any vote, including failure and isolated concurrent spans',async()=>{
    const [web,ios,failed]=await Promise.all([run(),run('ios'),run('web',true)]);
    expect(failed.response.statusCode).toBe(500);
    const all=await service.list(auth,{});expect(all.counts).toEqual({all:3,helpful:0,unhelpful:0,unrated:3});
    for(const result of [web,ios]){
      const detail=await service.detail(auth,result.id,true);expect(detail.run.feedback.sentiment).toBeNull();
      expect(detail.spans).toHaveLength(1);expect(detail.output).toEqual(result.response.json());
    }
    expect((await service.detail(auth,failed.response.headers['x-talent-signal-run-id'] as string)).run.status).toBe('failed');
    await expect(service.detail({...auth,userId:randomUUID()},web.id,true)).rejects.toMatchObject({statusCode:404});
    // Native JSONEncoder may reorder object keys between exact-intent retries.
    await app.inject({method:'POST',url:'/v1/chat/tasks',headers:{'x-talent-signal-platform':'web'},payload:Object.fromEntries(Object.entries(web.payload).reverse())});
    expect((await service.list(auth,{})).counts.all).toBe(3);
    expect((await service.detail(auth,web.id,true)).run.attempts).toBe(2);
  });
  it('does not exhaust the connection pool while every admitted handler owns a transaction',async()=>{
    const results=await Promise.all(Array.from({length:6},()=>app.inject({method:'POST',url:'/v1/chat/tasks',
      payload:{task_id:randomUUID(),idempotency_key:randomUUID(),objective:'Concurrent transaction',concurrent:true}})));
    expect(results.map(result=>result.statusCode)).toEqual(Array(6).fill(200));
  },30_000);
  it('retracts monitor content when canonical screenshot-followup lineage is withdrawn',async()=>{
    const fixture=await run();
    await pool!.query('INSERT INTO agent_session_retracted_tasks(account_id,task_id) VALUES($1,$2)',[auth.accountId,fixture.id]);
    const detail=await service.detail(auth,fixture.id,true);expect(detail.run.content_available).toBe(false);expect(detail.output).toBeNull();
  });
  it('saves helpful/unhelpful/withdrawal and preserves exact retry and version history',async()=>{
    const fixture=await run();let detail=await service.detail(auth,fixture.id,true);
    const operation={idempotency_key:randomUUID(),expected_revision:0,output_hash:detail.run.output_hash!,sentiment:'helpful' as const,reasons:['new_insight'],comment:'Useful',correction:'',selected_text:'tentative.\nAsk "which date"'};
    detail=await service.react(auth,fixture.id,operation,'web');expect(detail.run.feedback.revision).toBe(1);
    expect((await service.react(auth,fixture.id,operation,'web')).history).toHaveLength(1);
    await expect(service.react(auth,fixture.id,{...operation,idempotency_key:randomUUID()},'ios')).rejects.toMatchObject({code:'FEEDBACK_CHANGED'});
    detail=await service.react(auth,fixture.id,{...operation,idempotency_key:randomUUID(),expected_revision:1,sentiment:'unhelpful',reasons:['incorrect_information']},'ios');
    expect(detail.run.feedback.sentiment).toBe('unhelpful');expect(detail.history[0]!.platform).toBe('ios');
    detail=await service.react(auth,fixture.id,{...operation,idempotency_key:randomUUID(),expected_revision:2,sentiment:null,reasons:[],comment:'',selected_text:''},'web');
    expect(detail.run.feedback.sentiment).toBeNull();expect(detail.history).toHaveLength(3);
    expect(detail.history[1]!.output).toEqual(fixture.response.json());
  });
  it('hides direct screenshot content when its canonical context expires',async()=>{
    const fixture=await run('ios');
    await pool!.query(`INSERT INTO screenshot_contact_tasks(id,account_id,created_by_user_id,idempotency_key,request_hash,input_manifest,state,status)
      VALUES($1,$2,$3,$4,$5,'{}','{}','completed')`,[fixture.id,auth.accountId,auth.userId,randomUUID(),'a'.repeat(64)]);
    expect((await service.detail(auth,fixture.id,true)).run.content_available).toBe(true);
    await pool!.query("UPDATE screenshot_contact_tasks SET expires_at=now()-interval '1 second' WHERE id=$1",[fixture.id]);
    const detail=await service.detail(auth,fixture.id,true);
    expect(detail.run.content_available).toBe(false);expect(detail.output).toBeNull();expect(detail.spans).toEqual([]);
  });
  it('rejects wrong passages and invalid reason labels, and expires source content',async()=>{
    const fixture=await run();const detail=await service.detail(auth,fixture.id,true);
    const operation={idempotency_key:randomUUID(),expected_revision:0,output_hash:detail.run.output_hash!,sentiment:'helpful' as const,reasons:[],comment:'',correction:'',selected_text:'not part of this answer'};
    await expect(service.react(auth,fixture.id,operation,'web')).rejects.toMatchObject({code:'FEEDBACK_SELECTION_INVALID'});
    await expect(service.react(auth,fixture.id,{...operation,reasons:['wrong_memory']},'web')).rejects.toMatchObject({code:'FEEDBACK_REASON_INVALID'});
    await pool!.query("UPDATE product_runs SET expires_at=now()-interval '1 second' WHERE id=$1",[detail.run.id]);
    const gone=await service.detail(auth,fixture.id,true);expect(gone.output).toBeNull();expect(gone.spans).toEqual([]);expect(gone.run.content_available).toBe(false);
    await expect(service.react(auth,fixture.id,{...operation,selected_text:''},'web')).rejects.toMatchObject({code:'PRODUCT_RUN_EXPIRED'});
  });
  it('keeps newer asynchronous output, resets a rating when the answer changes, and freezes history',async()=>{
    const fixture=await run();let detail=await service.detail(auth,fixture.id,true);
    await pool!.query("UPDATE product_runs SET task_kind='screenshot' WHERE id=$1",[detail.run.id]);
    await saveProductRunOutput(pool!,{id:detail.run.id,taskID:fixture.id},{task_id:fixture.id,revision:2,summary:'First answer'},'completed');
    detail=await service.detail(auth,fixture.id,true);
    await service.react(auth,fixture.id,{idempotency_key:randomUUID(),expected_revision:0,output_hash:detail.run.output_hash!,sentiment:'helpful',reasons:[],comment:'',correction:'',selected_text:''},'web');
    await saveProductRunOutput(pool!,{id:detail.run.id,taskID:fixture.id},{task_id:fixture.id,revision:3,summary:'Revised answer'},'completed');
    await saveProductRunOutput(pool!,{id:detail.run.id,taskID:fixture.id},{task_id:fixture.id,revision:1,summary:'Stale answer'},'running');
    detail=await service.detail(auth,fixture.id,true);expect(detail.output).toMatchObject({revision:3});expect(detail.run.feedback.sentiment).toBeNull();
    expect(detail.history[0]!.output).toMatchObject({summary:'First answer'});
  });
});
