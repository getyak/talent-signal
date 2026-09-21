import { conversationImageRoute } from "@/lib/server/conversationQueue";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string; messageId: string; index: string }> };
export async function GET(request: Request, context: Context) {
  const { id, messageId, index } = await context.params;
  return conversationImageRoute(request, id, messageId, index);
}
