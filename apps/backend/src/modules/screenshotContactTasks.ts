import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import {
  CONTACT_INTAKE_TOOLS, CONTACT_RESEARCH_CONTRACT, ContactProfileFieldSchema,
  ScreenshotContactTaskRequestSchema, ScreenshotContactTaskResponseSchema,
  ZhipuContactAgentModel,
  type ContactAgentModel, type ContactAgentToolCall, type ContactIntakeToolName,
  type ContactPublicSource, type ContactProfileField,
  type ScreenshotContactTaskRequest, type ScreenshotContactTaskResponse,
} from "@talent-signal/agent";
import { CONTRACT_VERSION, type ResourceCaptureRequest } from "@talent-signal/contracts";
import { inTransaction } from "../database/pool.js";
import { ApiError } from "../lib/apiError.js";
import { appendAudit } from "../lib/audit.js";
import type { AuthContext } from "./auth.js";
import { searchPeople, getRelationshipScope } from "./people.js";
import { createResourceCaptureInTransaction } from "./resourceIntake.js";
import type { ChatMediaStorage } from "./chatMediaStorage.js";
import { contactImages, validateContactImage, reserveContactImages, persistContactImages, readContactImage, purgeExpiredContactImages, type ContactImageManifest } from "./contactTaskImages.js";
import { mergeContactExtractions } from "./mergeContactExtractions.js";
import { LocalContactResearchClient, type ContactResearchClient } from "./contactResearchClient.js";

type Response = ScreenshotContactTaskResponse;
type Manifest = Omit<ScreenshotContactTaskRequest, "image" | "additional_images"> & { image: ContactImageManifest; additional_images?: ContactImageManifest[] };
interface TaskState {
  extraction_parts?: NonNullable<Response["extraction"]>[];
  batch_conflict?: boolean;
  response: Response;
  searches: Array<{ query: string; candidates: Response["candidates"] }>;
  observations: Array<{ tool: string; result: unknown }>;
  model_receipts: Array<{ model: string; request_id: string; input_tokens: number; output_tokens: number }>;
  turns: number;
  tokens: number;
  selected: { person_id: string; relationship_context_id: string } | null;
  pending_research: string | null;
  user_contact_label?: string;
}
interface Row {
  id: string; account_id: string; created_by_user_id: string; request_hash: string;
  input_manifest: Manifest; state: TaskState; status: Response["status"];
  revision: number; lease_epoch: number; expires_at: Date;
  capture_id: string | null; subject_id: string | null;
  created_at: Date; updated_at: Date;
}
export interface ScreenshotContactDependencies { model: ContactAgentModel; research: ContactResearchClient | null }
const digest = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const normalized = (value: string) => value.normalize("NFKC").toLocaleLowerCase().trim();
function deny(code: string): never { throw new ApiError(409, code, code); }
function codeOf(error: unknown): string {
  if (error instanceof ApiError) return error.code;
  return error instanceof Error && /^[A-Z][A-Z0-9_]+$/u.test(error.message)
    ? error.message : "CONTACT_TASK_OPERATION_FAILED";
}
function terminalResponse(row: Row, status: Response["status"]): Response {
  return { task_id: row.id,revision: row.revision,status,contact:null,capture_id:null,source_resource_id:null,
    message_count:0,extraction:null,summary:"",findings:[],profile_fields:[],public_sources:[],question:null,
    candidates:[],limitations:[],events:[],external_effects:[],created_at:row.created_at.toISOString(),updated_at:row.updated_at.toISOString() };
}

async function rowFor(client: Pool | PoolClient, auth: AuthContext, id: string, lock = false): Promise<Row> {
  const result = await client.query<Row>(`SELECT * FROM screenshot_contact_tasks
    WHERE account_id=$1 AND id=$2 AND created_by_user_id=$3 ${lock ? "FOR UPDATE" : ""}`, [auth.accountId,id,auth.userId]);
  if (!result.rows[0]) throw new ApiError(404,"CONTACT_TASK_NOT_FOUND","Contact task not found.");
  return result.rows[0];
}

async function assertSourceCurrent(client: Pool | PoolClient, row: Row): Promise<void> {
  if (row.expires_at.getTime() <= Date.now() || row.status === "deleted") deny("CONTACT_TASK_SOURCE_UNAVAILABLE");
  if (!row.capture_id) return;
  const found = await client.query(`SELECT 1 FROM captures c JOIN subjects s ON s.account_id=c.account_id AND s.id=c.subject_id
    JOIN source_retention_receipts r ON r.account_id=c.account_id AND r.capture_id=c.id
    WHERE c.account_id=$1 AND c.id=$2 AND c.status='active' AND s.status='active'
    AND c.subject_id=$3
    AND r.authorization_state='authorized' AND r.source_access_state NOT IN ('purged','deleted')
    AND c.retention_until > now()`,[row.account_id,row.capture_id,row.subject_id]);
  if (!found.rowCount) deny("CONTACT_TASK_SOURCE_UNAVAILABLE");
}

async function save(client: PoolClient, row: Row) {
  const response = row.state.response;
  response.limitations=response.limitations.slice(-20);
  const result = await client.query<{revision:number;updated_at:Date}>(`UPDATE screenshot_contact_tasks
    SET state=$3::jsonb,status=$4,revision=revision+1,subject_id=$5,assignment_id=$6,capture_id=$7,source_resource_id=$8,
      updated_at=now(),lease_until=CASE WHEN $4='running' THEN now()+interval '90 seconds' ELSE NULL END
    WHERE account_id=$1 AND id=$2 AND status <> 'deleted' AND lease_epoch=$9
    RETURNING revision,updated_at`,[row.account_id,row.id,JSON.stringify(row.state),response.status,
      response.contact?.person_id??null,response.contact?.relationship_context_id??null,response.capture_id,response.source_resource_id,row.lease_epoch]);
  if (!result.rows[0]) deny("CONTACT_TASK_LEASE_LOST");
  row.revision=result.rows[0].revision;
  row.status=response.status;
  row.capture_id=response.capture_id;
  row.subject_id=response.contact?.person_id??null;
  response.revision=row.revision;response.updated_at=result.rows[0].updated_at.toISOString();
}

export async function loadScreenshotContactTask(pool: Pool, auth: AuthContext, id: string): Promise<Response> {
  const row=await rowFor(pool,auth,id);
  try { await assertSourceCurrent(pool,row); } catch { return terminalResponse(row,"deleted"); }
  return ScreenshotContactTaskResponseSchema.parse({...row.state.response,revision:row.revision,updated_at:row.updated_at.toISOString()});
}

export async function resumeScreenshotContactTask(pool:Pool,auth:AuthContext,id:string,input:{
  expected_revision:number; selected_person_id?:string; selected_relationship_context_id?:string;
  new_contact_name?:string; image?:ScreenshotContactTaskRequest["image"];
}):Promise<Response>{
  await inTransaction(pool,async client=>{
    const row=await rowFor(client,auth,id,true);await assertSourceCurrent(client,row);
    if(row.revision!==input.expected_revision)deny("CONTACT_TASK_REVISION_CHANGED");
    if(!["waiting_for_user","partial","failed","cancelled"].includes(row.status))deny("CONTACT_TASK_NOT_RESUMABLE");
    if(Boolean(input.selected_person_id)!==Boolean(input.selected_relationship_context_id))deny("CONTACT_TASK_SCOPE_INCOMPLETE");
    if(input.new_contact_name&&input.selected_person_id)deny("CONTACT_TASK_SCOPE_AMBIGUOUS");
    if(input.image){
      if(row.state.response.extraction)deny("CONTACT_EXTRACTION_ALREADY_CHECKPOINTED");
      const manifest=validateContactImage(input.image);
      if(manifest.content_hash!==row.input_manifest.image.content_hash)deny("CONTACT_IMAGE_INTEGRITY_MISMATCH");
    }
    if(row.state.batch_conflict) throw new ApiError(409,"CONTACT_BATCH_IDENTITY_CONFLICT","这些截图包含不同联系人，请分别发送。 ");
    if(input.new_contact_name){
      if(row.state.response.capture_id)deny("CONTACT_TASK_ALREADY_FILED");
      row.state.user_contact_label=input.new_contact_name.trim();
    }
    if(input.selected_person_id){
      if(row.state.response.capture_id)deny("CONTACT_TASK_ALREADY_FILED");
      await getRelationshipScope(client,auth,input.selected_person_id,input.selected_relationship_context_id!);
      row.state.selected={person_id:input.selected_person_id,relationship_context_id:input.selected_relationship_context_id!};
    }
    row.state.response.status="running";row.state.response.question=null;row.state.turns=0;row.state.tokens=0;
    row.state.model_receipts=row.state.model_receipts.slice(-50);
    row.state.response.events=row.state.response.events.slice(-60).map((event,index)=>({...event,sequence:index+1}));
    await save(client,row);
    await client.query("UPDATE screenshot_contact_tasks SET lease_until=NULL,lease_epoch=lease_epoch+1 WHERE account_id=$1 AND id=$2",[auth.accountId,id]);
    await appendAudit(client,{accountId:auth.accountId,actorUserId:auth.userId},"contact_task.resumed","screenshot_contact_task",id,{selected_person_id:input.selected_person_id??null});
  });
  return loadScreenshotContactTask(pool,auth,id);
}

export async function cancelScreenshotContactTask(pool:Pool,auth:AuthContext,id:string,expectedRevision:number){
  await inTransaction(pool,async client=>{
    const row=await rowFor(client,auth,id,true);await assertSourceCurrent(client,row);
    if(row.revision!==expectedRevision)deny("CONTACT_TASK_REVISION_CHANGED");
    row.state.response.status="cancelled";await save(client,row);
    await client.query("UPDATE screenshot_contact_tasks SET lease_epoch=lease_epoch+1,lease_until=NULL WHERE account_id=$1 AND id=$2",[auth.accountId,id]);
    await appendAudit(client,{accountId:auth.accountId,actorUserId:auth.userId},"contact_task.cancelled","screenshot_contact_task",id,{});
  });
  return loadScreenshotContactTask(pool,auth,id);
}

export async function expireScreenshotContactTasks(pool:Pool,storage?:ChatMediaStorage):Promise<void>{
  await inTransaction(pool,async client=>{
    await client.query(`DELETE FROM contact_profile_observations o USING screenshot_contact_tasks t
      WHERE o.account_id=t.account_id AND o.task_id=t.id AND t.expires_at<=now()`);
    await client.query(`UPDATE screenshot_contact_tasks SET state='{}'::jsonb,input_manifest='{}'::jsonb,status='deleted',
      lease_until=NULL,lease_epoch=lease_epoch+1,revision=revision+1,updated_at=now() WHERE expires_at<=now() AND status<>'deleted'`);
  });
  if(storage) await purgeExpiredContactImages(pool,storage);
}

export async function loadContactIntelligence(pool:Pool,auth:AuthContext,personID:string,contextID:string){
  const archived=await pool.query<{operation_id:string;display_name:string;version:number}>(`SELECT o.id AS operation_id,s.display_label AS display_name,s.version
    FROM contact_archive_operations o JOIN subjects s ON s.account_id=o.account_id AND s.id=o.subject_id
    WHERE o.account_id=$1 AND o.subject_id=$2 AND o.decided_by_user_id=$3 AND o.status='archived'
    AND s.status='deleted' AND s.version=o.archived_revision ORDER BY o.created_at DESC LIMIT 1`,[auth.accountId,personID,auth.userId]);
  if(archived.rows[0])return {scope:null,person_revision:archived.rows[0].version,tasks:[] as Response[],archive:{operation_id:archived.rows[0].operation_id,display_name:archived.rows[0].display_name}};
  const scope=await getRelationshipScope(pool,auth,personID,contextID);
  const person=await pool.query<{version:number}>("SELECT version FROM subjects WHERE account_id=$1 AND id=$2 AND status='active'",[auth.accountId,personID]);
  const tasks=await pool.query<Row>(`SELECT t.* FROM screenshot_contact_tasks t
    JOIN captures c ON c.account_id=t.account_id AND c.id=t.capture_id
    JOIN source_retention_receipts r ON r.account_id=c.account_id AND r.capture_id=c.id
    WHERE t.account_id=$1 AND t.subject_id=$2 AND t.assignment_id=$3 AND t.created_by_user_id=$4
    AND t.status<>'deleted' AND t.expires_at>now() AND c.status='active' AND c.retention_until>now()
    AND r.authorization_state='authorized' AND r.source_access_state='available'
    ORDER BY t.created_at DESC LIMIT 20`,[auth.accountId,personID,contextID,auth.userId]);
  return {scope,archive:null,person_revision:person.rows[0]?.version,tasks:tasks.rows.map(row=>ScreenshotContactTaskResponseSchema.parse({...row.state.response,revision:row.revision,updated_at:row.updated_at.toISOString()}))};
}

export async function listScreenshotContactTasks(pool:Pool,auth:AuthContext){
  const result=await pool.query<Row>(`SELECT * FROM screenshot_contact_tasks WHERE account_id=$1 AND created_by_user_id=$2
    AND status<>'deleted' AND expires_at>now() ORDER BY created_at DESC LIMIT 20`,[auth.accountId,auth.userId]);
  const tasks=[];
  for(const row of result.rows){try{await assertSourceCurrent(pool,row);tasks.push({task_id:row.id,status:row.status,revision:row.revision,
    contact:row.state.response.contact,summary:row.state.response.summary,created_at:row.created_at.toISOString()});}catch{}}
  return {tasks};
}

function imageManifest(request: ScreenshotContactTaskRequest): Manifest {
  const {image, additional_images, ...rest}=request;
  return {...rest,image:validateContactImage(image),...(additional_images?.length?{additional_images:additional_images.map(validateContactImage)}:{})};
}

export async function loadScreenshotContactImage(pool:Pool,auth:AuthContext,id:string,index:number,storage:ChatMediaStorage){
  await assertSourceCurrent(pool,await rowFor(pool,auth,id));
  const image=await readContactImage(pool,auth,id,index,storage);
  if(!image)throw new ApiError(404,"CONTACT_IMAGE_UNAVAILABLE","原图暂时不可用，请重试。");
  await assertSourceCurrent(pool,await rowFor(pool,auth,id));
  return image;
}

export async function createScreenshotContactTask(pool: Pool,auth: AuthContext,raw: unknown, storage?:ChatMediaStorage): Promise<{body:Response;replayed:boolean}> {
  const parsed=ScreenshotContactTaskRequestSchema.safeParse(raw);
  if (!parsed.success) throw new ApiError(422,"CONTACT_TASK_INPUT_INVALID","请选择最多 10 张截图，每张不超过 10 MB，总计不超过 30 MB。");
  const request=parsed.data;const manifest=imageManifest(request);const hash=digest(JSON.stringify(manifest));
  if (Boolean(request.selected_person_id)!==Boolean(request.selected_relationship_context_id)) deny("CONTACT_TASK_SCOPE_INCOMPLETE");
  const result = await inTransaction(pool,async(client)=>{
    if(request.selected_person_id) await getRelationshipScope(client,auth,request.selected_person_id,request.selected_relationship_context_id!);
    const id=randomUUID();const now=new Date().toISOString();
    const response:Response={...(storage?{source_images:contactImages(request).map((image,image_index)=>({...validateContactImage(image),image_index}))}:{}),task_id:id,revision:1,status:"running",contact:null,capture_id:null,source_resource_id:null,
      message_count:0,extraction:null,summary:"",findings:[],profile_fields:[],public_sources:[],question:null,candidates:[],
      limitations:[],events:[],external_effects:[],created_at:now,updated_at:now};
    const state:TaskState={response,searches:[],observations:[],model_receipts:[],turns:0,tokens:0,pending_research:null,
      selected:request.selected_person_id?{person_id:request.selected_person_id,relationship_context_id:request.selected_relationship_context_id!}:null};
    const result=await client.query(`INSERT INTO screenshot_contact_tasks(id,account_id,created_by_user_id,idempotency_key,request_hash,input_manifest,state,status)
      VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,'running') ON CONFLICT(account_id,created_by_user_id,idempotency_key) DO NOTHING RETURNING id`,
      [id,auth.accountId,auth.userId,request.idempotency_key,hash,JSON.stringify(manifest),JSON.stringify(state)]);
    if(!result.rowCount){
      const prior=await client.query<Row>(`SELECT * FROM screenshot_contact_tasks WHERE account_id=$1 AND created_by_user_id=$2 AND idempotency_key=$3`,[auth.accountId,auth.userId,request.idempotency_key]);
      const row=prior.rows[0]!;if(row.request_hash!==hash) deny("CONTACT_TASK_IDEMPOTENCY_CONFLICT");
      await assertSourceCurrent(client,row);
      return {body:{...row.state.response,revision:row.revision,updated_at:row.updated_at.toISOString()},replayed:true};
    }
    if(storage) await reserveContactImages(client,auth,id,contactImages(request).map(validateContactImage),storage);
    await appendAudit(client,{accountId:auth.accountId,actorUserId:auth.userId},"contact_task.created","screenshot_contact_task",id,
      {image_content_hashes:contactImages(request).map(image=>image.content_hash),raw_image_storage_requested:Boolean(storage),automatic_internal_filing:true,public_research:request.allow_public_research});
    return {body:response,replayed:false};
  });
  if(storage) {
    try { await persistContactImages(pool,auth,result.body.task_id,contactImages(request),storage); }
    catch { throw new ApiError(503,"CONTACT_IMAGE_UPLOAD_FAILED","图片尚未全部保存，请重试本次发送。"); }
  }
  return {...result,body:await loadScreenshotContactTask(pool,auth,result.body.task_id)};
}

function toolsFor(row: Row): ContactIntakeToolName[] {
  const response=row.state.response;
  if (!response.contact) return ["search_contacts","read_contact","create_contact","ask_contact_clarification"];
  if (!response.capture_id) return ["save_contact_chat","ask_contact_clarification"];
  const tools:ContactIntakeToolName[]=["update_contact","finish_contact_task","ask_contact_clarification"];
  if(row.input_manifest.allow_public_research && row.state.turns<14 && response.public_sources.length<25) tools.push("search_contact_public");
  if(response.public_sources.length>0 && row.state.turns<15)tools.push("fetch_contact_source");
  return tools;
}

function sourceExcerpt(row:Row,refs:string[],quote:string,publicAllowed:boolean) {
  const extraction=row.state.response.extraction!;
  const sources=refs.map(ref=> {
    const message=extraction.messages.find(m=>m.message_id===ref);
    if(message)return message.text;
    const clueIndex=/^clue([1-9][0-9]*)$/u.exec(ref);
    const clue=clueIndex?extraction.identity_clues[Number(clueIndex[1])-1]:null;
    if(publicAllowed&&clue)return clue.source_excerpt;
    const source=row.state.response.public_sources.find(s=>s.source_id===ref);
    if(publicAllowed&&source?.stage==="fetched")return source.text;
    deny("CONTACT_CITATION_SOURCE_UNAVAILABLE");
  });
  if(!sources.some(text=>text.includes(quote)))deny("CONTACT_CITATION_EXCERPT_MISMATCH");
}

function canonicalSourceRef(row:Row,ref:string):string{
  const match=/^public([1-9][0-9]*)$/u.exec(ref);
  if(!match)return ref;
  const source=row.state.response.public_sources[Number(match[1])-1];
  if(!source)deny("CONTACT_CITATION_SOURCE_UNAVAILABLE");
  return source.source_id;
}
function comparableProfileURL(value:string):string|null{
  try{const url=new URL(value);if(url.protocol!=="https:"||url.username||url.password)return null;
    return `${url.hostname.replace(/^www\./u,"")}${url.pathname.replace(/\/$/u,"")}${url.search}`;
  }catch{return null;}
}

async function storeChat(client:PoolClient,auth:AuthContext,row:Row,displayName?:string) {
  const response=row.state.response;
  if(response.capture_id)return {capture_id:response.capture_id,source_resource_id:response.source_resource_id,message_count:response.message_count,contact:response.contact,replayed:true};
  const extraction=response.extraction!;const manifest=row.input_manifest;
  if(extraction.messages.length===0)deny("CONTACT_CHAT_HAS_NO_MESSAGES");
  if(extraction.conversation_kind!=="direct"&&!row.state.selected&&!row.state.user_contact_label)deny("CONTACT_CHAT_IDENTITY_AMBIGUOUS");
  const clientResourceID=`screenshot-contact:${row.id}`;
  const request:ResourceCaptureRequest={contract_version:CONTRACT_VERSION,idempotency_key:clientResourceID,
    channel:"chat",purpose:"User-authorized contact filing and relationship context from a chat screenshot",
    captured_at:manifest.captured_at,source_timezone:"UTC",
    person_scope:displayName?{status:"new_person",display_label:displayName,relationship_context:{status:"proposed",label:"聊天记录",purpose:"User-authorized relationship context"},
      binding_basis:"Intentional screenshot import authorizes internal filing; visible name is a source label, not verified real-world identity."}
      :{status:"confirmed",person_id:response.contact!.person_id,relationship_context:{status:"existing",relationship_context_id:response.contact!.relationship_context_id},
        binding_basis:row.state.selected?"User selected this existing contact for filing.":"Unique internal contact match to visible screenshot label; content remains unreviewed source evidence."},
    resource:{client_resource_id:clientResourceID,kind:"conversation_screenshot",display_name:`${extraction.platform} 聊天截图`,media_type:manifest.image.media_type,
      observed_at:manifest.captured_at,source_timezone:"UTC",byte_size:[manifest.image,...manifest.additional_images??[]].reduce((sum,image)=>sum+image.byte_size,0),content_hash:manifest.additional_images?.length?digest(JSON.stringify([manifest.image,...manifest.additional_images])):manifest.image.content_hash,
      retention:{requested_mode:"evidence_crop",source_scope:"proposed_extracted_text",requested_retention_until:row.expires_at.toISOString()}},
    fragments:extraction.messages.map(m=>({client_resource_id:clientResourceID,kind:"message",sequence:m.sequence,text:m.text,
      locator:{kind:"message",source_message_id:m.source_image_index===undefined?m.message_id:`image${m.source_image_index+1}:${m.message_id}`,sequence:m.sequence,speaker_side:m.speaker_side},
      attribution:{actor_kind:"unknown",status:"unknown"},review_status:"proposed",parser:{name:"screenshot-contact-agent",version:"1"}})),
  };
  const result=await createResourceCaptureInTransaction(client,auth,request);
  const identity=result.body.identity;
  if(!identity.person_id||!identity.relationship_context_id)deny("CONTACT_CHAT_STORAGE_SCOPE_MISSING");
  response.contact={person_id:identity.person_id,relationship_context_id:identity.relationship_context_id,
    display_name:identity.person_display_label??displayName??response.contact!.display_name,disposition:displayName?"created":"reused"};
  response.capture_id=result.body.capture_id;response.source_resource_id=result.body.resource.id;
  response.message_count=result.body.resource.fragment_count;
  return {contact:response.contact,capture_id:response.capture_id,source_resource_id:response.source_resource_id,message_count:response.message_count,raw_image_persisted:Boolean(response.source_images?.length)};
}

async function executeLocalTool(client:PoolClient,auth:AuthContext,row:Row,call:ContactAgentToolCall):Promise<unknown> {
  const response=row.state.response;const extraction=response.extraction!;
  switch(call.name){
    case "search_contacts":{
      const args=CONTACT_INTAKE_TOOLS.search_contacts.schema.parse(call.arguments);
      const clues=[row.state.user_contact_label,extraction.contact_name,...extraction.identity_clues.filter(c=>["name","handle","profile_url"].includes(c.kind)).map(c=>c.value)].filter((v):v is string=>Boolean(v));
      if(!clues.some(c=>normalized(c)===normalized(args.query)))deny("CONTACT_SEARCH_NOT_AN_IDENTITY_CLUE");
      const found=await searchPeople(client,auth,args.query);
      const candidates=found.people.flatMap(p=>p.contexts.map(c=>({person_id:p.id,display_name:p.display_label,relationship_context_id:c.id,relationship_label:c.display_label}))).slice(0,10);
      response.candidates=candidates;row.state.searches.push({query:args.query,candidates});
      return {query:args.query,candidates,unique:candidates.length===1,selected:row.state.selected};
    }
    case "read_contact":{
      const args=CONTACT_INTAKE_TOOLS.read_contact.schema.parse(call.arguments);
      const selected=row.state.selected;
      const match=selected??(row.state.searches.at(-1)?.candidates.length===1?row.state.searches.at(-1)!.candidates[0]:null);
      if(!match||match.person_id!==args.person_id||match.relationship_context_id!==args.relationship_context_id)deny("CONTACT_READ_REQUIRES_UNIQUE_SCOPE");
      const scope=await getRelationshipScope(client,auth,args.person_id,args.relationship_context_id);
      const person=await client.query<{display_label:string}>(`SELECT display_label FROM subjects WHERE account_id=$1 AND id=$2 AND status='active'`,[auth.accountId,args.person_id]);
      if(!person.rows[0])deny("CONTACT_TARGET_UNAVAILABLE");
      response.contact={...args,display_name:person.rows[0].display_label,disposition:"reused"};response.candidates=[];
      return {contact:response.contact,scope};
    }
    case "create_contact":{
      const args=CONTACT_INTAKE_TOOLS.create_contact.schema.parse(call.arguments);
      if(row.state.selected)deny("CONTACT_SELECTED_REUSE_REQUIRED");
      const filingName=row.state.user_contact_label??extraction.contact_name;
      if(!filingName||normalized(filingName)!==normalized(args.display_name))deny("CONTACT_CREATE_REQUIRES_VISIBLE_NAME");
      if(!row.state.searches.some(s=>normalized(s.query)===normalized(args.display_name)&&s.candidates.length===0))deny("CONTACT_CREATE_REQUIRES_EMPTY_SEARCH");
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`${auth.accountId}:contact:${normalized(args.display_name)}`]);
      const current=await searchPeople(client,auth,args.display_name);
      if(current.people.length)deny("CONTACT_DIRECTORY_CHANGED_SEARCH_AGAIN");
      return storeChat(client,auth,row,args.display_name);
    }
    case "save_contact_chat":{
      const args=CONTACT_INTAKE_TOOLS.save_contact_chat.schema.parse(call.arguments);
      if(args.person_id!==response.contact?.person_id||args.relationship_context_id!==response.contact.relationship_context_id)deny("CONTACT_WRITE_SCOPE_MISMATCH");
      await getRelationshipScope(client,auth,args.person_id,args.relationship_context_id);
      return storeChat(client,auth,row);
    }
    case "update_contact":{
      const args=CONTACT_INTAKE_TOOLS.update_contact.schema.parse(call.arguments);
      if(!response.capture_id||args.person_id!==response.contact?.person_id)deny("CONTACT_UPDATE_REQUIRES_STORED_CHAT");
      for(const field of args.fields){
        field.source_refs=field.source_refs.map(ref=>canonicalSourceRef(row,ref));
        sourceExcerpt(row,field.source_refs,field.source_excerpt,true);
        if(field.epistemic_status==="source_statement"&&!field.source_excerpt.includes(field.value))field.epistemic_status="inference";
        if(response.profile_fields.length>=50&&!response.profile_fields.some(f=>JSON.stringify(f)===JSON.stringify(field)))deny("CONTACT_PROFILE_FIELD_LIMIT");
        // A public name match alone does not establish that the source describes this contact.
        const publicSources=field.source_refs.map(ref=>response.public_sources.find(s=>s.source_id===ref)).filter((s):s is ContactPublicSource=>Boolean(s));
        if(field.field==="public_profile"){
          const urls=[...publicSources.map(s=>s.url),...extraction.identity_clues.filter(c=>c.kind==="profile_url").map(c=>c.value)];
          const suppliedURL=field.value.match(/https:\/\/[^\s<>]+/u)?.[0];
          const citedURL=suppliedURL?urls.find(url=>comparableProfileURL(url)!==null&&comparableProfileURL(url)===comparableProfileURL(suppliedURL)):undefined;
          if(!citedURL)deny("CONTACT_PROFILE_REQUIRES_EXACT_CITED_URL");
          field.value=citedURL;field.epistemic_status="source_statement";
        }
        for(const source of publicSources){
          const visibleProfile=extraction.identity_clues.some(c=>c.kind==="profile_url"&&normalized(c.value)===normalized(source.url));
          const corroborated=extraction.contact_name&&normalized(`${source.title} ${source.text}`).includes(normalized(extraction.contact_name))&&
            extraction.identity_clues.some(c=>["company","handle"].includes(c.kind)&&normalized(`${source.title} ${source.text} ${source.url}`).includes(normalized(c.value)));
          if(!visibleProfile&&!corroborated)deny("CONTACT_PUBLIC_IDENTITY_UNCORROBORATED");
        }
        await client.query(`INSERT INTO contact_profile_observations(id,account_id,subject_id,assignment_id,task_id,capture_id,observation_hash,observation)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb) ON CONFLICT(account_id,task_id,observation_hash) DO NOTHING`,
          [randomUUID(),auth.accountId,args.person_id,response.contact.relationship_context_id,row.id,response.capture_id,digest(JSON.stringify(field)),JSON.stringify(field)]);
        if(!response.profile_fields.some(f=>JSON.stringify(f)===JSON.stringify(field)))response.profile_fields.push(field);
      }
      const readback=await client.query<{observation:ContactProfileField}>(`SELECT observation FROM contact_profile_observations WHERE account_id=$1 AND task_id=$2 ORDER BY created_at,id`,[auth.accountId,row.id]);
      response.profile_fields=readback.rows.map(r=>ContactProfileFieldSchema.parse(r.observation));
      return {person_id:args.person_id,profile_fields:response.profile_fields,user_authored_profile_unchanged:true};
    }
    case "finish_contact_task":{
      const args=CONTACT_INTAKE_TOOLS.finish_contact_task.schema.parse(call.arguments);
      if(!response.contact||!response.capture_id||!response.message_count)deny("CONTACT_FINISH_REQUIRES_STORAGE_READBACK");
      for(const finding of args.findings){
        sourceExcerpt(row,finding.message_refs,finding.source_excerpt,false);
        if(finding.epistemic_status==="source_statement"&&finding.text!==finding.source_excerpt)finding.epistemic_status="inference";
      }
      response.summary=args.summary;response.findings=args.findings;
      response.limitations=[...new Set([...response.limitations,...args.limitations])].slice(0,20);
      const latestToolStatus=new Map(response.events.map(event=>[event.tool,event.status]));
      // A corrected retry resolves the prior failed call; historical failures remain in the trace.
      latestToolStatus.set("finish_contact_task","completed");
      response.status=[...latestToolStatus.values()].some(status=>status==="failed")?"partial":"completed";
      response.question=null;response.candidates=[];
      return {status:response.status,contact:response.contact,capture_id:response.capture_id};
    }
    case "ask_contact_clarification":{
      const args=CONTACT_INTAKE_TOOLS.ask_contact_clarification.schema.parse(call.arguments);
      response.question=args.question;response.status="waiting_for_user";return {status:response.status,question:args.question,candidates:response.candidates};
    }
    default:deny("CONTACT_TOOL_NOT_AUTHORIZED");
  }
}

export class ScreenshotContactTaskRunner {
  private readonly active=new Map<string,Promise<void>>();
  private readonly controllers=new Map<string,AbortController>();
  constructor(private readonly pool:Pool,private readonly dependencies:ScreenshotContactDependencies,private readonly storage?:ChatMediaStorage){}
  start(auth:AuthContext,id:string,image?:ScreenshotContactTaskRequest["image"]):Promise<void> {
    const key=`${auth.accountId}:${id}`;const existing=this.active.get(key);if(existing)return existing;
    const controller=new AbortController();this.controllers.set(key,controller);
    const operation=this.run(auth,id,image,controller.signal).finally(()=>{this.active.delete(key);this.controllers.delete(key);});this.active.set(key,operation);return operation;
  }
  async drain(){await Promise.allSettled(this.active.values());}
  async close(){for(const controller of this.controllers.values())controller.abort(new Error("CONTACT_AGENT_SERVER_STOPPED"));await this.drain();}
  private async checkpoint<T>(auth:AuthContext,id:string,epoch:number,operation:(client:PoolClient,row:Row)=>Promise<T>):Promise<T>{
    return inTransaction(this.pool,async client=>{
      const row=await rowFor(client,auth,id,true);
      if(row.lease_epoch!==epoch||row.status!=="running")deny("CONTACT_TASK_LEASE_LOST");
      await assertSourceCurrent(client,row);const result=await operation(client,row);await save(client,row);return result;
    });
  }
  private async run(auth:AuthContext,id:string,image?:ScreenshotContactTaskRequest["image"],shutdown?:AbortSignal):Promise<void>{
    const claimed=await this.pool.query<{lease_epoch:number}>(`UPDATE screenshot_contact_tasks SET lease_epoch=lease_epoch+1,lease_until=now()+interval '90 seconds'
      WHERE account_id=$1 AND id=$2 AND created_by_user_id=$3 AND status='running' AND expires_at>now()
      AND (lease_until IS NULL OR lease_until<now()) RETURNING lease_epoch`,[auth.accountId,id,auth.userId]);
    if(!claimed.rows[0])return;const epoch=claimed.rows[0].lease_epoch;
    const signal=AbortSignal.any([AbortSignal.timeout(300_000),...(shutdown?[shutdown]:[])]);
    try{
      let row=await rowFor(this.pool,auth,id);
      if(!row.state.response.extraction){
        const manifests=[row.input_manifest.image,...row.input_manifest.additional_images??[]];
        for(let index=row.state.extraction_parts?.length??0;index<manifests.length;index++) {
          await assertSourceCurrent(this.pool,await rowFor(this.pool,auth,id));
          const source=this.storage?await readContactImage(this.pool,auth,id,index,this.storage):null;
          const current=source??(index===0?image:undefined);
          if(!current){await this.checkpoint(auth,id,epoch,async(_,r)=>{r.state.response.status="waiting_for_user";r.state.response.question=r.state.response.source_images?.length?"图片尚未全部保存，请重试原来的发送。":"识别尚未完成，请重新附上原截图继续。";});return;}
          validateContactImage(current);
          if(current.content_hash!==manifests[index]!.content_hash)deny("CONTACT_IMAGE_INTEGRITY_MISMATCH");
          // Refresh the lease for each bounded image read, and checkpoint each result.
          await this.checkpoint(auth,id,epoch,async()=>{});
          const output=await this.dependencies.model.extract(current,signal);
          await this.checkpoint(auth,id,epoch,async(_,r)=>{
            r.state.extraction_parts??=[];r.state.extraction_parts.push(output.extraction);
            r.state.tokens+=output.inputTokens+output.outputTokens;
            r.state.model_receipts.push({model:output.model,request_id:output.providerRequestID,input_tokens:output.inputTokens,output_tokens:output.outputTokens});
            r.state.response.events.push({sequence:r.state.response.events.length+1,tool:"extract_chat_screenshot",status:"completed",occurred_at:new Date().toISOString()});
          });
        }
        await this.checkpoint(auth,id,epoch,async(_,r)=>{
          const merged=mergeContactExtractions(r.state.extraction_parts!);
          r.state.response.extraction=merged.extraction;
          if(merged.question){r.state.response.status="waiting_for_user";r.state.response.question=merged.question;r.state.batch_conflict=merged.identityConflict;}
        });
      }
      // Unknown public-read responses are visible; do not silently repeat billed requests after recovery.
      await this.checkpoint(auth,id,epoch,async(_,r)=>{if(r.state.pending_research){r.state.observations.push({tool:r.state.pending_research,result:{error:"CONTACT_RESEARCH_RESPONSE_UNKNOWN"}});r.state.pending_research=null;}}).catch(error=>{if(codeOf(error)!=="CONTACT_TASK_LEASE_LOST")throw error;});
      while(!signal.aborted){
        row=await rowFor(this.pool,auth,id);if(row.status!=="running")return;
        if(row.state.turns>=18||row.state.tokens>=80_000)deny("CONTACT_TASK_BUDGET_EXHAUSTED");
        const tools=toolsFor(row);
        const reply=await this.dependencies.model.next({objective:row.input_manifest.objective,extraction:row.state.response.extraction!,
          state:{contact:row.state.response.contact,capture_id:row.state.response.capture_id,selected:row.state.selected,
            searched_queries:row.state.searches.map(s=>({query:s.query,match_count:s.candidates.length})),
            user_selected_contact_name:row.state.user_contact_label??null,
            screenshot_identity_clues:row.state.response.extraction!.identity_clues.map((clue,index)=>({source_ref:`clue${index+1}`,...clue})),
            public_sources:row.state.response.public_sources.map((source,index)=>({...source,source_ref:`public${index+1}`,text:source.text.slice(0,8_000)})).slice(-5),
            profile_fields:row.state.response.profile_fields,remaining_turns:18-row.state.turns},observations:row.state.observations.slice(-12).map(observation=>{
              if(observation.tool!=="search_contact_public"&&observation.tool!=="fetch_contact_source")return observation;
              const result=observation.result as {sources?:ContactPublicSource[]};
              return result.sources?{tool:observation.tool,result:{sources:result.sources.map(source=>({source_id:source.source_id,title:source.title,url:source.url,stage:source.stage}))}}:observation;
            }),tools,
          remainingTokens:Math.min(4000,80_000-row.state.tokens)},signal);
        await this.checkpoint(auth,id,epoch,async(_,r)=>{r.state.turns++;r.state.tokens+=reply.inputTokens+reply.outputTokens;
          r.state.model_receipts.push({model:reply.model,request_id:reply.providerRequestID,input_tokens:reply.inputTokens,output_tokens:reply.outputTokens});});
        const call=reply.calls[0];if(reply.calls.length!==1||!call)deny("CONTACT_AGENT_EXPECTED_ONE_TOOL_CALL");
        try{
          if(!tools.includes(call.name as ContactIntakeToolName))deny("CONTACT_TOOL_NOT_AUTHORIZED");
          if(call.name==="search_contact_public"||call.name==="fetch_contact_source")await this.research(auth,id,epoch,call,signal);
          else await this.checkpoint(auth,id,epoch,async(client,r)=>{
            const result=await executeLocalTool(client,auth,r,call);this.observe(r,call.name,result,"completed");
            await appendAudit(client,{accountId:auth.accountId,actorUserId:auth.userId},"contact_task.tool_completed","screenshot_contact_task",id,
              {tool:call.name,model:reply.model,provider_request_id:reply.providerRequestID,turn:r.state.turns});
          });
        }catch(error){
          if(codeOf(error)==="CONTACT_TASK_LEASE_LOST")return;
          await this.checkpoint(auth,id,epoch,async(_,r)=>{this.observe(r,call.name,{error:codeOf(error)},error instanceof ApiError?"denied":"failed");r.state.pending_research=null;});
        }
      }
      deny("CONTACT_TASK_TIMEOUT");
    }catch(error){
      if(codeOf(error)==="CONTACT_TASK_LEASE_LOST")return;
      await this.checkpoint(auth,id,epoch,async(_,r)=>{
        r.state.response.status=r.state.response.capture_id?"partial":"failed";
        r.state.response.limitations.push(codeOf(error));
        r.state.response.summary=r.state.response.capture_id?"聊天记录已保存，后续分析尚未完成。":"任务尚未完成，可重试继续。";
      }).catch(()=>{});
    }
  }
  private observe(row:Row,tool:string,result:unknown,status:"completed"|"failed"|"denied"){
    row.state.observations.push({tool,result});row.state.observations=row.state.observations.slice(-15);
    row.state.response.events.push({sequence:row.state.response.events.length+1,tool,status,occurred_at:new Date().toISOString()});
  }
  private async research(auth:AuthContext,id:string,epoch:number,call:ContactAgentToolCall,signal:AbortSignal){
    if(!this.dependencies.research)deny("CONTACT_RESEARCH_NOT_CONFIGURED");
    const input=await this.checkpoint(auth,id,epoch,async(_,row)=>{
      if(!row.state.response.capture_id||!row.input_manifest.allow_public_research)deny("CONTACT_RESEARCH_NOT_AUTHORIZED");
      const extraction=row.state.response.extraction!;
      const anchors=[extraction.contact_name,...extraction.identity_clues.filter(c=>["name","handle","company"].includes(c.kind)).map(c=>c.value)].filter((v):v is string=>Boolean(v)).slice(0,5);
      let operation;
      if(call.name==="search_contact_public"){
        const args=CONTACT_INTAKE_TOOLS.search_contact_public.schema.parse(call.arguments);
        // A query is assembled solely from visible public identity tokens; no IM sentences leave this boundary.
        const permitted=[...anchors,...extraction.identity_clues.filter(c=>c.kind==="job_title").map(c=>c.value),"linkedin","LinkedIn","抖音","微博","douyin","tiktok","threads","weibo"];
        let remaining=normalized(args.query);
        for(const token of permitted.sort((a,b)=>b.length-a.length))remaining=remaining.replaceAll(normalized(token),"");
        if(remaining.replace(/[\s,，、@|]+/gu,"").length)deny("CONTACT_PUBLIC_QUERY_NOT_IDENTITY_ONLY");
        operation={operation:"search" as const,channel:args.channel,query:args.query,maximum_results:3};
      }else{
        const args=CONTACT_INTAKE_TOOLS.fetch_contact_source.schema.parse(call.arguments);
        const source=row.state.response.public_sources.find(s=>s.source_id===canonicalSourceRef(row,args.source_id));if(!source)deny("CONTACT_SOURCE_NOT_DISCOVERED");
        operation={operation:"fetch" as const,source};
      }
      row.state.pending_research=call.name;
      return {contract_version:CONTACT_RESEARCH_CONTRACT,task_id:id,call_id:randomUUID(),anchors,input:operation};
    });
    const result=await this.dependencies.research.execute(input,signal);
    await this.checkpoint(auth,id,epoch,async(_,row)=>{
      for(const source of result.sources){const i=row.state.response.public_sources.findIndex(s=>s.source_id===source.source_id);if(i>=0)row.state.response.public_sources[i]=source;else row.state.response.public_sources.push(source);}
      row.state.pending_research=null;this.observe(row,call.name,{sources:result.sources},"completed");
    });
  }
}

export function environmentScreenshotContactDependencies(environment:NodeJS.ProcessEnv=process.env):ScreenshotContactDependencies|null {
  if(environment.TALENT_SIGNAL_SCREENSHOT_CONTACT_AGENT_ENABLED!=="true")return null;
  if(environment.TALENT_SIGNAL_ALLOW_SENSITIVE_AI_PROCESSING!=="true")throw new Error("CONTACT_AGENT_SENSITIVE_AI_NOT_ENABLED");
  return {model:new ZhipuContactAgentModel({apiKey:environment.ZHIPU_API_KEY??"",model:environment.TALENT_SIGNAL_CHAT_MODEL??"glm-5.3",
    visionModel:environment.TALENT_SIGNAL_AGENT_VISION_MODEL??"glm-4.6v-flash",...(environment.ZHIPU_BASE_URL?{baseUrl:environment.ZHIPU_BASE_URL}:{})}),
    research:environment.TALENT_SIGNAL_PERSON_RESEARCH_SOCKET?new LocalContactResearchClient(environment.TALENT_SIGNAL_PERSON_RESEARCH_SOCKET):null};
}
