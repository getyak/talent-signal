import { TalentSignalHttpError } from "@talent-signal/contracts";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { pursuitAgentRunInputSchema } from "@/lib/pursuitApiInput";
import { createPursuitAgentRun } from "@/lib/server/pursuitBackend";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { error: { code: "AUTH_REQUIRED", message: "Sign in is required." } },
      { status: 401 },
    );
  }
  const parsed = pursuitAgentRunInputSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "AGENT_RUN_INPUT_INVALID",
          message: "The Pursuit, evidence, revision, and objective are required.",
        },
      },
      { status: 400 },
    );
  }

  const { pursuit_id: pursuitId, ...body } = parsed.data;
  try {
    return NextResponse.json(await createPursuitAgentRun(pursuitId, body));
  } catch (error) {
    if (error instanceof TalentSignalHttpError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status },
      );
    }
    return NextResponse.json(
      {
        error: {
          code: "AGENT_RUN_UNAVAILABLE",
          message:
            "The bounded Agent could not finish. No Proposal or canonical change is claimed.",
        },
      },
      { status: 503 },
    );
  }
}
