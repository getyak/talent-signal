import {
  TalentSignalHttpError,
  type IdentityResolutionDecisionRequest,
} from "@talent-signal/contracts";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { isAllowedMutationOrigin } from "@/lib/request-origin";
import {
  decideIdentityResolution,
  isIntegrationMode,
} from "@/lib/server/localBackend";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type ResolvingDecision = Extract<
  IdentityResolutionDecisionRequest,
  { decision: "bind_existing" | "create_new" }
>;

function response(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function validContext(
  value: unknown,
): value is ResolvingDecision["relationship_context"] {
  if (!value || typeof value !== "object") {
    return false;
  }
  const context = value as Record<string, unknown>;
  if (context.status === "existing") {
    return UUID.test(String(context.relationship_context_id ?? ""));
  }
  return (
    context.status === "proposed" &&
    typeof context.label === "string" &&
    context.label.trim().length > 0 &&
    context.label.length <= 200 &&
    typeof context.purpose === "string" &&
    context.purpose.trim().length > 0 &&
    context.purpose.length <= 240
  );
}

function normalizeDecision(
  value: unknown,
): IdentityResolutionDecisionRequest | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const body = value as Record<string, unknown>;
  if (
    !UUID.test(String(body.idempotency_key ?? "")) ||
    !Number.isInteger(body.expected_case_version) ||
    Number(body.expected_case_version) < 1 ||
    typeof body.reason !== "string" ||
    body.reason.trim().length === 0 ||
    body.reason.length > 500
  ) {
    return null;
  }
  const common = {
    idempotency_key: String(body.idempotency_key),
    expected_case_version: Number(body.expected_case_version),
    reason: body.reason.trim(),
  };
  if (body.decision === "leave_unresolved") {
    return { ...common, decision: "leave_unresolved" };
  }
  if (
    body.decision === "bind_existing" &&
    UUID.test(String(body.selected_person_id ?? "")) &&
    validContext(body.relationship_context)
  ) {
    return {
      ...common,
      decision: "bind_existing",
      selected_person_id: String(body.selected_person_id),
      relationship_context:
        body.relationship_context.status === "existing"
          ? body.relationship_context
          : {
              ...body.relationship_context,
              label: body.relationship_context.label.trim(),
              purpose: body.relationship_context.purpose.trim(),
            },
    };
  }
  if (
    body.decision === "create_new" &&
    typeof body.display_label === "string" &&
    body.display_label.trim().length > 0 &&
    body.display_label.length <= 200 &&
    typeof body.binding_basis === "string" &&
    body.binding_basis.trim().length > 0 &&
    body.binding_basis.length <= 500 &&
    validContext(body.relationship_context) &&
    body.relationship_context.status === "proposed"
  ) {
    return {
      ...common,
      decision: "create_new",
      display_label: body.display_label.trim(),
      binding_basis: body.binding_basis.trim(),
      relationship_context: {
        ...body.relationship_context,
        label: body.relationship_context.label.trim(),
        purpose: body.relationship_context.purpose.trim(),
      },
    };
  }
  return null;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ caseId: string }> },
) {
  if (!isIntegrationMode()) {
    return response({ code: "local_integration_disabled" }, 404);
  }
  const session = await auth();
  if (!session?.user) {
    return response({ code: "authentication_required" }, 401);
  }
  if (!isAllowedMutationOrigin(request.headers)) {
    return response(
      { code: "cross_origin_identity_decision_denied" },
      403,
    );
  }
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  ) {
    return response({ code: "identity_decision_content_type_invalid" }, 415);
  }
  const { caseId } = await context.params;
  if (!UUID.test(caseId)) {
    return response({ code: "identity_case_id_invalid" }, 400);
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return response({ code: "identity_decision_invalid" }, 400);
  }
  const decision = normalizeDecision(body);
  if (!decision) {
    return response({ code: "identity_decision_invalid" }, 400);
  }
  try {
    return response(await decideIdentityResolution(caseId, decision), 201);
  } catch (error) {
    if (error instanceof TalentSignalHttpError) {
      return response(
        { code: error.code, message: error.message },
        error.status,
      );
    }
    return response({ code: "identity_decision_unavailable" }, 503);
  }
}
