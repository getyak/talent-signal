import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const RUN_CODE_LIMITS = Object.freeze({codeBytes:16_000,inputBytes:256_000,outputBytes:64_000,
  memoryBytes:32*1024*1024,stackBytes:256*1024,cpuMs:2_000,wallMs:5_000,concurrency:2});
export class RunCodeError extends Error {
  constructor(readonly code:string) {super(code);this.name="RunCodeError";}
}
let active=0;

// This launcher is fixed trusted Node code. Model code arrives only on stdin
// and is evaluated inside QuickJS/WASM. No host bridge or module loader exists.
// https://github.com/justjake/quickjs-emscripten#safely-evaluate-javascript-code
const LAUNCHER=String.raw`
import {getQuickJS} from "quickjs-emscripten";
let raw="";for await(const chunk of process.stdin)raw+=chunk;
const {code,inputJSON,limits}=JSON.parse(raw);
const module=await getQuickJS(),runtime=module.newRuntime();
runtime.setMemoryLimit(limits.memoryBytes);runtime.setMaxStackSize(limits.stackBytes);
const deadline=Date.now()+limits.cpuMs;runtime.setInterruptHandler(()=>Date.now()>deadline);
const context=runtime.newContext();let value;
try {
  const program="(()=>{const encode=JSON.stringify;const input=JSON.parse("+JSON.stringify(inputJSON)+");const output=(function(input){'use strict';\n"+code+"\n})(input);if(output && typeof output.then==='function')throw new Error('RUN_CODE_ASYNC_NOT_SUPPORTED');const text=encode(output);if(typeof text!=='string')throw new Error('RUN_CODE_OUTPUT_NOT_JSON');if(text.length>"+limits.outputBytes+")throw new Error('RUN_CODE_OUTPUT_LIMIT');return text;})()";
  value=context.evalCode(program,"run.js");
  if(value.error){
    const error=context.dump(value.error);const message=String(error?.message??"");
    const code=message.includes("interrupted")?"RUN_CODE_CPU_LIMIT":message.includes("out of memory")?"RUN_CODE_MEMORY_LIMIT":
      message.includes("stack")?"RUN_CODE_STACK_LIMIT":["RUN_CODE_ASYNC_NOT_SUPPORTED","RUN_CODE_OUTPUT_NOT_JSON","RUN_CODE_OUTPUT_LIMIT"].find(code=>message===code)??"RUN_CODE_EXECUTION_FAILED";
    process.stdout.write(JSON.stringify({error:code}));
  } else if(runtime.hasPendingJob()) {
    process.stdout.write(JSON.stringify({error:"RUN_CODE_ASYNC_NOT_SUPPORTED"}));
  } else {
    const text=context.getString(value.value);
    if(Buffer.byteLength(text)>limits.outputBytes)process.stdout.write(JSON.stringify({error:"RUN_CODE_OUTPUT_LIMIT"}));
    else process.stdout.write(JSON.stringify({output:JSON.parse(text)}));
  }
} catch {process.stdout.write(JSON.stringify({error:"RUN_CODE_EXECUTION_FAILED"}));}
finally {value?.error?.dispose();value?.value?.dispose();context.dispose();runtime.dispose();}
`;

/** Synchronous JavaScript computation only; every invocation owns a fresh process and VM. */
export async function runJavaScript(code:string,inputJSON:string,signal:AbortSignal):Promise<{output:unknown;durationMs:number;engine:string}> {
  signal.throwIfAborted();
  // Accept serialized data only: never invoke caller-owned getters or toJSON.
  if(typeof code!=="string"||typeof inputJSON!=="string")throw new RunCodeError("RUN_CODE_INPUT_NOT_JSON");
  if(Buffer.byteLength(code)>RUN_CODE_LIMITS.codeBytes||Buffer.byteLength(inputJSON)>RUN_CODE_LIMITS.inputBytes)
    throw new RunCodeError("RUN_CODE_INPUT_LIMIT");
  if(active>=RUN_CODE_LIMITS.concurrency)throw new RunCodeError("RUN_CODE_CAPACITY");
  active++;let directory:string|undefined;const start=Date.now();
  try {
    directory=await mkdtemp(join(tmpdir(),"talent-signal-code-"));signal.throwIfAborted();
    // Resolve the pinned package from trusted host code. No credentials, PATH,
    // NODE_OPTIONS or user-provided module paths cross this process boundary.
    const runtimeURL=pathToFileURL(createRequire(import.meta.url).resolve("quickjs-emscripten")).href;
    const launcher=LAUNCHER.replace('from "quickjs-emscripten"',`from ${JSON.stringify(runtimeURL)}`);
    const payload=JSON.stringify({code,inputJSON,limits:RUN_CODE_LIMITS});
    const result=await new Promise<unknown>((resolve,reject)=>{
      const child=spawn(process.execPath,["--max-old-space-size=64","--input-type=module","--eval",launcher],
        {cwd:directory,env:{},stdio:["pipe","pipe","ignore"],shell:false});
      let output=Buffer.alloc(0),failure:unknown;
      const stop=(error:unknown)=>{failure??=error;child.kill("SIGKILL");};
      const abort=()=>stop(signal.reason??new RunCodeError("RUN_CODE_CANCELLED"));
      const timer=setTimeout(()=>stop(new RunCodeError("RUN_CODE_WALL_LIMIT")),Math.max(1,RUN_CODE_LIMITS.wallMs-(Date.now()-start)));
      signal.addEventListener("abort",abort,{once:true});if(signal.aborted)abort();
      child.stdout.on("data",(chunk:Buffer)=>{
        if(output.length+chunk.length>RUN_CODE_LIMITS.outputBytes+256)stop(new RunCodeError("RUN_CODE_OUTPUT_LIMIT"));
        else output=Buffer.concat([output,chunk]);
      });
      child.on("error",error=>{failure??=error;});
      child.stdin.on("error",()=>{failure??=new RunCodeError("RUN_CODE_PROCESS_FAILED");});
      child.on("close",status=>{
        clearTimeout(timer);signal.removeEventListener("abort",abort);
        if(failure)return reject(failure);
        if(status!==0)return reject(new RunCodeError("RUN_CODE_PROCESS_FAILED"));
        try {const parsed=JSON.parse(output.toString("utf8"));if(parsed.error)return reject(new RunCodeError(parsed.error));
          if(!Object.hasOwn(parsed,"output"))return reject(new RunCodeError("RUN_CODE_PROCESS_FAILED"));resolve(parsed.output);
        }catch{reject(new RunCodeError("RUN_CODE_PROCESS_FAILED"));}
      });
      child.stdin.end(payload);
    });
    signal.throwIfAborted();return {output:result,durationMs:Date.now()-start,engine:"quickjs-emscripten@0.32.0"};
  } finally {try {if(directory)await rm(directory,{recursive:true,force:true});}finally{active--;}}
}
