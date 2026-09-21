// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace }) }));
import { PrivateConversation } from "./private-conversation";
let host: HTMLDivElement, root: Root;
const encoder = new TextEncoder();
const completed = () => new Response(new ReadableStream({start(c){c.enqueue(encoder.encode('{"type":"text","text":"合成回复"}\n{"type":"done"}\n'));c.close();}}), {headers:{"content-type":"application/x-ndjson"}});
beforeEach(async () => {
  Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true}); vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn().mockImplementation(completed));
  localStorage.clear(); sessionStorage.clear();
  host = document.createElement("div"); document.body.append(host); root=createRoot(host);
  await act(async()=>root.render(createElement(PrivateConversation,{binding:"synthetic-binding",accountId:"synthetic-account"})));
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();vi.restoreAllMocks();});
async function fill(value:string) { await act(async()=>{
  const input=host.querySelector("textarea")!;
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value")!.set!.call(input,value);
  input.dispatchEvent(new Event("input",{bubbles:true}));
}); }
async function send() { await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="发送隐私消息"]')!.click()); }
describe("private room lifecycle",()=>{
  it("streams only submitted private text, without writing browser storage or creating a Session",async()=>{
    const storage=vi.spyOn(Storage.prototype,"setItem");
    await fill("synthetic private question");await send();
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url,options]=vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/private-conversation");
    expect(JSON.parse(options!.body as string)).toEqual({messages:[{role:"user",content:"synthetic private question"}]});
    expect(options?.headers).toMatchObject({"x-workspace-session":"synthetic-binding","x-talent-signal-workspace":"synthetic-account"});
    expect(host.textContent).toContain("合成回复");
    expect(storage).not.toHaveBeenCalled();
  });
  it("exit aborts an active stream, clears memory and returns without touching a public draft",async()=>{
    localStorage.setItem("normal-draft","keep this normal draft");
    vi.mocked(fetch).mockImplementation(async()=>new Response(new ReadableStream({start(c){c.enqueue(encoder.encode('{"type":"text","text":"正在回复"}\n'));}})));
    await fill("transient secret");await send();
    const signal=vi.mocked(fetch).mock.calls[0][1]!.signal!;
    await act(async()=>Array.from(host.querySelectorAll("button")).find(b=>b.textContent?.includes("退出并清空"))!.click());
    expect(signal.aborted).toBe(true);
    expect(host.textContent).not.toContain("transient secret");
    expect(localStorage.getItem("normal-draft")).toBe("keep this normal draft");
    expect(mocks.replace).toHaveBeenCalledWith("/workspace");
  });
  it("pagehide clears both completed dialogue and unsent text for back/forward cache restores",async()=>{
    await fill("private sent");await send();await fill("private unsent");
    await act(async()=>window.dispatchEvent(new Event("pagehide")));
    expect(host.textContent).not.toContain("private sent");
    expect(host.querySelector("textarea")!.value).toBe("");
    expect(host.textContent).toContain("只属于此刻的对话");
  });
  it("refuses a stale account without retrying or redirecting private content",async()=>{
    vi.mocked(fetch).mockResolvedValue(new Response('{}',{status:409}));
    await fill("private stale");await send();
    expect(host.querySelector("textarea")!.disabled).toBe(true);
    expect(host.querySelector("textarea")!.value).toBe("");
    expect(host.textContent).not.toContain("private stale");
    expect(host.textContent).toContain("登录状态已变化");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(mocks.replace).not.toHaveBeenCalled();
  });
  it("retains failed text for explicit retry and never labels a disconnected stream complete",async()=>{
    vi.mocked(fetch).mockResolvedValueOnce(new Response('{"type":"text","text":"partial"}\n'));
    await fill("private retry");await send();
    expect(host.textContent).toContain("这条回复未完成");
    expect(fetch).toHaveBeenCalledTimes(1);
    await act(async()=>Array.from(host.querySelectorAll("button")).find(b=>b.textContent?.includes("重试这条"))!.click());
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse(vi.mocked(fetch).mock.calls[1][1]!.body as string).messages).toEqual([{role:"user",content:"private retry"}]);
    expect(host.textContent).toContain("合成回复");
  });
  it("clears a previous transcript and unsent draft when a delayed request detects changed login",async()=>{
    await fill("old private transcript");await send();
    let resolve!: (response:Response)=>void;
    vi.mocked(fetch).mockImplementationOnce(()=>new Promise(done=>{resolve=done;}));
    await fill("in flight private");await send();await fill("new private draft");
    await act(async()=>resolve(new Response('{}',{status:401})));
    expect(host.textContent).not.toContain("old private transcript");
    expect(host.textContent).not.toContain("in flight private");
    expect(host.querySelector("textarea")!.value).toBe("");
    expect(host.querySelector("textarea")!.disabled).toBe(true);
  });
  it("binding changes clear memory and cancel an old request before late content arrives",async()=>{
    let resolve!: (response:Response)=>void;
    vi.mocked(fetch).mockImplementationOnce(()=>new Promise(done=>{resolve=done;}));
    await fill("old account text");await send();await fill("old account draft");
    const signal=vi.mocked(fetch).mock.calls[0][1]!.signal!;
    await act(async()=>root.render(createElement(PrivateConversation,{binding:"different-binding",accountId:"different-account"})));
    await act(async()=>resolve(completed()));
    expect(signal.aborted).toBe(true);
    expect(host.textContent).not.toContain("old account text");
    expect(host.textContent).not.toContain("合成回复");
    expect(host.querySelector("textarea")!.value).toBe("");
  });
  it("offers retry only for the latest failed turn without rewriting later context",async()=>{
    vi.mocked(fetch).mockResolvedValueOnce(new Response('{"type":"text","text":"partial"}\n'));
    await fill("failed first");await send();
    await fill("new second");await send();
    expect(Array.from(host.querySelectorAll("button")).filter(b=>b.textContent?.includes("重试这条"))).toHaveLength(0);
    const messages=JSON.parse(vi.mocked(fetch).mock.calls[1][1]!.body as string).messages;
    expect(messages).toEqual([{role:"user",content:"new second"}]);
  });
  it("does not send during input method composition",async()=>{
    await fill("中文输入");
    await act(async()=>host.querySelector("textarea")!.dispatchEvent(new CompositionEvent("compositionstart",{bubbles:true})));
    expect(host.querySelector<HTMLButtonElement>('[aria-label="发送隐私消息"]')!.disabled).toBe(true);
    await act(async()=>host.querySelector("textarea")!.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",isComposing:true,bubbles:true})));
    expect(fetch).not.toHaveBeenCalled();
  });
});
