import { conversationQueueRoute } from "@/lib/server/conversationQueue";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) { return conversationQueueRoute(request, (await context.params).id, "mutate"); }
