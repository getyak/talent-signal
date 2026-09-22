#!/usr/bin/env node
// Isolated GET-40 browser fault injection. No public control route, payload
// logging, or production configuration. A local one-shot file arms one loss.
import http from "node:http";
import {readFile,unlink} from "node:fs/promises";
import assert from "node:assert/strict";

const armFile=process.env.GET40_RESPONSE_LOSS_FILE;
assert(armFile?.startsWith("/private/tmp/ai-test-get-40."),"Owned test artifact control file required");
http.createServer(async(req,res)=>{
  let armed=false;
  if(req.method==="POST" && /\/memory\/.*\/(commits|undo)(?:\?|$)/.test(req.url??"")) {
    try { armed=(await readFile(armFile,"utf8")).trim()==="lose-next-response";if(armed)await unlink(armFile); } catch {}
  }
  const upstream=http.request({hostname:"127.0.0.1",port:55442,path:req.url,method:req.method,headers:{...req.headers,host:"127.0.0.1:55442"}},reply=>{
    if((reply.statusCode??0)>=400 && /\/memory\//.test(req.url??"")) {
      let body="";reply.on("data",chunk=>{if(body.length<4096)body+=chunk.toString();});
      reply.on("end",()=>{try{const parsed=JSON.parse(body);const code=parsed.code??parsed.error?.code;if(typeof code==="string" && /^[A-Z0-9_]+$/.test(code))process.stdout.write(JSON.stringify({status:reply.statusCode,code})+"\n");}catch{}});
    }
    if(armed && (reply.statusCode??500)<300){reply.resume();reply.on("end",()=>res.destroy());return;}
    res.writeHead(reply.statusCode??502,reply.headers);reply.pipe(res);
  });
  upstream.on("error",()=>{if(!res.headersSent)res.writeHead(502);res.end();});req.pipe(upstream);
}).listen(55444,"127.0.0.1",()=>process.stdout.write("GET-40 response-loss proxy listening on loopback 55444\n"));
