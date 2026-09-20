import { conversationQueueRoute } from "@/lib/server/conversationQueue";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) { return conversationQueueRoute(request, (await context.params).id, "read"); }
export async function POST(request: Request, context: Context) { return conversationQueueRoute(request, (await context.params).id, "admit"); }
