import {
  agentTaskStreamPreviewEvents,
  agentTaskStreamPreviewTask,
} from "@/lib/agentTaskStreamFixture";
import {
  semanticBlocksForTask,
  semanticTextChunks,
  sseFrame,
} from "@/lib/agentTaskStream";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return new Response(null, { status: 404 });
  }
  const encoder = new TextEncoder();
  const completed = agentTaskStreamPreviewTask("waiting_for_domain_decision");
  const wait = (milliseconds: number) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds));
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      void (async () => {
        const send = (name: string, frame: Parameters<typeof sseFrame>[1], id?: string) => {
          if (!request.signal.aborted) {
            controller.enqueue(encoder.encode(sseFrame(name, frame, id)));
          }
        };
        send("stream-open", {
          taskId: completed.id,
          type: "stream_open",
        });
        for (const event of agentTaskStreamPreviewEvents()) {
          if (request.signal.aborted) return;
          if (event.name === "artifact.ready") {
            for (const item of semanticBlocksForTask(completed)) {
              const block = {
                citationIds: item.citationIds,
                id: item.id,
                kind: item.kind,
                title: item.title,
              };
              send("content-block", {
                block,
                operation: "start",
                type: "content_block",
              });
              for (const delta of semanticTextChunks(item.text, 24)) {
                send("content-block", {
                  block,
                  delta,
                  operation: "delta",
                  type: "content_block",
                });
                await wait(90);
              }
              send("content-block", {
                block,
                operation: "commit",
                type: "content_block",
              });
            }
          }
          send("task-event", { event, type: "task_event" }, String(event.task_sequence));
          await wait(320);
        }
        send("task-snapshot", { task: completed, type: "snapshot" });
        controller.close();
      })().catch((error: unknown) => controller.error(error));
    },
  });
  return new Response(stream, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-Accel-Buffering": "no",
    },
  });
}
