import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { TalentSignalHttpError } from "@talent-signal/contracts";
import { auth } from "@/auth";
import { RelationshipWorkspaceApp } from "@/components/relationship-workspace-app";
import { WorkspaceApp } from "@/components/workspace-app";
import {
  backendSessionRecoveryHref,
  isBackendSessionExpiredError,
} from "@/lib/backend-session";
import {
  isIntegrationMode,
  loadRelationshipWorkspaceInitialRead,
} from "@/lib/server/localBackend";
import { loadCandidateWorkspace } from "@/lib/server/candidateWorkspace";
import WorkspaceLoading from "./loading";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Candidate workspace",
  description:
    "A source-linked candidate knowledge workspace for relationship-led search.",
  robots: {
    follow: false,
    index: false,
  },
};

export default async function WorkspacePage({
  searchParams,
}: {
  searchParams: Promise<{
    capture?: string;
    context?: string;
    identity_case?: string;
    intent?: string;
    person?: string;
    surface?: string;
  }>;
}) {
  const parameters = await searchParams;
  const requestedCapture =
    parameters.capture &&
    /^[0-9a-f-]{36}$/i.test(parameters.capture)
      ? parameters.capture
      : undefined;
  const requestedPerson =
    parameters.person &&
    /^[0-9a-f-]{36}$/i.test(parameters.person)
      ? parameters.person
      : undefined;
  const requestedContext =
    parameters.context &&
    /^[0-9a-f-]{36}$/i.test(parameters.context)
      ? parameters.context
      : undefined;
  const requestedIdentityCase =
    parameters.identity_case &&
    /^[0-9a-f-]{36}$/i.test(parameters.identity_case)
      ? parameters.identity_case
      : undefined;
  const session = await auth();
  if (!session?.user) {
    const callbackParameters = new URLSearchParams();
    if (requestedCapture) {
      callbackParameters.set("capture", requestedCapture);
    } else if (requestedPerson && requestedContext) {
      callbackParameters.set("person", requestedPerson);
      callbackParameters.set("context", requestedContext);
    }
    if (requestedIdentityCase) {
      callbackParameters.set("identity_case", requestedIdentityCase);
    }
    const callbackUrl =
      callbackParameters.size > 0
        ? `/workspace?${callbackParameters.toString()}`
        : "/workspace";
    redirect(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }

  if (
    isIntegrationMode() &&
    !requestedCapture &&
    !requestedPerson &&
    !requestedContext &&
    !requestedIdentityCase &&
    !parameters.surface
  ) {
    redirect("/workspace/today");
  }

  if (isIntegrationMode()) {
    const { surface } = parameters;
    if (surface === "loading") {
      return <WorkspaceLoading />;
    }
    let initialRead: Awaited<
      ReturnType<typeof loadRelationshipWorkspaceInitialRead>
    > | null = null;
    let integrationError: string | null = null;
    let sessionRecoveryHref: string | null = null;
    try {
      initialRead = await loadRelationshipWorkspaceInitialRead({
        captureId: requestedCapture,
        personId: requestedPerson,
        relationshipContextId: requestedContext,
        identityCaseId: requestedIdentityCase,
      });
      integrationError = initialRead.warnings.join(" ") || null;
    } catch (caught) {
      if (
        caught instanceof TalentSignalHttpError &&
        caught.code === "PERSON_MERGED" &&
        caught.details &&
        typeof caught.details === "object"
      ) {
        const details = caught.details as Record<string, unknown>;
        const retainedPersonId = String(
          details.merged_into_person_id ?? "",
        );
        const retainedContextId = String(
          details.relationship_context_id ?? "",
        );
        if (
          /^[0-9a-f-]{36}$/i.test(retainedPersonId) &&
          /^[0-9a-f-]{36}$/i.test(retainedContextId)
        ) {
          redirect(
            `/workspace?person=${encodeURIComponent(
              retainedPersonId,
            )}&context=${encodeURIComponent(retainedContextId)}`,
          );
        }
      }
      if (isBackendSessionExpiredError(caught)) {
        integrationError = caught.message;
        const callbackParameters = new URLSearchParams();
        if (requestedCapture) {
          callbackParameters.set("capture", requestedCapture);
        } else if (requestedPerson && requestedContext) {
          callbackParameters.set("person", requestedPerson);
          callbackParameters.set("context", requestedContext);
        } else {
          callbackParameters.set("surface", "desk");
        }
        if (requestedIdentityCase) {
          callbackParameters.set("identity_case", requestedIdentityCase);
        }
        sessionRecoveryHref = backendSessionRecoveryHref(
          `/workspace?${callbackParameters.toString()}`,
        );
      } else {
        const status =
          caught &&
          typeof caught === "object" &&
          "status" in caught &&
          typeof caught.status === "number"
            ? caught.status
            : null;
        if (status !== 404) {
          integrationError =
            "The account-scoped localhost backend could not be reached. No verified state is claimed.";
        }
      }
    }
    return (
      <RelationshipWorkspaceApp
        initialAccountId={initialRead?.accountId ?? null}
        initialAgentHistory={initialRead?.agentHistory ?? null}
        initialCaptureOpen={parameters.intent === "capture"}
        initialIdentityResolutionCase={
          initialRead?.identityResolutionCase ?? null
        }
        initialKnowledgeSnapshot={initialRead?.knowledgeSnapshot ?? null}
        initialRelationshipScope={initialRead?.relationshipScope ?? null}
        initialWorkspace={initialRead?.workspace ?? null}
        initialError={integrationError}
        initialSessionRecoveryHref={sessionRecoveryHref}
      />
    );
  }

  const { dataset, source } = await loadCandidateWorkspace();

  return (
    <WorkspaceApp
      dataset={dataset}
      source={source}
      user={{
        email: session.user.email,
        name: session.user.name,
      }}
    />
  );
}
