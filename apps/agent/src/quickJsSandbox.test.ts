import { describe, expect, it } from "vitest";
import { runJavaScript, RUN_CODE_LIMITS } from "./quickJsSandbox.js";

const run=(code:string,input:unknown={})=>runJavaScript(code,JSON.stringify(input),new AbortController().signal);
describe("isolated Run JavaScript",()=>{
  it("computes on exact JSON values without introducing prototype-literal semantics",async()=>{
    const value=await run("return {sum:input.rows.reduce((total,row)=>total+row.hours,0),own:Object.hasOwn(input,'__proto__'),inherited:input.polluted??null}",
      JSON.parse('{"rows":[{"hours":2},{"hours":5}],"__proto__":{"polluted":true}}'));
    expect(value.output).toEqual({sum:7,own:true,inherited:null});expect(value.engine).toBe("quickjs-emscripten@0.32.0");
  });
  it("exposes no host environment, file, network or package APIs",async()=>{
    expect((await run("return [typeof process,typeof require,typeof fetch,typeof std,typeof os,typeof Deno,typeof Bun]")).output)
      .toEqual(Array(7).fill("undefined"));
    await expect(run("return ({}).constructor.constructor('return process')().env")).rejects.toMatchObject({code:"RUN_CODE_EXECUTION_FAILED"});
  });
  it("does not retain a previous Run's globals",async()=>{
    await run("globalThis.previousPrivateValue='only-first-run';return true");
    expect((await run("return typeof globalThis.previousPrivateValue")).output).toBe("undefined");
  });
  it("rejects infinite computation within the unchanged production deadline",async()=>{
    const start=Date.now();await expect(run("while(true){}"))
      .rejects.toMatchObject({code:"RUN_CODE_CPU_LIMIT"});
    expect(Date.now()-start).toBeLessThan(RUN_CODE_LIMITS.wallMs+1000);
  },7000);
  it("bounds the VM heap and stack",async()=>{
    await expect(run("return new Uint8Array(64*1024*1024).length"))
      .rejects.toMatchObject({code:"RUN_CODE_MEMORY_LIMIT"});
    await expect(run("function loop(){return loop()}return loop()"))
      .rejects.toMatchObject({code:"RUN_CODE_STACK_LIMIT"});
  });
  it("rejects unresolved or fulfilled promises instead of pretending asynchronous work completed",async()=>{
    for(const code of ["return new Promise(()=>{})","return Promise.resolve(42)","return import('node:fs')","const result={};Promise.resolve().then(()=>result.ready=true);return result"])
      await expect(run(code)).rejects.toMatchObject({code:"RUN_CODE_ASYNC_NOT_SUPPORTED"});
  });
  it("bounds JSON serialization including hostile toJSON and multibyte outputs",async()=>{
    await expect(run("return '字'.repeat(30000)")).rejects.toMatchObject({code:"RUN_CODE_OUTPUT_LIMIT"});
    await expect(run("return {toJSON(){while(true){}}}")).rejects.toMatchObject({code:"RUN_CODE_CPU_LIMIT"});
    await expect(run("const result={};result.self=result;return result")).rejects.toMatchObject({code:"RUN_CODE_EXECUTION_FAILED"});
  },7000);
  it("does not trust a replacement JSON encoder from model code",async()=>{
    expect((await run("JSON.stringify=()=>'{\"injected\":true}';return {actual:42}")).output).toEqual({actual:42});
  });
  it("rejects oversized inputs before process admission",async()=>{
    await expect(run("x".repeat(RUN_CODE_LIMITS.codeBytes+1))).rejects.toMatchObject({code:"RUN_CODE_INPUT_LIMIT"});
    await expect(run("return input","x".repeat(RUN_CODE_LIMITS.inputBytes+1))).rejects.toMatchObject({code:"RUN_CODE_INPUT_LIMIT"});
  });
  it("never executes caller-owned serialization code",async()=>{
    let invoked=false;
    const hostile={toJSON(){invoked=true;throw new Error("host callback");},get value(){invoked=true;return 1;}};
    await expect(runJavaScript("return input",hostile as unknown as string,new AbortController().signal))
      .rejects.toMatchObject({code:"RUN_CODE_INPUT_NOT_JSON"});
    expect(invoked).toBe(false);
  });
  it("cancels an active child and releases capacity for a later Run",async()=>{
    const controller=new AbortController();const result=runJavaScript("while(true){}","{}",controller.signal);
    const rejected=expect(result).rejects.toThrow("USER_CANCELLED");
    setTimeout(()=>controller.abort(new Error("USER_CANCELLED")),100);
    await rejected;expect((await run("return 42")).output).toBe(42);
  });
  it("caps simultaneous child processes and restores capacity after failure",async()=>{
    const first=run("while(true){}"),second=run("while(true){}");
    const settled=Promise.allSettled([first,second]);
    await expect(run("return 3")).rejects.toMatchObject({code:"RUN_CODE_CAPACITY"});
    expect((await settled).every(result=>result.status==="rejected")).toBe(true);
    expect((await run("return 3")).output).toBe(3);
  },7000);
});
