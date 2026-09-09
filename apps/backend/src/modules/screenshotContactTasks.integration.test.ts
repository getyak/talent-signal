import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { ContactResearchToolRequestSchema } from "@talent-signal/agent";
import type { ContactAgentModel, ContactChatExtraction, ScreenshotContactTaskRequest } from "@talent-signal/agent";
import { deleteContactCaptureTask, loadBrowserCaptureTask, lookupScreenshotContactReceipt, createScreenshotContactTask, ScreenshotContactTaskRunner, loadScreenshotContactTask, loadContactIntelligence, resumeScreenshotContactTask, cancelScreenshotContactTask, expireScreenshotContactTasks, loadScreenshotContactImage, confirmScreenshotContactProfile } from "./screenshotContactTasks.js";
import type { AuthContext } from "./auth.js";
import type { ChatMediaStorage } from "./chatMediaStorage.js";
import { executeGrantedContactArchive, restoreContactArchive } from "./contactArchive.js";

const database=process.env.CONTACT_AGENT_TEST_DATABASE_URL;
const pool=database?new Pool({connectionString:database,connectionTimeoutMillis:30_000,max:4,idleTimeoutMillis:0}):null;
const auth:AuthContext={accountId:"10000000-0000-4000-8000-000000000001",accountSlug:"fixture-alpha",userId:"10000000-0000-4000-8000-000000000011",userEmail:"recruiter@alpha.local",userKind:"simulated_human",sessionId:randomUUID()};
afterAll(async()=>{await pool?.end();});
// Establish the Docker transport before measuring product operations. On macOS
// the initial forwarded-port handshake can exceed the per-test operation budget.
beforeAll(async()=>{
  if(!pool)return;
  const clients=await Promise.all(Array.from({length:4},()=>pool.connect()));
  try{await Promise.all(clients.map(client=>client.query("SELECT 1")));}finally{clients.forEach(client=>client.release());}
},30_000);

function sdkModel(run: NonNullable<ContactAgentModel["run"]>): ContactAgentModel {
  return { run, extract: vi.fn(async()=>{throw new Error("UNEXPECTED_OCR_PREPASS");}),
    next: vi.fn(async()=>{throw new Error("UNEXPECTED_OUTER_MODEL_LOOP");}) };
}
const sdkReceipt = () => ({ providerRequestID:randomUUID(),model:"synthetic-sdk",inputTokens:10,outputTokens:10 });

describe.skipIf(!pool)("GET-9 SDK screenshot authority",()=>{
  it("files exact reviewed profile text through the SDK without inventing image or confirmed-profile authority",async()=>{
    const name=`SDK text ${randomUUID().slice(0,8)}`,text=`${name} works at Example Labs.`;
    const request={idempotency_key:randomUUID(),objective:"File the reviewed source",text,captured_at:new Date().toISOString(),allow_public_research:false,source:{kind:"page_text",title:"Synthetic profile",url:"https://example.com/profile"}};
    const created=await createScreenshotContactTask(pool!,auth,request);
    const model=sdkModel(async(input,signal)=>{
      expect(input.text).toBe(text);expect(input.images).toEqual([]);
      await input.recordUnderstanding([{platform:"Web",conversation_kind:"not_chat",contact_name:name,identity_clues:[{kind:"company",value:"Example Labs",source_excerpt:"Example Labs"}],messages:[],uncertainties:[]}],signal);
      await input.invoke("search_contacts",{query:name},signal);
      const filed=await input.invoke("create_contact",{display_name:name},signal) as {contact?:unknown};expect(filed.contact).toBeTruthy();
      await input.invoke("finish_contact_task",{summary:"Saved the reviewed source as proposed evidence.",findings:[],limitations:[]},signal);
      return sdkReceipt();
    });
    await new ScreenshotContactTaskRunner(pool!,{model,research:null}).start(auth,created.body.task_id);
    const done=await loadScreenshotContactTask(pool!,auth,created.body.task_id);
    expect(done.status).toBe("completed");expect(done.extraction?.messages.map(m=>m.text)).toEqual([text]);
    expect(done.source_images??[]).toEqual([]);expect(done.reviewed_profile).toBeUndefined();
    expect(done.extraction?.messages[0]?.source_image_index).toBeUndefined();
    const deleted=await deleteContactCaptureTask(pool!,auth,done.task_id,done.revision);expect(deleted.status).toBe("deleted");
  });

  it("fails closed on invented SDK text and finishes no-person text without filing",async()=>{
    for(const invented of [false,true]){
      const created=await createScreenshotContactTask(pool!,auth,{idempotency_key:randomUUID(),objective:"Read source",text:"Weather overview",captured_at:new Date().toISOString(),source:{kind:"selected_text",title:"Weather",url:""},allow_public_research:false});
      const model=sdkModel(async(input,signal)=>{
        await input.recordUnderstanding([{platform:"Web",conversation_kind:"not_chat",contact_name:invented?"Invented Person":null,identity_clues:[],messages:[],uncertainties:[]}],signal);
        return sdkReceipt();
      });
      await new ScreenshotContactTaskRunner(pool!,{model,research:null}).start(auth,created.body.task_id);
      const done=await loadScreenshotContactTask(pool!,auth,created.body.task_id);
      expect(done.status).toBe(invented?"failed":"completed");expect(done.contact).toBeNull();expect(done.capture_id).toBeNull();
      if(invented)expect(done.limitations).toContain("CONTACT_TEXT_EXTRACTION_NOT_SOURCE_GROUNDED");
      await deleteContactCaptureTask(pool!,auth,done.task_id,done.revision);
    }
  });

  it("recovers a lost image receipt by original key without another task or cross-owner access", async () => {
    const request = input();
    const created = await createScreenshotContactTask(pool!, auth, request);
    try {
      const recovered = await lookupScreenshotContactReceipt(pool!, auth, request.idempotency_key);
      expect(recovered.task_id).toBe(created.body.task_id);
      await expect(lookupScreenshotContactReceipt(pool!, {...auth, userId: randomUUID()}, request.idempotency_key)).rejects.toMatchObject({statusCode:404});
      await expect(lookupScreenshotContactReceipt(pool!, {...auth, accountId: randomUUID()}, request.idempotency_key)).rejects.toMatchObject({statusCode:404});
      const rows = await pool!.query("SELECT count(*)::int AS count FROM screenshot_contact_tasks WHERE account_id=$1 AND created_by_user_id=$2 AND idempotency_key=$3", [auth.accountId, auth.userId, request.idempotency_key]);
      expect(rows.rows[0].count).toBe(1);
      await pool!.query("UPDATE screenshot_contact_tasks SET status='deleted',state='{}',input_manifest='{}' WHERE id=$1", [created.body.task_id]);
      expect(await lookupScreenshotContactReceipt(pool!, auth, request.idempotency_key)).toEqual({task_id:created.body.task_id,status:"deleted"});
    } finally { await pool!.query("DELETE FROM screenshot_contact_tasks WHERE id=$1", [created.body.task_id]); }
  });

  it("clears deleted directory candidates and cached observations while keeping the original screenshot task resumable",async()=>{
    const person=randomUUID(),context=randomUUID(),marker=`Deleted candidate ${randomUUID()}`;
    await pool!.query("INSERT INTO subjects(id,account_id,external_ref,display_label) VALUES($1::uuid,$2,$1::text,$3)",[person,auth.accountId,marker]);
    await pool!.query("INSERT INTO assignments(id,account_id,subject_id,external_ref,display_label) VALUES($1::uuid,$2,$3,$1::text,'Synthetic context')",[context,auth.accountId,person]);
    const created=await createScreenshotContactTask(pool!,auth,input());
    const task=created.body.task_id;
    try {
      const candidate={person_id:person,relationship_context_id:context,display_name:marker,relationship_label:'Synthetic context'};
      const stored=(await pool!.query('SELECT state FROM screenshot_contact_tasks WHERE id=$1',[task])).rows[0]!.state;
      stored.response.status='waiting_for_user';stored.response.candidates=[candidate];
      stored.searches=[{query:'Synthetic',candidates:[candidate]}];stored.observations=[{tool:'search_contacts',result:{candidates:[candidate]}}];
      await pool!.query("UPDATE screenshot_contact_tasks SET state=$2::jsonb,status='waiting_for_user' WHERE id=$1",[task,JSON.stringify(stored)]);
      const before=await loadScreenshotContactTask(pool!,auth,task);expect(JSON.stringify(before)).toContain(marker);
      await pool!.query('DELETE FROM assignments WHERE id=$1',[context]);
      await pool!.query('DELETE FROM subjects WHERE id=$1',[person]);
      const after=await loadScreenshotContactTask(pool!,auth,task);
      expect(after.status).toBe('waiting_for_user');expect(after.candidates).toEqual([]);expect(after.revision).toBeGreaterThan(before.revision);
      expect(JSON.stringify(after)).not.toContain(marker);
      const current=(await pool!.query('SELECT state,input_manifest FROM screenshot_contact_tasks WHERE id=$1',[task])).rows[0]!;
      expect(current.state.searches).toEqual([]);expect(current.state.observations).toEqual([]);
      expect(current.input_manifest.image).toBeDefined();
      await expect(resumeScreenshotContactTask(pool!,auth,task,{expected_revision:before.revision,selected_person_id:person,selected_relationship_context_id:context}))
        .rejects.toMatchObject({code:'CONTACT_TASK_REVISION_CHANGED'});
      expect((await resumeScreenshotContactTask(pool!,auth,task,{expected_revision:after.revision})).status).toBe('running');
    } finally {
      await pool!.query('DELETE FROM screenshot_contact_tasks WHERE id=$1',[task]);
      await pool!.query('DELETE FROM assignments WHERE id=$1',[context]);await pool!.query('DELETE FROM subjects WHERE id=$1',[person]);
    }
  });

  it("stages an editable profile without writing a person, then reuses its confirmed account after review",async()=>{
    const name=`Profile draft ${randomUUID().slice(0,8)}`;const handle=`sdk-${randomUUID()}`;
    const profile:ContactChatExtraction={platform:"Synthetic social",conversation_kind:"not_chat",contact_name:name,
      identity_clues:[{kind:"name",value:name,source_excerpt:name},{kind:"handle",value:handle,source_excerpt:handle},
        {kind:"company",value:"Old example",source_excerpt:"Old example"}],messages:[],uncertainties:[]};
    const sdk=sdkModel(async(request,signal)=>{await request.recordUnderstanding([profile],signal);return sdkReceipt();});
    const runner=new ScreenshotContactTaskRunner(pool!,{model:sdk,research:null});
    let personID:string|undefined;
    for(let index=0;index<2;index++){
      const request={...input(),browser_source:{title:"Synthetic reviewed profile",locator:"https://example.com/profile"}};
      const created=await createScreenshotContactTask(pool!,auth,request);await runner.start(auth,created.body.task_id,request.image);
      const draft=await loadScreenshotContactTask(pool!,auth,created.body.task_id);
      expect(draft.status).toBe("waiting_for_user");expect(draft.contact).toBeNull();expect(draft.capture_id).toBeNull();
      expect(draft.contact_draft?.fields[2]?.source_excerpt).toBe("Old example");
      expect((await pool!.query("SELECT id FROM subjects WHERE account_id=$1 AND display_label=$2",[auth.accountId,name])).rowCount).toBe(index);
      const confirmation={expected_revision:draft.revision,decision:"save_reviewed_profile",display_name:name,
        fields:draft.contact_draft!.fields.map(f=>({clue_index:f.clue_index,value:f.kind==="company"?"Reviewed example":f.value}))};
      await expect(confirmScreenshotContactProfile(pool!,auth,draft.task_id,{...confirmation,expected_revision:draft.revision-1})).rejects.toMatchObject({code:"CONTACT_TASK_REVISION_CHANGED"});
      const saved=await confirmScreenshotContactProfile(pool!,auth,draft.task_id,confirmation);
      expect(saved.status).toBe("completed");expect(saved.message_count).toBe(0);expect(saved.contact_draft).toBeUndefined();
      if(index===0)personID=saved.contact!.person_id;
      expect(saved.contact!.person_id).toBe(personID);expect(saved.contact!.disposition).toBe(index?"reused":"created");
      expect(saved.extraction!.identity_clues[2]!.source_excerpt).toBe("Old example");
      expect(saved.reviewed_profile?.fields[2]).toMatchObject({value:"Reviewed example",source_excerpt:"Old example"});
      expect((await loadScreenshotContactTask(pool!,auth,saved.task_id)).reviewed_profile).toEqual(saved.reviewed_profile);
      expect((await pool!.query("SELECT input_channel,source_locator FROM source_resources WHERE account_id=$1 AND id=$2",[auth.accountId,saved.source_resource_id])).rows[0])
        .toEqual({input_channel:"browser_extension",source_locator:request.browser_source.locator});
      const stored=await pool!.query("SELECT text_content,review_status,attributed_actor,attribution_status,fragment_kind FROM evidence_fragments WHERE capture_id=$1 ORDER BY sequence",[saved.capture_id]);
      expect(stored.rows).toHaveLength(4);
      expect(stored.rows[3]).toMatchObject({text_content:"Reviewed example",review_status:"reviewed",attributed_actor:"recruiter",attribution_status:"confirmed",fragment_kind:"contact_field"});
      await expect(confirmScreenshotContactProfile(pool!,auth,draft.task_id,confirmation)).rejects.toMatchObject({code:"CONTACT_TASK_REVISION_CHANGED"});
    }
    expect((await pool!.query("SELECT id FROM subjects WHERE account_id=$1 AND display_label=$2",[auth.accountId,name])).rowCount).toBe(1);
  });

  it("keeps actual chat about a website as attributed chat evidence and rejects public references in findings", async () => {
    const name = `Chat website ${randomUUID().slice(0, 8)}`;
    const message = "The website says the launch is Friday. I will send the revised plan tomorrow.";
    const extraction: ContactChatExtraction = { platform: "Synthetic IM", conversation_kind: "direct", contact_name: name,
      identity_clues: [{kind:"name",value:name,source_excerpt:name}],
      messages: [{message_id:"m1",sequence:0,text:message,speaker_side:"left",speaker_label:name,time_text:null}], uncertainties: [] };
    const sdk = sdkModel(async (request, signal) => {
      await request.recordUnderstanding([extraction], signal);
      await request.invoke("search_contacts", {query:name}, signal);
      await request.invoke("create_contact", {display_name:name}, signal);
      const finding = {kind:"commitment",text:`${name} says the website lists Friday for launch and commits to sending the revised plan tomorrow.`,
        message_refs:["m1"],source_excerpt:message,epistemic_status:"inference"};
      await expect(request.invoke("finish_contact_task", {summary:"Synthetic chat filed.",findings:[{...finding,message_refs:["public1"]}],limitations:[]}, signal))
        .resolves.toMatchObject({error:"CONTACT_CITATION_SOURCE_UNAVAILABLE"});
      await request.invoke("finish_contact_task", {summary:"Synthetic chat filed.",findings:[finding],limitations:[]}, signal);
      return sdkReceipt();
    });
    const request=input(), created=await createScreenshotContactTask(pool!,auth,request);
    await new ScreenshotContactTaskRunner(pool!,{model:sdk,research:null}).start(auth,created.body.task_id,request.image);
    const result=await loadScreenshotContactTask(pool!,auth,created.body.task_id);
    expect(result.status).toBe("completed");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({kind:"commitment",message_refs:["m1"],source_excerpt:message,epistemic_status:"inference"});
    expect(result.events.some(event=>event.tool==="finish_contact_task"&&event.status==="denied")).toBe(true);
  });

  it("files from the main Agent image understanding and reuses one existing contact",async()=>{
    const name=`SDK reuse ${randomUUID().slice(0,8)}`;
    const original=await model(name).extract(input().image,new AbortController().signal);
    const sdk=sdkModel(async(request,signal)=>{
      expect(request.images).toHaveLength(1);
      await request.recordUnderstanding([original.extraction],signal);
      const search=await request.invoke("search_contacts",{query:name},signal) as {candidates:Array<{person_id:string;relationship_context_id:string}>};
      if(search.candidates.length){
        const candidate=search.candidates[0]!;
        const target={person_id:candidate.person_id,relationship_context_id:candidate.relationship_context_id};
        await request.invoke("read_contact",target,signal);
        await request.invoke("save_contact_chat",target,signal);
      }else await request.invoke("create_contact",{display_name:name},signal);
      await request.invoke("finish_contact_task",{summary:"Synthetic screenshot filed.",findings:[],limitations:[]},signal);
      return sdkReceipt();
    });
    const runner=new ScreenshotContactTaskRunner(pool!,{model:sdk,research:null});
    let person:string|undefined;
    for(let attempt=0;attempt<2;attempt++){
      const request={...input(),browser_source:{title:"Synthetic reviewed chat",locator:"https://example.com/chat"}};
      const created=await createScreenshotContactTask(pool!,auth,request);
      expect((await pool!.query("SELECT input_manifest->'browser_source' AS source FROM screenshot_contact_tasks WHERE account_id=$1 AND id=$2",[auth.accountId,created.body.task_id])).rows[0]?.source).toEqual(request.browser_source);
      await expect(createScreenshotContactTask(pool!,auth,{...request,browser_source:{...request.browser_source,locator:"https://example.com/other"}})).rejects.toMatchObject({code:"CONTACT_TASK_IDEMPOTENCY_CONFLICT"});
      await runner.start(auth,created.body.task_id,request.image);
      const result=await loadScreenshotContactTask(pool!,auth,created.body.task_id);
      expect(result.status,JSON.stringify(result)).toBe("completed");
      if(attempt===0)person=result.contact!.person_id;
      expect(result.contact!.person_id).toBe(person);
      expect(result.contact!.disposition).toBe(attempt===0?"created":"reused");
      expect(result.external_effects).toEqual([]);
      expect((await pool!.query("SELECT input_channel,source_locator FROM source_resources WHERE account_id=$1 AND id=$2",[auth.accountId,result.source_resource_id])).rows[0])
        .toEqual({input_channel:"browser_extension",source_locator:request.browser_source.locator});
    }
    expect(sdk.extract).not.toHaveBeenCalled();expect(sdk.next).not.toHaveBeenCalled();
  });

  it("blocks conflicting per-image identities and rejects a forced selection on resume",async()=>{
    const storage=new TestImageStorage();const request={...input(),additional_images:[input().image]};
    const first=await model("SDK Alice").extract(request.image,new AbortController().signal);
    const second=await model("SDK Bob").extract(request.image,new AbortController().signal);
    const sdk=sdkModel(async(input,signal)=>{await input.recordUnderstanding([first.extraction,second.extraction],signal);return sdkReceipt();});
    const runner=new ScreenshotContactTaskRunner(pool!,{model:sdk,research:null},storage);
    const created=await createScreenshotContactTask(pool!,auth,request,storage);await runner.start(auth,created.body.task_id);
    const waiting=await loadScreenshotContactTask(pool!,auth,created.body.task_id);
    expect(waiting.status).toBe("waiting_for_user");expect(waiting.contact).toBeNull();expect(waiting.capture_id).toBeNull();
    await expect(resumeScreenshotContactTask(pool!,auth,waiting.task_id,{expected_revision:waiting.revision,new_contact_name:"SDK Alice"})).rejects.toMatchObject({code:"CONTACT_BATCH_IDENTITY_CONFLICT"});
  });

  it("does not execute a queued contact write after SDK cancellation",async()=>{
    const name=`SDK cancel ${randomUUID().slice(0,8)}`;const request=input();
    const original=await model(name).extract(request.image,new AbortController().signal);
    const created=await createScreenshotContactTask(pool!,auth,request);
    const sdk=sdkModel(async(input,signal)=>{
      await input.recordUnderstanding([original.extraction],signal);
      await input.invoke("search_contacts",{query:name},signal);
      const lock=await pool!.connect();await lock.query("BEGIN");
      await lock.query("SELECT id FROM screenshot_contact_tasks WHERE id=$1 FOR UPDATE",[created.body.task_id]);
      const cancelled=new AbortController();
      const queued=input.invoke("create_contact",{display_name:name},cancelled.signal);
      const rejection=expect(queued).rejects.toThrow("SDK_BUDGET_CANCELLED");
      cancelled.abort(new Error("SDK_BUDGET_CANCELLED"));
      await lock.query("ROLLBACK");lock.release();await rejection;
      throw new Error("SDK_BUDGET_CANCELLED");
    });
    const runner=new ScreenshotContactTaskRunner(pool!,{model:sdk,research:null});
    await runner.start(auth,created.body.task_id,request.image);
    const final=await loadScreenshotContactTask(pool!,auth,created.body.task_id);
    expect(final.status).toBe("failed");expect(final.contact).toBeNull();expect(final.capture_id).toBeNull();
    expect((await pool!.query("SELECT id FROM subjects WHERE account_id=$1 AND display_label=$2",[auth.accountId,name])).rowCount).toBe(0);
  });
});
function input():ScreenshotContactTaskRequest{
  const bytes=Buffer.from([137,80,78,71,13,10,26,10,0]);
  return {idempotency_key:randomUUID(),objective:"File this synthetic chat and analyze the evidence.",image:{media_type:"image/png",byte_size:bytes.length,content_hash:createHash("sha256").update(bytes).digest("hex"),data_base64:bytes.toString("base64")},allow_public_research:false,captured_at:new Date().toISOString()};
}
function model(name:string,options:{badQuote?:boolean;badStatement?:boolean;group?:boolean}={}):ContactAgentModel{
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
    else if(options.badStatement&&!attemptedBad){attemptedBad=true;call={name:"update_contact",arguments:{person_id:s.contact.person_id,fields:[{field:"company",value:"Example Labs",source_refs:["m1"],source_excerpt:"I work at Example Labs.",epistemic_status:"source_statement"},{field:"professional_background",value:"Led engineering at Example Labs",source_refs:["m1"],source_excerpt:"I work at Example Labs.",epistemic_status:"source_statement"}]}};}
    else if(options.badQuote&&!attemptedBad){attemptedBad=true;call={name:"update_contact",arguments:{person_id:s.contact.person_id,fields:[{field:"company",value:"Invented Ltd",source_refs:["m1"],source_excerpt:"I work at Invented Ltd",epistemic_status:"source_statement"}]}};}
    else if(!s.profile_fields.length)call={name:"update_contact",arguments:{person_id:s.contact.person_id,fields:[{field:"company",value:"Example Labs",source_refs:["m1"],source_excerpt:"I work at Example Labs.",epistemic_status:"source_statement"}]}};
    else call={name:"finish_contact_task",arguments:{summary:"Saved the chat. A call is possible, but its date needs clarification.",findings:[{kind:"open_question",text:"Confirm which Tuesday before scheduling.",message_refs:["m1"],source_excerpt:"I can talk next Tuesday.",epistemic_status:"inference"}],limitations:[]}};
    return {calls:[{id:randomUUID(),...call}],providerRequestID:randomUUID(),model:"fixture-tools",inputTokens:10,outputTokens:10};
  }};
}
describe.skipIf(!pool)("screenshot contact database authority",()=>{
  it("rejects non-literal source statements atomically and recovers with source wording",async()=>{
    const request=input(), created=await createScreenshotContactTask(pool!,auth,request);
    const base=model(`Literal ${randomUUID().slice(0,8)}`,{badStatement:true});let rejectedBatchChecked=false;
    const checked:ContactAgentModel={...base,next:async(arg,signal)=>{
      if(!rejectedBatchChecked&&JSON.stringify(arg.observations).includes("CONTACT_SOURCE_STATEMENT_REQUIRES_LITERAL_VALUE")){
        rejectedBatchChecked=true;
        expect((await pool!.query("SELECT id FROM contact_profile_observations WHERE account_id=$1 AND task_id=$2",[auth.accountId,created.body.task_id])).rowCount).toBe(0);
        expect((arg.state as {profile_fields:unknown[]}).profile_fields).toEqual([]);
      }
      return base.next(arg,signal);
    }};
    await new ScreenshotContactTaskRunner(pool!,{model:checked,research:null}).start(auth,created.body.task_id,request.image);
    expect(rejectedBatchChecked).toBe(true);
    const result=await loadScreenshotContactTask(pool!,auth,created.body.task_id);
    expect(result.status).toBe("completed");
    expect(result.profile_fields.map(field=>[field.value,field.epistemic_status])).toEqual([["Example Labs","source_statement"]]);
    expect(result.events.some(event=>event.tool==="update_contact"&&event.status==="denied")).toBe(true);
    const rows=await pool!.query("SELECT observation FROM contact_profile_observations WHERE account_id=$1 AND task_id=$2",[auth.accountId,created.body.task_id]);
    expect(rows.rows.map(row=>row.observation.value)).toEqual(["Example Labs"]);
    expect(JSON.stringify((await pool!.query("SELECT state FROM screenshot_contact_tasks WHERE id=$1",[created.body.task_id])).rows[0].state.observations)).toContain("CONTACT_SOURCE_STATEMENT_REQUIRES_LITERAL_VALUE");
  });

  it("preserves an explicitly labeled supported paraphrase without calling it source wording",async()=>{
    const request=input(),created=await createScreenshotContactTask(pool!,auth,request),base=model(`Paraphrase ${randomUUID().slice(0,8)}`);
    const inferred:ContactAgentModel={...base,next:async(arg,signal)=>{
      const reply=await base.next(arg,signal);
      const call=reply.calls[0];
      if(call?.name==="update_contact")call.arguments={person_id:(arg.state as {contact:{person_id:string}}).contact.person_id,fields:[{field:"professional_background",value:"Reports employment at Example Labs; role is unspecified.",source_refs:["m1"],source_excerpt:"I work at Example Labs.",epistemic_status:"inference"}]};
      return reply;
    }};
    await new ScreenshotContactTaskRunner(pool!,{model:inferred,research:null}).start(auth,created.body.task_id,request.image);
    const result=await loadScreenshotContactTask(pool!,auth,created.body.task_id);
    expect(result.status).toBe("completed");expect(result.profile_fields[0]?.epistemic_status).toBe("inference");
    expect(result.profile_fields[0]?.value).toBe("Reports employment at Example Labs; role is unspecified.");
  });

  it("files reviewed web text with provenance, reconciles duplicates, survives a new runner, and deletes derivatives",async()=>{
    const name=`Web capture proof ${randomUUID().slice(0,8)}`;
    const requestID=randomUUID();const raw=`${name} · Example Labs. I work at Example Labs. I can talk next Tuesday.`;
    const request={idempotency_key:`browser-capture:${requestID}`,objective:"File this source",text:raw,allow_public_research:false,captured_at:new Date().toISOString(),source:{kind:"page_text",title:"Synthetic professional profile",url:"https://example.com/people/synthetic",time_basis:"captured_at"}};
    const base=model(name);
    const provider:ContactAgentModel={...base,extractText:async()=>{
      const result=await base.extract(input().image,new AbortController().signal);
      return {...result,extraction:{...result.extraction,conversation_kind:"not_chat",identity_clues:[...result.extraction.identity_clues,{kind:"company",value:"Example Labs",source_excerpt:"Example Labs"}]}};
    }};
    const created=await createScreenshotContactTask(pool!,auth,request);
    const receipt=await loadBrowserCaptureTask(pool!,auth,requestID);expect(receipt.task_id).toBe(created.body.task_id);expect(receipt.source_text).toBe(raw);
    const runner=new ScreenshotContactTaskRunner(pool!,{model:provider,research:null});await runner.start(auth,receipt.task_id);
    const done=await loadScreenshotContactTask(pool!,auth,receipt.task_id);expect(done.status).toBe("completed");expect(done.contact?.disposition).toBe("created");expect(done.source?.url).toBe(request.source.url);
    const replay=await createScreenshotContactTask(pool!,auth,request);expect(replay.replayed).toBe(true);expect(replay.body.contact).toEqual(done.contact);
    await expect(createScreenshotContactTask(pool!,auth,{...request,text:"Changed source"})).rejects.toMatchObject({code:"CONTACT_TASK_IDEMPOTENCY_CONFLICT"});
    await expect(loadBrowserCaptureTask(pool!,{...auth,userId:randomUUID()},requestID)).rejects.toMatchObject({code:"CONTACT_TASK_NOT_FOUND"});
    const deleted=await deleteContactCaptureTask(pool!,auth,done.task_id,done.revision);expect(deleted.status).toBe("deleted");expect(deleted.source_text).toBeUndefined();
    const stored=await pool!.query("SELECT state,input_manifest FROM screenshot_contact_tasks WHERE id=$1",[done.task_id]);expect(stored.rows).toEqual([{state:{},input_manifest:{}}]);
    expect((await pool!.query("SELECT status FROM subjects WHERE id=$1",[done.contact!.person_id])).rows[0].status).toBe("deleted");
    await expect(createScreenshotContactTask(pool!,auth,request)).rejects.toMatchObject({code:"CONTACT_TASK_SOURCE_UNAVAILABLE"});
  });
  it("records a no-person result without creating a person and can delete an unbound source",async()=>{
    const base=model("Must not create");const provider:ContactAgentModel={...base,extractText:async()=>({extraction:{platform:"Web",conversation_kind:"not_chat",contact_name:null,identity_clues:[],messages:[],uncertainties:[]},model:"fixture-text",providerRequestID:randomUUID(),inputTokens:1,outputTokens:1}),next:async()=>{throw new Error("No person must not run filing tools");}};
    const task=await createScreenshotContactTask(pool!,auth,{idempotency_key:randomUUID(),text:"A page about weather.",objective:"Read this page",source:{kind:"page_text",title:"Weather",url:"https://example.com/weather"},allow_public_research:false,captured_at:new Date().toISOString()});
    await new ScreenshotContactTaskRunner(pool!,{model:provider,research:null}).start(auth,task.body.task_id);
    const done=await loadScreenshotContactTask(pool!,auth,task.body.task_id);expect(done.status).toBe("completed");expect(done.contact).toBeNull();expect(done.capture_id).toBeNull();
    expect((await deleteContactCaptureTask(pool!,auth,done.task_id,done.revision)).status).toBe("deleted");
  });
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
