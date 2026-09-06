import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { ZhipuContactAgentModel } from "@talent-signal/agent";
import { buildApp } from "../app.js";
import { LocalContactResearchClient } from "../modules/contactResearchClient.js";

const database=process.env.CONTACT_AGENT_TEST_DATABASE_URL;
assert(database && new URL(database).pathname==="/contact_proof" && new URL(database).hostname==="127.0.0.1","Use the task-owned disposable proof database.");
const pool=new Pool({connectionString:database,max:8});
const app=await buildApp({pool,config:{databaseUrl:database,host:"127.0.0.1",port:4337,allowedOrigins:[],appleSignInAudiences:[],appleSignInEnabled:false,
  passwordAuthEnabled:true,passwordRegistrationEnabled:false,simulatedAuthEnabled:true,internalLabEnabled:false,sessionTtlSeconds:3600,retentionSweepIntervalMs:60000},
  remoteChatProvider:null,personResearchProvider:null,screenshotContact:{
    model:new ZhipuContactAgentModel({apiKey:process.env.ZHIPU_API_KEY??"",model:process.env.TALENT_SIGNAL_CHAT_MODEL??"glm-5.3",
      visionModel:process.env.TALENT_SIGNAL_AGENT_VISION_MODEL??"glm-4.6v-flash",...(process.env.ZHIPU_BASE_URL?{baseUrl:process.env.ZHIPU_BASE_URL}:{})}),
    research:new LocalContactResearchClient("/tmp/ts-contact-agent-proof-20260906/research.sock")}});
app.get("/proof/fixtures/public-profile",async(_,reply)=>reply.type("text/html").send(await readFile(new URL("../../../web/test/fixtures/contact-agent-public-profile.html",import.meta.url),"utf8")));
await app.listen({host:"127.0.0.1",port:4337});
console.log(JSON.stringify({purpose:"screenshot-contact-live-proof",port:4337,real_model:true,disposable_database:true}));
for(const signal of ["SIGINT","SIGTERM"] as const)process.once(signal,()=>void(async()=>{await app.close();await pool.end();process.exit(0);})());
