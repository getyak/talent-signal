import { TalentSignalHttpError } from "@talent-signal/contracts";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { pursuitProposalReviewInputSchema } from "@/lib/pursuitApiInput";
import { reviewPursuitProposal } from "@/lib/server/pursuitBackend";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { error: { code: "AUTH_REQUIRED", message: "Sign in is required." } },
      { status: 401 },
    );
  }
  const { id } = await context.params;
  if (!zId(id)) {
    return NextResponse.json(
      { error: { code: "PROPOSAL_ID_INVALID", message: "Proposal ID is invalid." } },
      { status: 400 },
    );
  }
  const parsed = pursuitProposalReviewInputSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "PROPOSAL_REVIEW_INPUT_INVALID",
          message: "Every proposed change requires one explicit decision.",
        },
      },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(await reviewPursuitProposal(id, parsed.data));
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
          code: "PROPOSAL_REVIEW_UNAVAILABLE",
          message:
            "The review could not be verified. No canonical change is claimed.",
        },
      },
      { status: 503 },
    );
  }
}

function zId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
