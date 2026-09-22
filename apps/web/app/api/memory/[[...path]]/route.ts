import { memoryReviewRoute } from "@/lib/server/memoryReview";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ path?: string[] }> };

async function handle(request: Request, context: Context) {
  const { path } = await context.params;
  return memoryReviewRoute(request, path ?? []);
}

export async function GET(request: Request, context: Context) {
  return handle(request, context);
}
export async function POST(request: Request, context: Context) {
  return handle(request, context);
}
export async function PUT(request: Request, context: Context) {
  return handle(request, context);
}
export async function DELETE(request: Request, context: Context) {
  return handle(request, context);
}
