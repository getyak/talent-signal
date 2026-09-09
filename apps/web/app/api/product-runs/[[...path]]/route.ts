import { NextRequest, NextResponse } from "next/server";
import { TalentSignalHttpError, type ProductRunFeedbackMutation } from "@talent-signal/contracts";
import { auth } from "@/auth";
import { isAllowedMutationOrigin } from "@/lib/request-origin";
import { authenticatedLabClient } from "@/lib/server/labBackend";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ path?: string[] }> };
async function handle(request: NextRequest, context: Context) {
  if (!(await auth())?.user) return NextResponse.json({ message: "请先登录。" }, { status: 401 });
  if (request.method !== "GET" && !isAllowedMutationOrigin(request.headers)) return NextResponse.json({ message: "请求来源无效。" }, { status: 403 });
  const parts = (await context.params).path ?? [];
  const isTask = parts[0] === "tasks", id = parts[isTask ? 1 : 0];
  const validID = id && /^[a-f0-9-]{36}$/iu.test(id);
  const valid = request.method === "GET" ? !parts.length || validID && parts.length === (isTask ? 2 : 1)
    : request.method === "PUT" ? validID && isTask && parts.length === 3 && parts[2] === "feedback"
    : validID && !isTask && parts.length === 2 && parts[1] === "cases";
  if (!valid) return NextResponse.json({ message: "入口不存在。" }, { status: 404 });
  try {
    const client = await authenticatedLabClient("web-product-runs");
    const result = request.method === "POST" ? await client.createProductRunCase(id!, await request.json()) : request.method === "PUT"
      ? await client.submitProductRunFeedback(id!, await request.json() as ProductRunFeedbackMutation)
      : id ? await client.getProductRun(id, isTask) : await client.listProductRuns(request.nextUrl.search);
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ message: error instanceof TalentSignalHttpError ? error.message : "暂时无法读取运行记录，请重试。" },
      { status: error instanceof TalentSignalHttpError ? error.status : 503, headers: { "cache-control": "no-store" } });
  }
}
export const GET = handle;
export const PUT = handle;

export const POST = handle;
