import type { ConversationQueuePreview, ConversationQueueSnapshot } from "@talent-signal/contracts";

/** SSE framing is incremental across arbitrary UTF-8/network chunk boundaries. */
export class ConversationFrames {
  private buffer = "";
  push(text: string): Array<{ event: string; data: unknown }> {
    this.buffer = (this.buffer + text).replace(/\r\n/g, "\n");
    if (this.buffer.length > 500_000) throw new Error("回复连接的数据过长，请重新连接。");
    const frames: Array<{ event: string; data: unknown }> = [];
    let boundary: number;
    while ((boundary = this.buffer.indexOf("\n\n")) >= 0) {
      const lines = this.buffer.slice(0, boundary).split("\n"); this.buffer = this.buffer.slice(boundary + 2);
      const data = lines.filter(line => line.startsWith("data:")).map(line => line.slice(5).trimStart()).join("\n");
      if (!data) continue;
      frames.push({ event: lines.find(line => line.startsWith("event:"))?.slice(6).trim() ?? "message", data: JSON.parse(data) });
    }
    return frames;
  }
}
export function acceptConversationSnapshot(current: ConversationQueueSnapshot | null, next: ConversationQueueSnapshot, session: string): ConversationQueueSnapshot | null {
  if (next.session_id !== session || !Number.isInteger(next.revision) || (current && next.revision < current.revision)) return current;
  return next;
}
export function acceptConversationPreview(current: ConversationQueuePreview | null, next: ConversationQueuePreview, snapshot: ConversationQueueSnapshot | null) {
  if (!snapshot?.active || next.run_id !== snapshot.active.run_id || next.message_id !== snapshot.active.message_id || typeof next.text !== "string" || next.text.length > 16000) return current;
  if (current?.run_id === next.run_id && current.revision >= next.revision) return current;
  return next;
}
