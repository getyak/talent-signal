import { conversationQueueRoute } from "@/lib/server/conversationQueue";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) { return conversationQueueRoute(request, (await context.params).id, "stream"); }
