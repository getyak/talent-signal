import { TalentSignalHttpError } from "@talent-signal/contracts";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { agentDecisionBundleResolveInputSchema } from "@/lib/pursuitApiInput";
import { resolveAgentDecisionBundle } from "@/lib/server/pursuitBackend";

const Id = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { error: { code: "AUTH_REQUIRED", message: "需要登录。" } },
      { status: 401 },
    );
  }
  const { id } = await context.params;
  if (!Id.test(id)) {
    return NextResponse.json(
      { error: { code: "DECISION_BUNDLE_ID_INVALID", message: "决定包 ID 无效。" } },
      { status: 400 },
    );
  }
  const parsed = agentDecisionBundleResolveInputSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "DECISION_BUNDLE_INPUT_INVALID",
          message: "每个决定项都需要精确选择与当前修订版本。",
        },
      },
      { status: 400 },
    );
  }
  try {
    return NextResponse.json(await resolveAgentDecisionBundle(id, parsed.data));
  } catch (error) {
    if (error instanceof TalentSignalHttpError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message, details: error.details } },
        { status: error.status },
      );
    }
    return NextResponse.json(
      {
        error: {
          code: "DECISION_BUNDLE_RESOLUTION_UNAVAILABLE",
          message: "决定尚未被规范回读证明；不会显示为已应用。",
        },
      },
      { status: 503 },
    );
  }
}
