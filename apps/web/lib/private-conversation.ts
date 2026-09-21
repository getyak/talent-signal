export type PrivateTurn = {
  id: string;
  prompt: string;
  answer: string;
  status: "pending" | "complete" | "stopped" | "failed";
};

/** Only completed, transient dialogue travels with the next request. */
export function privateConversationMessages(turns: PrivateTurn[], prompt: string) {
  const pairs = turns.filter(turn => turn.status === "complete").slice(-11)
    .map(turn => [
      { role: "user" as const, content: turn.prompt },
      { role: "assistant" as const, content: turn.answer.slice(0, 8_000) },
    ]);
  let total = pairs.flat().reduce((sum, message) => sum + message.content.length, prompt.length);
  while (total > 24_000 && pairs.length) {
    total -= pairs.shift()!.reduce((sum, message) => sum + message.content.length, 0);
  }
  return [...pairs.flat(), { role: "user" as const, content: prompt }];
}

/** A closed HTTP connection is not proof that the provider finished. */
export async function readPrivateConversation(
  stream: ReadableStream<Uint8Array>,
  onText: (text: string) => void,
  signal: AbortSignal,
) {
  const reader = stream.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let buffer = "", text = "", done = false, bytes = 0;
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", abort, { once: true });
  function frame(line: string) {
    if (!line.trim()) return;
    if (done) throw new Error("PRIVATE_STREAM_INVALID");
    const value = JSON.parse(line) as { type?: string; text?: unknown };
    if (value.type === "done") { done = true; return; }
    if (value.type !== "text" || typeof value.text !== "string") throw new Error("PRIVATE_STREAM_FAILED");
    text += value.text;
    if (text.length > 32_000) throw new Error("PRIVATE_STREAM_TOO_LONG");
    onText(text);
  }
  try {
    signal.throwIfAborted();
    while (true) {
      const chunk = await reader.read();
      signal.throwIfAborted();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 512_000) throw new Error("PRIVATE_STREAM_TOO_LONG");
      buffer += decoder.decode(chunk.value, { stream: true });
      let newline: number;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        frame(buffer.slice(0, newline)); buffer = buffer.slice(newline + 1);
      }
      if (buffer.length > 128_000) throw new Error("PRIVATE_STREAM_INVALID");
    }
    buffer += decoder.decode();
    if (buffer.trim()) frame(buffer);
    if (!done || !text.trim()) throw new Error("PRIVATE_STREAM_INCOMPLETE");
    return text;
  } finally {
    signal.removeEventListener("abort", abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
