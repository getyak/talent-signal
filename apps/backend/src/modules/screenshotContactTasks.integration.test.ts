import { afterAll, describe, expect, it } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { ContactResearchToolRequestSchema } from "@talent-signal/agent";
import type { ContactAgentModel, ContactChatExtraction, ScreenshotContactTaskRequest } from "@talent-signal/agent";
import { createScreenshotContactTask, ScreenshotContactTaskRunner, loadScreenshotContactTask, loadContactIntelligence, resumeScreenshotContactTask, cancelScreenshotContactTask, expireScreenshotContactTasks, loadScreenshotContactImage } from "./screenshotContactTasks.js";
import type { AuthContext } from "./auth.js";
import type { ChatMediaStorage } from "./chatMediaStorage.js";
import { executeGrantedContactArchive, restoreContactArchive } from "./contactArchive.js";

const database=process.env.CONTACT_AGENT_TEST_DATABASE_URL;
const pool=database?new Pool({connectionString:database}):null;
const auth:AuthContext={accountId:"10000000-0000-4000-8000-000000000001",accountSlug:"fixture-alpha",userId:"10000000-0000-4000-8000-000000000011",userEmail:"recruiter@alpha.local",userKind:"simulated_human",sessionId:randomUUID()};
afterAll(async()=>{await pool?.end();});
function input():ScreenshotContactTaskRequest{
  const bytes=Buffer.from([137,80,78,71,13,10,26,10,0]);
  return {idempotency_key:randomUUID(),objective:"File this synthetic chat and analyze the evidence.",image:{media_type:"image/png",byte_size:bytes.length,content_hash:createHash("sha256").update(bytes).digest("hex"),data_base64:bytes.toString("base64")},allow_public_research:false,captured_at:new Date().toISOString()};
}
function model(name:string,options:{badQuote?:boolean;group?:boolean}={}):ContactAgentModel{
  let attemptedBad=false;
  const extraction:ContactChatExtraction={platform:"Synthetic IM",conversation_kind:options.group?"group":"direct",contact_name:name,
    identity_clues:[{kind:"name",value:name,source_excerpt:name}],messages:[{message_id:"m1",sequence:0,text:"I work at Example Labs. I can talk next Tuesday.",speaker_side:"left",speaker_label:null,time_text:null}],uncertainties:["Message date and speaker role are unknown."]};
  return {extract:async()=>({extraction,model:"fixture-vision",providerRequestID:randomUUID(),inputTokens:10,outputTokens:10}),next:async({state,observations})=>{
    const s=state as {contact:{person_id:string;relationship_context_id:string}|null;capture_id:string|null;profile_fields:unknown[]};
    let call:{name:string;arguments:unknown};
    const search=observations.findLast(o=>o.tool==="search_contacts")?.result as {candidates:Array<{person_id:string;relationship_context_id:string}>}|undefined;
    if(options.group)call={name:"ask_contact_clarification",arguments:{question:"Which participant should own this group chat?"}};
    else if(!search)call={name:"search_contacts",arguments:{query:name}};
    else if(!s.contact&&search.candidates.length>1)call={name:"ask_contact_clarification",arguments:{question:"Which contact is this?"}};
    else if(!s.contact&&search.candidates.length===1)call={name:"read_contact",arguments:{person_id:search.candidates[0]!.person_id,relationship_context_id:search.candidates[0]!.relationship_context_id}};
    else if(!s.contact)call={name:"create_contact",arguments:{display_name:name}};
    else if(!s.capture_id)call={name:"save_contact_chat",arguments:{person_id:s.contact.person_id,relationship_context_id:s.contact.relationship_context_id}};
    else if(options.badQuote&&!attemptedBad){attemptedBad=true;call={name:"update_contact",arguments:{person_id:s.contact.person_id,fields:[{field:"company",value:"Invented Ltd",source_refs:["m1"],source_excerpt:"I work at Invented Ltd",epistemic_status:"source_statement"}]}};}
    else if(!s.profile_fields.length)call={name:"update_contact",arguments:{person_id:s.contact.person_id,fields:[{field:"company",value:"Example Labs",source_refs:["m1"],source_excerpt:"I work at Example Labs.",epistemic_status:"source_statement"}]}};
    else call={name:"finish_contact_task",arguments:{summary:"Saved the chat. A call is possible, but its date needs clarification.",findings:[{kind:"open_question",text:"Confirm which Tuesday before scheduling.",message_refs:["m1"],source_excerpt:"I can talk next Tuesday.",epistemic_status:"inference"}],limitations:[]}};
    return {calls:[{id:randomUUID(),...call}],providerRequestID:randomUUID(),model:"fixture-tools",inputTokens:10,outputTokens:10};
  }};
}
describe.skipIf(!pool)("screenshot contact database authority",()=>{
  it("creates one contact and exact unreviewed IM, reuses it on a second import, and does not replay writes",async()=>{
    const name=`Contact proof ${randomUUID().slice(0,8)}`;const request=input();
    const runner=new ScreenshotContactTaskRunner(pool!,{model:model(name),research:null});
    const first=await createScreenshotContactTask(pool!,auth,request);await runner.start(auth,first.body.task_id,request.image);
    const result=await loadScreenshotContactTask(pool!,auth,first.body.task_id);
    expect(result.status,JSON.stringify(result)).toBe("completed");expect(result.contact?.disposition).toBe("created");expect(result.message_count).toBe(1);
    const fragments=await pool!.query("SELECT text_content,review_status,attributed_actor,attribution_status FROM evidence_fragments WHERE capture_id=$1",[result.capture_id]);
    expect(fragments.rows).toEqual([{text_content:"I work at Example Labs. I can talk next Tuesday.",review_status:"proposed",attributed_actor:"unknown",attribution_status:"unknown"}]);
    const retention=await pool!.query("SELECT source_scope FROM source_retention_receipts WHERE capture_id=$1",[result.capture_id]);
    expect(retention.rows).toEqual([{source_scope:"proposed_extracted_text"}]);
    const retry=await createScreenshotContactTask(pool!,auth,request);expect(retry.replayed).toBe(true);expect(retry.body.contact?.person_id).toBe(result.contact?.person_id);
    const secondInput=input();const second=await createScreenshotContactTask(pool!,auth,secondInput);await runner.start(auth,second.body.task_id,secondInput.image);
    const reused=await loadScreenshotContactTask(pool!,auth,second.body.task_id);
    expect(reused.status,JSON.stringify(reused)).toBe("completed");expect(reused.contact?.person_id).toBe(result.contact?.person_id);expect(reused.contact?.disposition).toBe("reused");
    const profile=await loadContactIntelligence(pool!,auth,result.contact!.person_id,result.contact!.relationship_context_id);expect(profile.tasks).toHaveLength(2);
    expect((await pool!.query("SELECT * FROM person_profiles WHERE subject_id=$1",[result.contact?.person_id])).rowCount).toBe(0);
    await expect(loadScreenshotContactTask(pool!,{...auth,accountId:"20000000-0000-4000-8000-000000000001",userId:"20000000-0000-4000-8000-000000000011"},first.body.task_id)).rejects.toMatchObject({code:"CONTACT_TASK_NOT_FOUND"});
    await expect(createScreenshotContactTask(pool!,auth,{...request,objective:"Changed intent"})).rejects.toMatchObject({code:"CONTACT_TASK_IDEMPOTENCY_CONFLICT"});
  });
  it("rejects invented quotations and erases task and profile derivatives when source authorization is revoked",async()=>{
    const request=input();const runner=new ScreenshotContactTaskRunner(pool!,{model:model(`Citation proof ${randomUUID().slice(0,8)}`,{badQuote:true}),research:null});
    const created=await createScreenshotContactTask(pool!,auth,request);await runner.start(auth,created.body.task_id,request.image);
    const before=await loadScreenshotContactTask(pool!,auth,created.body.task_id);
    expect(before.profile_fields.map(f=>f.value)).toEqual(["Example Labs"]);expect(before.events.some(e=>e.tool==="update_contact"&&e.status==="denied")).toBe(true);
    await pool!.query("UPDATE source_retention_receipts SET authorization_state='revoked' WHERE capture_id=$1",[before.capture_id]);
    const after=await loadScreenshotContactTask(pool!,auth,created.body.task_id);expect(after.status).toBe("deleted");expect(after.extraction).toBeNull();
    expect((await pool!.query("SELECT * FROM contact_profile_observations WHERE task_id=$1",[created.body.task_id])).rowCount).toBe(0);
    const persisted=await pool!.query("SELECT state,input_manifest FROM screenshot_contact_tasks WHERE id=$1",[created.body.task_id]);expect(persisted.rows).toEqual([{state:{},input_manifest:{}}]);
  });
  it("keeps group-chat ambiguity in the same task without creating a contact",async()=>{
    const request=input();const name=`Group proof ${randomUUID().slice(0,8)}`;const runner=new ScreenshotContactTaskRunner(pool!,{model:model(name,{group:true}),research:null});
    const created=await createScreenshotContactTask(pool!,auth,request);await runner.start(auth,created.body.task_id,request.image);
    const result=await loadScreenshotContactTask(pool!,auth,created.body.task_id);expect(result.status).toBe("waiting_for_user");expect(result.capture_id).toBeNull();expect(result.contact).toBeNull();
  });
  it("archives only the granted current contact, supports reversal, and retracts rejected source derivatives",async()=>{
    const request=input();const runner=new ScreenshotContactTaskRunner(pool!,{model:model(`Archive proof ${randomUUID().slice(0,8)}`),research:null});
    const created=await createScreenshotContactTask(pool!,auth,request);await runner.start(auth,created.body.task_id,request.image);
    const task=await loadScreenshotContactTask(pool!,auth,created.body.task_id);expect(task.status,JSON.stringify(task)).toBe("completed");
    await expect(executeGrantedContactArchive(pool!,auth,{person_id:task.contact!.person_id,expected_revision:99,idempotency_key:randomUUID(),decision:"archive"})).rejects.toMatchObject({code:"CONTACT_ARCHIVE_TARGET_CHANGED"});
    const current=await loadContactIntelligence(pool!,auth,task.contact!.person_id,task.contact!.relationship_context_id);
    const archived=await executeGrantedContactArchive(pool!,auth,{person_id:task.contact!.person_id,expected_revision:current.person_revision!,idempotency_key:randomUUID(),decision:"archive"});
    expect((await loadScreenshotContactTask(pool!,auth,created.body.task_id)).status).toBe("deleted");
    const archivedReadback=await loadContactIntelligence(pool!,auth,task.contact!.person_id,task.contact!.relationship_context_id);
    expect(archivedReadback.tasks).toEqual([]);expect(archivedReadback.archive?.operation_id).toBe(archived.operation_id);
    await restoreContactArchive(pool!,auth,archived.operation_id);
    expect((await loadScreenshotContactTask(pool!,auth,created.body.task_id)).contact?.person_id).toBe(task.contact!.person_id);
    await pool!.query("UPDATE evidence_fragments SET review_status='rejected' WHERE capture_id=$1",[task.capture_id]);
    expect((await loadScreenshotContactTask(pool!,auth,created.body.task_id)).extraction).toBeNull();
    expect((await pool!.query("SELECT * FROM contact_profile_observations WHERE task_id=$1",[task.task_id])).rowCount).toBe(0);
  });
  it("recovers an uncheckpointed image only with the same bytes and fences an in-flight cancelled call",async()=>{
    const request=input();const real=model(`Recovery proof ${randomUUID().slice(0,8)}`);
    const created=await createScreenshotContactTask(pool!,auth,request);
    const runner=new ScreenshotContactTaskRunner(pool!,{model:real,research:null});
    await runner.start(auth,created.body.task_id);
    const waiting=await loadScreenshotContactTask(pool!,auth,created.body.task_id);
    expect(waiting.status).toBe("waiting_for_user");expect(waiting.capture_id).toBeNull();
    const different=input();different.image.data_base64=Buffer.from([137,80,78,71,13,10,26,10,1]).toString("base64");different.image.content_hash=createHash("sha256").update(Buffer.from(different.image.data_base64,"base64")).digest("hex");
    await expect(resumeScreenshotContactTask(pool!,auth,waiting.task_id,{expected_revision:waiting.revision,image:different.image})).rejects.toMatchObject({code:"CONTACT_IMAGE_INTEGRITY_MISMATCH"});
    await resumeScreenshotContactTask(pool!,auth,waiting.task_id,{expected_revision:waiting.revision,image:request.image});
    let release!:()=>void;let reached!:()=>void;
    const paused=new Promise<void>(r=>{release=r;});const entered=new Promise<void>(r=>{reached=r;});
    const slow:ContactAgentModel={...real,extract:async(...args)=>{reached();await paused;return real.extract(...args);}};
    const slowRunner=new ScreenshotContactTaskRunner(pool!,{model:slow,research:null});
    const running=slowRunner.start(auth,waiting.task_id,request.image);await entered;
    const current=await loadScreenshotContactTask(pool!,auth,waiting.task_id);
    await cancelScreenshotContactTask(pool!,auth,current.task_id,current.revision);release();await running;
    const cancelled=await loadScreenshotContactTask(pool!,auth,current.task_id);expect(cancelled.status).toBe("cancelled");expect(cancelled.capture_id).toBeNull();expect(cancelled.extraction).toBeNull();
    await resumeScreenshotContactTask(pool!,auth,cancelled.task_id,{expected_revision:cancelled.revision,image:request.image});
    await runner.start(auth,cancelled.task_id,request.image);
    expect((await loadScreenshotContactTask(pool!,auth,cancelled.task_id)).status).toBe("completed");
  });
  it("rejects model-requested deletion and private search without dispatch, then completes useful authorized work",async()=>{
    const request={...input(),allow_public_research:true};const base=model(`Injection proof ${randomUUID().slice(0,8)}`);let step=0;let dispatches=0;
    const injected:ContactAgentModel={...base,next:async(arg,signal)=>{
      const state=arg.state as {capture_id:string|null;contact:{person_id:string}|null};
      if(state.capture_id&&step<2){const call=step++===0?{name:"delete_contact",arguments:{person_id:state.contact!.person_id}}:{name:"search_contact_public",arguments:{channel:"web",query:"I can talk next Tuesday private salary 100000"}};
        return {calls:[{id:randomUUID(),...call}],model:"fixture-tools",providerRequestID:randomUUID(),inputTokens:1,outputTokens:1};}
      return base.next(arg,signal);
    }};
    const runner=new ScreenshotContactTaskRunner(pool!,{model:injected,research:{execute:async()=>{dispatches++;throw new Error("UNEXPECTED_DISPATCH");}}});
    const created=await createScreenshotContactTask(pool!,auth,request);await runner.start(auth,created.body.task_id,request.image);
    const result=await loadScreenshotContactTask(pool!,auth,created.body.task_id);
    expect(result.status,JSON.stringify(result)).toBe("completed");expect(dispatches).toBe(0);
    expect(result.events.filter(e=>e.status==="denied").map(e=>e.tool)).toEqual(["delete_contact","search_contact_public"]);
    expect((await pool!.query("SELECT status FROM subjects WHERE id=$1",[result.contact!.person_id])).rows[0].status).toBe("active");
    await pool!.query("UPDATE screenshot_contact_tasks SET expires_at=now()-interval '1 second' WHERE id=$1",[result.task_id]);
    await expireScreenshotContactTasks(pool!);
    const expired=await loadScreenshotContactTask(pool!,auth,result.task_id);expect(expired.status).toBe("deleted");expect(expired.profile_fields).toEqual([]);
    expect((await pool!.query("SELECT state,input_manifest FROM screenshot_contact_tasks WHERE id=$1",[result.task_id])).rows[0]).toEqual({state:{},input_manifest:{}});
  });

  it("resolves short source references to fetched provenance and stores the canonical URL without treating its metadata as body text",async()=>{
    const name=`Public proof ${randomUUID().slice(0,8)}`;const request={...input(),allow_public_research:true};const base=model(name);let stage=0;
    const sourceID=createHash("sha256").update("exa:https://www.linkedin.com/in/contact-proof").digest("hex");
    const publicModel:ContactAgentModel={...base,extract:async(...args)=>{const result=await base.extract(...args);result.extraction.identity_clues.push({kind:"profile_url",value:"https://www.linkedin.com/in/contact-proof",source_excerpt:"https://www.linkedin.com/in/contact-proof"});return result;},next:async(arg,signal)=>{
      const state=arg.state as {capture_id:string|null;contact:{person_id:string}|null;profile_fields:unknown[]};
      if(state.capture_id&&stage<3){const steps=[{name:"search_contact_public",arguments:{channel:"linkedin",query:name}},
        {name:"fetch_contact_source",arguments:{source_id:"public1"}},
        {name:"update_contact",arguments:{person_id:state.contact!.person_id,fields:[{field:"public_profile",value:"https://linkedin.com/in/contact-proof/ — professional profile",source_refs:["public1"],source_excerpt:"Founder at Example Labs.",epistemic_status:"source_statement"}]}}];
        return {calls:[{id:randomUUID(),...steps[stage++]!}],model:"fixture-tools",providerRequestID:randomUUID(),inputTokens:1,outputTokens:1};}
      return base.next(arg,signal);
    }};
    const runner=new ScreenshotContactTaskRunner(pool!,{model:publicModel,research:{execute:async(unparsed)=>{const input=ContactResearchToolRequestSchema.parse(unparsed);return {contract_version:input.contract_version,task_id:input.task_id,call_id:input.call_id,external_effects:[],sources:[{source_id:sourceID,url:"https://www.linkedin.com/in/contact-proof",title:name,text:"Founder at Example Labs.",channel:"linkedin",provider_id:"exa",provider_request_id:"fixture-public",content_hash:"a".repeat(64),retrieved_at:new Date().toISOString(),stage:input.input.operation==="fetch"?"fetched":"discovered"}]};}}});
    const created=await createScreenshotContactTask(pool!,auth,request);await runner.start(auth,created.body.task_id,request.image);
    const result=await loadScreenshotContactTask(pool!,auth,created.body.task_id);expect(result.status,JSON.stringify(result)).toBe("completed");
    expect(result.profile_fields).toEqual([{field:"public_profile",value:"https://www.linkedin.com/in/contact-proof",source_refs:[sourceID],source_excerpt:"Founder at Example Labs.",epistemic_status:"source_statement"}]);
  });

});

class TestImageStorage implements ChatMediaStorage {
  readonly provider="local" as const;
  readonly labScopeID=randomUUID();
  readonly objects=new Map<string,Uint8Array>();
  puts=0; failPutAt=0; failPurge=false;
  async put(key:string,body:Uint8Array){this.puts++;if(this.puts===this.failPutAt)throw new Error("TEST_UPLOAD_FAILED");this.objects.set(key,body);}
  async get(key:string,contentType:string){const body=this.objects.get(key);if(!body)throw new Error("TEST_MISSING_IMAGE");return {body,contentType};}
  async delete(key:string){this.objects.delete(key);}
  async purge(key:string){if(this.failPurge)throw new Error("TEST_PURGE_FAILED");await this.delete(key);}
}

describe.skipIf(!pool)("durable multi-image contact sources",()=>{
  it("reconciles a partial upload, survives extraction interruption, and reads each scoped original",async()=>{
    const storage=new TestImageStorage();storage.failPutAt=2;
    const request={...input(),additional_images:[input().image]};
    await expect(createScreenshotContactTask(pool!,auth,request,storage)).rejects.toMatchObject({code:"CONTACT_IMAGE_UPLOAD_FAILED"});
    expect(storage.objects.size).toBe(1);
    const created=await createScreenshotContactTask(pool!,auth,request,storage);
    expect(created.replayed).toBe(true);expect(storage.puts).toBe(3);expect(storage.objects.size).toBe(2);
    const repeated=await createScreenshotContactTask(pool!,auth,request,storage);
    expect(repeated.body.task_id).toBe(created.body.task_id);expect(storage.puts).toBe(3);
    const base=model(`Batch proof ${randomUUID().slice(0,8)}`);let calls=0;
    const flaky:ContactAgentModel={...base,extract:async(...args)=>{if(++calls===2)throw new Error("TEST_VISION_INTERRUPTED");return base.extract(...args);}};
    const runner=new ScreenshotContactTaskRunner(pool!,{model:flaky,research:null},storage);
    await runner.start(auth,created.body.task_id);
    const failed=await loadScreenshotContactTask(pool!,auth,created.body.task_id);
    expect(failed.status).toBe("failed");expect(failed.extraction).toBeNull();
    await resumeScreenshotContactTask(pool!,auth,failed.task_id,{expected_revision:failed.revision});
    await runner.start(auth,failed.task_id);
    const result=await loadScreenshotContactTask(pool!,auth,failed.task_id);
    expect(result.status,JSON.stringify(result)).toBe("completed");expect(calls).toBe(3);expect(result.message_count).toBe(2);
    expect(result.extraction?.messages.map(m=>[m.message_id,m.source_image_index])).toEqual([["m1",0],["m2",1]]);
    const persisted=await pool!.query("SELECT input_manifest,state FROM screenshot_contact_tasks WHERE id=$1",[result.task_id]);
    expect(JSON.stringify(persisted.rows)).not.toContain("data_base64");
    expect(await loadScreenshotContactImage(pool!,auth,result.task_id,1,storage)).toEqual(request.additional_images[0]);
    await expect(loadScreenshotContactImage(pool!,{...auth,userId:randomUUID()},result.task_id,1,storage)).rejects.toMatchObject({code:"CONTACT_TASK_NOT_FOUND"});
    await expect(loadScreenshotContactImage(pool!,auth,result.task_id,1,new TestImageStorage())).rejects.toThrow("CONTACT_IMAGE_STORAGE_MISMATCH");
    await pool!.query("UPDATE source_retention_receipts SET authorization_state='revoked' WHERE capture_id=$1",[result.capture_id]);
    await expect(loadScreenshotContactImage(pool!,auth,result.task_id,0,storage)).rejects.toMatchObject({code:"CONTACT_TASK_SOURCE_UNAVAILABLE"});
    storage.failPurge=true;
    await expect(expireScreenshotContactTasks(pool!,storage)).rejects.toThrow("CONTACT_IMAGE_PURGE_INCOMPLETE");
    expect(storage.objects.size).toBe(2);
    storage.failPurge=false;await expireScreenshotContactTasks(pool!,storage);
    expect(storage.objects.size).toBe(0);
    expect((await pool!.query("SELECT status FROM contact_task_images WHERE task_id=$1",[result.task_id])).rows).toEqual([{status:"deleted"},{status:"deleted"}]);
  });
  it("does not let contact selection override conflicting batch identities and expires unfiled originals",async()=>{
    const storage=new TestImageStorage();const request={...input(),additional_images:[input().image]};
    const created=await createScreenshotContactTask(pool!,auth,request,storage);let count=0;
    const base=model(`Different proof ${randomUUID().slice(0,8)}`);
    const runner=new ScreenshotContactTaskRunner(pool!,{research:null,model:{...base,extract:async(...args)=>{
      const output=await base.extract(...args);return {...output,extraction:{...output.extraction,contact_name:`Different ${++count}`}};
    }}},storage);
    await runner.start(auth,created.body.task_id);
    const waiting=await loadScreenshotContactTask(pool!,auth,created.body.task_id);
    expect(waiting.status).toBe("waiting_for_user");expect(waiting.contact).toBeNull();
    await expect(resumeScreenshotContactTask(pool!,auth,waiting.task_id,{expected_revision:waiting.revision,new_contact_name:"Different 1"})).rejects.toMatchObject({code:"CONTACT_BATCH_IDENTITY_CONFLICT"});
    await pool!.query("UPDATE screenshot_contact_tasks SET expires_at=now()-interval '1 second' WHERE id=$1",[waiting.task_id]);
    await expireScreenshotContactTasks(pool!,storage);expect(storage.objects.size).toBe(0);
  });
});
