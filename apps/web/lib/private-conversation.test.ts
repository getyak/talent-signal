import { describe, expect, it, vi } from "vitest";
import { privateConversationMessages, readPrivateConversation, type PrivateTurn } from "./private-conversation";

const encoder = new TextEncoder();
function stream(text: string, split = 3) {
  const bytes = encoder.encode(text);
  return new ReadableStream<Uint8Array>({ start(controller) {
    for (let index = 0; index < bytes.length; index += split) controller.enqueue(bytes.slice(index, index + split));
    controller.close();
  } });
}
const turn = (id: string, status: PrivateTurn["status"] = "complete"): PrivateTurn => ({ id, prompt: `question-${id}`, answer: `answer-${id}`, status });
describe("transient private conversation", () => {
  it("reassembles UTF-8 text and requires an explicit successful terminal frame", async () => {
    const update = vi.fn();
    await expect(readPrivateConversation(stream('{"type":"text","text":"你好"}\n{"type":"text","text":"世界"}\n{"type":"done"}\n', 1), update, new AbortController().signal)).resolves.toBe("你好世界");
    expect(update.mock.calls.map(call => call[0])).toEqual(["你好", "你好世界"]);
  });
  it.each([
    '{"type":"text","text":"partial"}\n',
    '{"type":"done"}\n',
    '{"type":"error","code":"PRIVATE_UPSTREAM_FAILED"}\n',
    '{"type":"text","text":"ok"}\n{"type":"done"}\n{"type":"text","text":"late"}\n',
    'not json\n',
  ])("does not present incomplete or malformed output as success (%s)", async text => {
    await expect(readPrivateConversation(stream(text), () => {}, new AbortController().signal)).rejects.toThrow();
  });
  it("cancels a blocked reader immediately on exit", async () => {
    const cancel = vi.fn(); const controller = new AbortController();
    const promise = readPrivateConversation(new ReadableStream({ cancel }), () => {}, controller.signal);
    controller.abort();
    await expect(promise).rejects.toThrow();
    expect(cancel).toHaveBeenCalled();
  });
  it("bounds output before exposing it", async () => {
    const update = vi.fn();
    await expect(readPrivateConversation(stream(JSON.stringify({type:"text",text:"a".repeat(32_001)})+'\n', 64_000), update, new AbortController().signal)).rejects.toThrow("PRIVATE_STREAM_TOO_LONG");
    expect(update).not.toHaveBeenCalled();
  });
  it("never carries partial/failed replies or normal workspace context", () => {
    expect(privateConversationMessages([turn("1"), turn("2", "stopped"), turn("3", "failed"), turn("4", "pending")], "next"))
      .toEqual([{role:"user",content:"question-1"},{role:"assistant",content:"answer-1"},{role:"user",content:"next"}]);
  });
  it("drops whole old pairs to retain the latest request within the transport budget", () => {
    const messages = privateConversationMessages(Array.from({length:30},(_,i)=>({...turn(`${i}`),prompt:"p".repeat(4_000),answer:"a".repeat(12_000)})), "latest");
    expect(messages.length).toBeLessThanOrEqual(23);
    expect(messages.reduce((sum,message)=>sum+message.content.length,0)).toBeLessThanOrEqual(24_000);
    expect(messages[0].role).toBe("user");
    expect(messages.at(-1)).toEqual({role:"user",content:"latest"});
    expect(messages.every(message=>message.content.length<=8_000)).toBe(true);
  });
});
