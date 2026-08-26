"use client";

import {
  CONTRACT_VERSION,
  type IdentityResolutionCase,
  type KnowledgeSnapshot,
  type PersonMergeReversalPreview,
  type RelationshipAgentHistory,
  type RelationshipScope,
  type ResourceCaptureResponse,
  type WorkspaceReviewResponse,
} from "@talent-signal/contracts";
import { Plus, ShieldCheck } from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useState } from "react";

import {
  GovernedCaptureDeletion,
  type GovernedCaptureDeletionReceipt,
} from "./relationship-workspace/governed-capture-deletion";
import {
  RelationshipExternalEffectReview,
} from "./relationship-workspace/relationship-history";
import { RelationshipAgentPanel } from "./relationship-workspace/relationship-agent-panel";
import { RelationshipAgentStartPanel } from "./relationship-workspace/relationship-agent-start-panel";
import { RelationshipContactHeader } from "./relationship-workspace/relationship-contact-header";
import { RelationshipEvidenceProjection } from "./relationship-workspace/relationship-evidence-projection";
import { RelationshipFactReview } from "./relationship-workspace/relationship-fact-review";
import { RelationshipNextMove } from "./relationship-workspace/relationship-next-move";
import { RelationshipOnboarding } from "./relationship-workspace/relationship-onboarding";
import { RelationshipOutcomeTimeline } from "./relationship-workspace/relationship-outcome-timeline";
import { RelationshipResourceSection } from "./relationship-workspace/relationship-resource-section";
import { RelationshipSourceLineage } from "./relationship-workspace/relationship-source-lineage";
import {
  relationshipWorkspaceReadbackBoundaryError,
  requestRelationshipWorkspaceMutation,
} from "./relationship-workspace/relationship-workspace-command";
import { CapturePanel } from "./relationship-workspace/screenshot-capture-panel";
import {
  PersonMergeReview,
  type PersonMergeWorkflowResponse,
} from "./relationship-workspace/person-merge-review";
import { RelationshipWikiPanel } from "./relationship-workspace/relationship-wiki-panel";
import { RelationshipWorkspaceStatus } from "./relationship-workspace/relationship-workspace-status";
import { useRelationshipAgentController } from "./relationship-workspace/use-relationship-agent-controller";
import { useRelationshipWorkspaceReadback } from "./relationship-workspace/use-relationship-workspace-readback";

type Props = {
  initialAccountId: string | null;
  initialAgentHistory: RelationshipAgentHistory | null;
  initialIdentityResolutionCase: IdentityResolutionCase | null;
  initialKnowledgeSnapshot: KnowledgeSnapshot | null;
  initialWorkspace: WorkspaceReviewResponse | null;
  initialRelationshipScope: RelationshipScope | null;
  initialError: string | null;
  initialSessionRecoveryHref: string | null;
  initialCaptureOpen?: boolean;
};

function scrollWorkspaceTo(id: string) {
  document.getElementById(id)?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}

export function RelationshipWorkspaceApp({
  initialAccountId,
  initialAgentHistory,
  initialIdentityResolutionCase,
  initialKnowledgeSnapshot,
  initialWorkspace,
  initialRelationshipScope,
  initialError,
  initialSessionRecoveryHref,
  initialCaptureOpen = false,
}: Props) {
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [relationshipScope, setRelationshipScope] = useState(
    initialRelationshipScope,
  );
  const [identityResolutionCase, setIdentityResolutionCase] = useState(
    initialIdentityResolutionCase,
  );
  const [knowledgeSnapshot, setKnowledgeSnapshot] = useState(
    initialKnowledgeSnapshot,
  );
  const accountId =
    initialAccountId ??
    initialWorkspace?.account_id ?? initialKnowledgeSnapshot?.account_id ?? null;
  const [error, setError] = useState(initialError ?? "");
  const [busy, setBusy] = useState("");
  const [captureOpen, setCaptureOpen] = useState(initialCaptureOpen);
  const [personMergeRequested, setPersonMergeRequested] = useState(false);
  const [personMergeReversalPreview, setPersonMergeReversalPreview] =
    useState<PersonMergeReversalPreview | null>(null);
  const [resourceComposerOpen, setResourceComposerOpen] = useState(false);
  const [deletionSummary, setDeletionSummary] =
    useState<GovernedCaptureDeletionReceipt | null>(null);
  const [announcement, setAnnouncement] = useState(
    initialIdentityResolutionCase
      ? "Identity review resumed."
      : initialWorkspace || initialRelationshipScope
      ? "Contact context loaded."
      : "No contact context is open.",
  );
  const activeScope = workspace
    ? {
        person: {
          id: workspace.subject.id,
          display_label: workspace.subject.display_label,
        },
        relationship_context: {
          id: workspace.assignment.id,
          display_label: workspace.assignment.display_label,
        },
      }
    : relationshipScope;
  const activeCaptureId = workspace?.capture.id ?? null;
  const {
    acceptWorkspaceReadback,
    agentHistory,
    clearAgentHistory,
    refreshAgentHistory,
    refreshWorkspaceReview,
  } = useRelationshipWorkspaceReadback({
    accountId,
    activeCaptureId,
    activeScope,
    initialHistory: initialAgentHistory,
    onWorkspaceReadback: setWorkspace,
  });

  useEffect(() => {
    function openCapture() {
      setCaptureOpen(true);
    }
    window.addEventListener("talent-signal:open-capture", openCapture);
    return () =>
      window.removeEventListener(
        "talent-signal:open-capture",
        openCapture,
      );
  }, []);

  useEffect(() => {
    if (
      !activeCaptureId ||
      typeof window === "undefined" ||
      window.location.hash !== "#proposed-changes"
    ) {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      const target = document.getElementById("proposed-changes");
      target?.scrollIntoView({ block: "start" });
      target?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeCaptureId]);

  const assertions = workspace?.analysis.assertions ?? [];
  const pendingCount = assertions.filter(
    (assertion) => assertion.review_status === "pending",
  ).length;
  const relationshipAgent = useRelationshipAgentController({
    accountId,
    onAnnouncement: setAnnouncement,
    onBusyChange: setBusy,
    onError: setError,
    onOpenMergeReview: () => {
      setPersonMergeRequested(true);
      window.setTimeout(
        () => scrollWorkspaceTo("person-merge-review"),
        0,
      );
    },
    onOpenResourceComposer: openResourceComposer,
    onRefreshHistory: (personId, relationshipContextId) => {
      void refreshAgentHistory(personId, relationshipContextId);
    },
    pendingCount,
    scope: activeScope,
  });

  async function mutate(
    path: string,
    options: RequestInit,
    label: string,
  ) {
    const expectedCaptureId = activeCaptureId;
    setBusy(label);
    setError("");
    setAnnouncement(`${label}.`);
    try {
      if (!expectedCaptureId) {
        throw new Error("No active evidence review is available to update.");
      }
      const result = await requestRelationshipWorkspaceMutation(
        path,
        options,
        fetch,
        {
          expectedAccountId: accountId,
          expectedCaptureId,
        },
      );
      if (!result.ok) {
        throw new Error(result.message);
      }
      const next = result.workspace;
      const accepted = acceptWorkspaceReadback(next, expectedCaptureId);
      if (!accepted.ok) {
        throw new Error(accepted.message);
      }
      relationshipAgent.clearGeneratedArtifacts();
      setKnowledgeSnapshot(null);
      setAnnouncement("Contact context updated.");
      return next;
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Canonical state could not be updated.",
      );
      setAnnouncement("The update failed. Prior state remains visible.");
      return null;
    } finally {
      setBusy("");
    }
  }

  function handleCaptureDeleted(receipt: GovernedCaptureDeletionReceipt) {
    setDeletionSummary(receipt);
    setWorkspace(null);
    relationshipAgent.clearGeneratedArtifacts();
    setKnowledgeSnapshot(null);
    clearAgentHistory();
    setAnnouncement("Source and registered derivatives deleted.");
    window.history.replaceState(null, "", "/workspace");
  }

  function handleCommitted(next: WorkspaceReviewResponse) {
    const boundaryError = relationshipWorkspaceReadbackBoundaryError(next, {
      expectedAccountId: accountId,
    });
    if (boundaryError) {
      setCaptureOpen(false);
      setError(boundaryError);
      setAnnouncement(
        "The source was saved, but its cross-account readback was not opened.",
      );
      return;
    }
    setWorkspace(next);
    setRelationshipScope(null);
    relationshipAgent.clearGeneratedArtifacts();
    setKnowledgeSnapshot(null);
    setDeletionSummary(null);
    setCaptureOpen(false);
    setError("");
    setAnnouncement("New evidence is ready for fact review.");
    window.history.replaceState(
      null,
      "",
      `/workspace?capture=${encodeURIComponent(next.capture.id)}#proposed-changes`,
    );
    void refreshAgentHistory(
      next.subject.id,
      next.assignment.id,
    );
  }

  function closeCapture() {
    setCaptureOpen(false);
    if (typeof window === "undefined") {
      return;
    }
    const location = new URL(window.location.href);
    if (location.searchParams.get("intent") !== "capture") {
      return;
    }
    location.searchParams.delete("intent");
    window.history.replaceState(
      null,
      "",
      `${location.pathname}${location.search}${location.hash}`,
    );
  }

  function handleRelationshipRemoved(announcement: string) {
    setWorkspace(null);
    setRelationshipScope(null);
    setIdentityResolutionCase(null);
    clearAgentHistory();
    relationshipAgent.clearGeneratedArtifacts();
    setKnowledgeSnapshot(null);
    setResourceComposerOpen(false);
    setError("");
    setAnnouncement(announcement);
    window.history.replaceState(null, "", "/workspace");
  }

  function handleInitialResourcesCommitted(
    scope: RelationshipScope,
    receipts: ResourceCaptureResponse[],
    outcome:
      | "created_person"
      | "created_relationship_context"
      | "reused_relationship",
  ) {
    const identityClueSaved = receipts.some(
      (receipt) => receipt.resource.kind === "contact_record",
    );
    const identityClueDetail = identityClueSaved
      ? " One confirmed identity clue is stored as a source-linked masked handle."
      : "";
    setRelationshipScope(scope);
    setWorkspace(null);
    clearAgentHistory();
    relationshipAgent.setCreateOpen(false);
    setResourceComposerOpen(false);
    handleResourcesCommitted(receipts);
    relationshipAgent.setOperation(
      {
        detail:
          outcome === "created_person"
            ? `The explicit identity, relationship context, and first governed source now share one living page.${identityClueDetail}`
            : outcome === "created_relationship_context"
              ? `The existing person was preserved and the source opened one separate relationship context.${identityClueDetail}`
              : `The source was attached to the selected existing person and relationship. No duplicate identity or context was created.${identityClueDetail}`,
        status: "completed",
        title:
          outcome === "created_person"
            ? "Living person page created"
            : outcome === "created_relationship_context"
              ? "Relationship context added"
              : "Source attached to existing relationship",
      },
      { accountId, scope },
    );
    setAnnouncement(
      outcome === "created_person"
        ? "Living person page created from the first governed source."
        : outcome === "created_relationship_context"
          ? "A new relationship context was added to the existing person."
          : "The source was attached to the existing relationship.",
    );
    window.history.replaceState(
      null,
      "",
      `/workspace?person=${encodeURIComponent(
        scope.person.id,
      )}&context=${encodeURIComponent(scope.relationship_context.id)}`,
    );
    void refreshAgentHistory(
      scope.person.id,
      scope.relationship_context.id,
    );
  }

  function replaceIdentityReviewUrl(
    caseId: string | null,
    scope: RelationshipScope | null = activeScope
      ? {
          contract_version: CONTRACT_VERSION,
          person: activeScope.person,
          relationship_context: activeScope.relationship_context,
        }
      : null,
  ) {
    const parameters = new URLSearchParams();
    if (scope) {
      parameters.set("person", scope.person.id);
      parameters.set("context", scope.relationship_context.id);
    }
    if (caseId) {
      parameters.set("identity_case", caseId);
    }
    window.history.replaceState(
      null,
      "",
      parameters.size > 0
        ? `/workspace?${parameters.toString()}`
        : "/workspace",
    );
  }

  async function handleIdentityReviewCreated(caseId: string) {
    setBusy("Opening identity review");
    setError("");
    try {
      const response = await fetch(
        `/api/local-integration/identity-resolution-cases/${caseId}`,
        { cache: "no-store" },
      );
      const payload = (await response.json()) as
        | IdentityResolutionCase
        | { message?: string };
      if (!response.ok || !("candidates" in payload)) {
        throw new Error(
          "message" in payload && payload.message
            ? payload.message
            : "The saved identity review could not be opened.",
        );
      }
      setIdentityResolutionCase(payload);
      relationshipAgent.setCreateOpen(false);
      relationshipAgent.setOperation({
        title: "Identity review saved",
        detail:
          "The governed source remains outside every person Wiki until you resolve the identity.",
        status: "staged",
      });
      setAnnouncement(
        "Identity review saved. No person or relationship was changed.",
      );
      replaceIdentityReviewUrl(caseId);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The saved identity review could not be opened.",
      );
    } finally {
      setBusy("");
    }
  }

  function handleIdentityCaseUpdated(nextCase: IdentityResolutionCase) {
    setIdentityResolutionCase(nextCase);
    relationshipAgent.setOperation({
      title: "Identity left unresolved",
      detail:
        "The source and your decision note are saved. Neither candidate page nor Wiki changed.",
      status: "staged",
    });
    setAnnouncement(
      "Identity remains unresolved and can be resumed later.",
    );
    replaceIdentityReviewUrl(nextCase.id);
  }

  function handleIdentityCaseResolved(
    scope: RelationshipScope,
    compilation: KnowledgeSnapshot | null,
    compilationError: string | null,
  ) {
    setIdentityResolutionCase(null);
    setRelationshipScope(scope);
    setWorkspace(null);
    clearAgentHistory();
    relationshipAgent.setCreateOpen(false);
    relationshipAgent.clearGeneratedArtifacts();
    const verifiedCompilation =
      compilation && accountId && compilation.account_id !== accountId
        ? null
        : compilation;
    const verifiedCompilationError =
      compilation && !verifiedCompilation
        ? "The Wiki compilation returned from a different account and was not shown. Reload this relationship before retrying."
        : compilationError;
    setKnowledgeSnapshot(verifiedCompilation);
    if (compilation && !verifiedCompilation) {
      setError(verifiedCompilationError ?? "Wiki readback was rejected.");
    }
    relationshipAgent.setOperation(
      {
        title: verifiedCompilation
          ? "Identity resolved and Wiki recompiled"
          : "Identity resolved; Wiki needs retry",
        detail: verifiedCompilation
          ? `The governed source is now bound to ${scope.person.display_label} inside ${scope.relationship_context.display_label}. A new source-linked Wiki snapshot was published.`
          : verifiedCompilationError ??
            "The source is bound, but the derived Wiki has not been recompiled.",
        status: verifiedCompilation ? "completed" : "staged",
      },
      { accountId, scope },
    );
    setAnnouncement(
      verifiedCompilation
        ? "Identity resolved and a new Wiki snapshot was published."
        : "Identity resolved. Wiki compilation needs retry.",
    );
    replaceIdentityReviewUrl(null, scope);
    void refreshAgentHistory(
      scope.person.id,
      scope.relationship_context.id,
    );
  }

  function cancelAgentCreate() {
    relationshipAgent.setCreateOpen(false);
    relationshipAgent.setOperation({
      detail: "No person, relationship context, or source was created.",
      status: "no_change",
      title: "Contact draft canceled",
    });
    setAnnouncement("Contact draft canceled. Nothing was created.");
  }

  function handleResourcesCommitted(
    receipts: ResourceCaptureResponse[],
  ) {
    relationshipAgent.clearGeneratedArtifacts();
    setKnowledgeSnapshot(null);
    setError("");
    setAnnouncement(
      `${receipts.length} governed ${
        receipts.length === 1 ? "resource is" : "resources are"
      } attached. Compile a new brief to include them.`,
    );
    const firstReceipt = receipts[0];
    if (
      firstReceipt?.identity.person_id &&
      firstReceipt.identity.relationship_context_id
    ) {
      void refreshAgentHistory(
        firstReceipt.identity.person_id,
        firstReceipt.identity.relationship_context_id,
      );
    }
  }

  function handlePersonMergeMutation(
    response: PersonMergeWorkflowResponse,
    sourceLabel: string,
  ) {
    const failedCompilations = response.compilations.filter(
      (compilation) => compilation.status === "failed",
    ).length;
    relationshipAgent.clearGeneratedArtifacts();
    setKnowledgeSnapshot(null);
    setPersonMergeReversalPreview(null);
    setError("");
    const mergeOperation = {
      title:
        response.status === "applied"
          ? "Duplicate person page merged"
          : "Separate person pages restored",
      detail:
        response.status === "applied"
          ? `${sourceLabel} now resolves to this stable person page. ${response.affected_relationship_context_ids.length} relationship contexts and ${response.captures_rebound} governed sources moved with provenance intact.${
              failedCompilations > 0
                ? ` ${failedCompilations} Wiki compilations need retry.`
                : " Every affected relationship Wiki was recompiled."
            }`
          : `${sourceLabel} and its prior relationship contexts were restored as a separate person.${
              failedCompilations > 0
                ? ` ${failedCompilations} Wiki compilations need retry.`
                : " Every affected relationship Wiki was recompiled."
            }`,
      status: failedCompilations > 0 ? ("staged" as const) : ("completed" as const),
    };
    relationshipAgent.setOperation(mergeOperation);
    setAnnouncement(
      response.status === "applied"
        ? "Person merge applied with a reversible receipt."
        : "Person merge reversed and separate relationship memory restored.",
    );
    if (!activeScope) {
      return;
    }
    const currentContextRestoredToSource =
      response.status === "reversed" &&
      response.affected_relationship_context_ids.includes(
        activeScope.relationship_context.id,
      );
    if (currentContextRestoredToSource) {
      const restoredScope: RelationshipScope = {
        contract_version: CONTRACT_VERSION,
        person: {
          id: response.source_person_id,
          display_label: sourceLabel,
        },
        relationship_context: activeScope.relationship_context,
      };
      setRelationshipScope(restoredScope);
      setWorkspace(null);
      clearAgentHistory();
      relationshipAgent.setOperation(mergeOperation, {
        accountId,
        scope: restoredScope,
      });
      window.history.replaceState(
        null,
        "",
        `/workspace?person=${encodeURIComponent(
          restoredScope.person.id,
        )}&context=${encodeURIComponent(
          restoredScope.relationship_context.id,
        )}#contact-overview`,
      );
      void refreshAgentHistory(
        restoredScope.person.id,
        restoredScope.relationship_context.id,
      );
      return;
    }
    void refreshAgentHistory(
      activeScope.person.id,
      activeScope.relationship_context.id,
    );
  }

  async function handleReviewPersonMergeReversal(
    operationId: string,
  ) {
    setBusy("Reviewing merge history");
    setError("");
    try {
      const response = await fetch(
        `/api/local-integration/person-merges/${encodeURIComponent(
          operationId,
        )}/reversal`,
        { cache: "no-store" },
      );
      const payload = (await response.json()) as
        | PersonMergeReversalPreview
        | { message?: string };
      if (!response.ok || !("operation_id" in payload)) {
        throw new Error(
          "message" in payload && payload.message
            ? payload.message
            : "The prior merge could not be reopened for review.",
        );
      }
      setPersonMergeReversalPreview(payload);
      setPersonMergeRequested(true);
      relationshipAgent.setOperation({
        title: payload.reversal_available
          ? "Merge reversal review opened"
          : "Merge reversal needs attention",
        detail:
          payload.blockers.length > 0
            ? payload.blockers.map((blocker) => blocker.message).join(" ")
            : `The current ownership of ${payload.contexts_to_restore.length} relationship ${
                payload.contexts_to_restore.length === 1
                  ? "context"
                  : "contexts"
              } is ready for an explicit reversal decision.`,
        status: "staged",
      });
      setAnnouncement(
        payload.reversal_available
          ? "A fresh merge reversal review is ready."
          : "The prior merge is visible, but automatic reversal is paused.",
      );
      window.setTimeout(
        () => scrollWorkspaceTo("person-merge-review"),
        0,
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The prior merge could not be reopened for review.",
      );
    } finally {
      setBusy("");
    }
  }

  function openResourceComposer() {
    setResourceComposerOpen(true);
    window.setTimeout(() => scrollWorkspaceTo("relationship-resources"), 0);
  }


  return (
    <>
      <a className="skip-link" href="#context-main">
        Skip to contact context
      </a>
      <div
        className="context-workspace context-workspace--embedded"
        data-has-scope={Boolean(activeScope)}
      >
        <p className="sr-only" aria-live="polite" role="status">
          {announcement}
        </p>
        {!activeScope ? (
          <RelationshipAgentStartPanel
            createOpen={relationshipAgent.createOpen}
            identityResolutionCase={identityResolutionCase}
            onCancelCreate={cancelAgentCreate}
            onCaseUpdated={handleIdentityCaseUpdated}
            onCommitted={handleInitialResourcesCommitted}
            onCreateOpen={() => relationshipAgent.setCreateOpen(true)}
            onDeferred={(caseId) => void handleIdentityReviewCreated(caseId)}
            onResolved={handleIdentityCaseResolved}
            onScreenshot={() => setCaptureOpen(true)}
          />
        ) : null}

        <main className="context-main" id="context-main" tabIndex={-1}>
          <header className="context-topbar">
            <div>
              <span className="context-secure-state">
                <ShieldCheck aria-hidden="true" size={16} weight="duotone" />
                Private workspace
              </span>
              {activeScope ? (
                <span>
                  {workspace?.data_classification ===
                  "synthetic_fixture_only"
                    ? "Synthetic review"
                    : "Sensitive candidate evidence"}
                </span>
              ) : null}
            </div>
            <div>
              <Link href="/workspace/boundaries">Boundary cases</Link>
              <button
                className="context-primary-button context-primary-button--compact"
                onClick={() => setCaptureOpen(true)}
                type="button"
              >
                <Plus aria-hidden="true" size={17} />
                Import screenshot
              </button>
            </div>
          </header>

          <RelationshipWorkspaceStatus
            busy={busy}
            error={error}
            onDismissError={() => setError("")}
            sessionRecoveryHref={initialSessionRecoveryHref}
          />

          {!workspace && !relationshipScope ? (
            <RelationshipOnboarding
              deletionSummary={deletionSummary}
              onCommitted={handleInitialResourcesCommitted}
              onScreenshot={() => setCaptureOpen(true)}
            />
          ) : !workspace && relationshipScope ? (
            <div className="context-page context-page--resource-only">
              <RelationshipAgentPanel
                busyLabel={busy}
                createOpen={relationshipAgent.createOpen}
                history={agentHistory}
                identityResolutionCase={identityResolutionCase}
                mode="relationship"
                objective={relationshipAgent.objective}
                onAsk={() => void relationshipAgent.ask()}
                onCancelCreate={cancelAgentCreate}
                onIdentityCaseUpdated={handleIdentityCaseUpdated}
                onIdentityDeferred={(caseId) =>
                  void handleIdentityReviewCreated(caseId)
                }
                onIdentityResolved={handleIdentityCaseResolved}
                onInitialResourcesCommitted={handleInitialResourcesCommitted}
                onObjectiveChange={relationshipAgent.setObjective}
                onReviewMerge={(operationId) =>
                  void handleReviewPersonMergeReversal(operationId)
                }
                onReviewSources={openResourceComposer}
                onRunCommand={relationshipAgent.runUiCommand}
                operation={relationshipAgent.operation}
                pendingCount={0}
                response={relationshipAgent.response}
                scope={relationshipScope}
                submittedObjective={relationshipAgent.submittedObjective}
              />

              <RelationshipContactHeader scope={relationshipScope} />

              <RelationshipWikiPanel
                busy={busy === "Compiling a source-linked brief"}
                onCompile={() => void relationshipAgent.ask()}
                onReviewSources={openResourceComposer}
                response={relationshipAgent.response}
                snapshot={knowledgeSnapshot}
              />

              <PersonMergeReview
                currentPerson={relationshipScope.person}
                forceOpen={personMergeRequested}
                onCloseRequest={() => {
                  setPersonMergeRequested(false);
                  setPersonMergeReversalPreview(null);
                }}
                onMutation={handlePersonMergeMutation}
                reversalPreview={personMergeReversalPreview}
              />

              <RelationshipExternalEffectReview history={agentHistory} />

              <RelationshipResourceSection
                onCommitted={handleResourcesCommitted}
                onEvidenceChanged={(announcement, relationshipRemoved) => {
                  if (relationshipRemoved) {
                    handleRelationshipRemoved(
                      announcement ??
                        "Source lineage deleted. No active relationship remains.",
                    );
                    return;
                  }
                  relationshipAgent.clearGeneratedArtifacts();
                  setKnowledgeSnapshot(null);
                  setAnnouncement(
                    announcement ??
                      "Evidence review saved. Compile a new brief to use the updated source state.",
                  );
                  void refreshAgentHistory(
                    relationshipScope.person.id,
                    relationshipScope.relationship_context.id,
                  );
                }}
                onOpen={openResourceComposer}
                onScreenshot={() => setCaptureOpen(true)}
                open={resourceComposerOpen}
                personId={relationshipScope.person.id}
                relationshipContextId={
                  relationshipScope.relationship_context.id
                }
                scopeLabel={`${relationshipScope.person.display_label} · ${relationshipScope.relationship_context.display_label}`}
              />
            </div>
          ) : workspace ? (
            <div className="context-page">
              <RelationshipAgentPanel
                busyLabel={busy}
                createOpen={relationshipAgent.createOpen}
                history={agentHistory}
                identityResolutionCase={identityResolutionCase}
                mode="review"
                objective={relationshipAgent.objective}
                onAsk={() => void relationshipAgent.ask()}
                onCancelCreate={cancelAgentCreate}
                onIdentityCaseUpdated={handleIdentityCaseUpdated}
                onIdentityDeferred={(caseId) =>
                  void handleIdentityReviewCreated(caseId)
                }
                onIdentityResolved={handleIdentityCaseResolved}
                onInitialResourcesCommitted={handleInitialResourcesCommitted}
                onObjectiveChange={relationshipAgent.setObjective}
                onReviewMerge={(operationId) =>
                  void handleReviewPersonMergeReversal(operationId)
                }
                onReviewSources={openResourceComposer}
                onRunCommand={relationshipAgent.runUiCommand}
                operation={relationshipAgent.operation}
                pendingCount={pendingCount}
                response={relationshipAgent.response}
                scope={{
                  person: workspace.subject,
                  relationship_context: workspace.assignment,
                }}
                submittedObjective={relationshipAgent.submittedObjective}
              />
              <RelationshipContactHeader
                scope={{
                  person: workspace.subject,
                  relationship_context: workspace.assignment,
                }}
                workspace={workspace}
              />

              <RelationshipWikiPanel
                busy={busy === "Compiling a source-linked brief"}
                onCompile={() => void relationshipAgent.ask()}
                onReviewSources={openResourceComposer}
                response={relationshipAgent.response}
                snapshot={knowledgeSnapshot}
              />

              <PersonMergeReview
                currentPerson={{
                  id: workspace.subject.id,
                  display_label: workspace.subject.display_label,
                }}
                forceOpen={personMergeRequested}
                onCloseRequest={() => {
                  setPersonMergeRequested(false);
                  setPersonMergeReversalPreview(null);
                }}
                onMutation={handlePersonMergeMutation}
                reversalPreview={personMergeReversalPreview}
              />

              <RelationshipExternalEffectReview history={agentHistory} />

              <RelationshipResourceSection
                onCommitted={handleResourcesCommitted}
                onEvidenceChanged={async (
                  announcement,
                  relationshipRemoved,
                ) => {
                  if (relationshipRemoved) {
                    handleRelationshipRemoved(
                      announcement ??
                        "Source lineage deleted. No active relationship remains.",
                    );
                    return;
                  }
                  relationshipAgent.clearGeneratedArtifacts();
                  setKnowledgeSnapshot(null);
                  const refreshed = await refreshWorkspaceReview(
                    workspace.capture.id,
                  );
                  setAnnouncement(
                    refreshed
                      ? announcement ??
                          "Evidence review saved. Compile a new brief to use the updated source state."
                      : `${
                          announcement ?? "Evidence review saved."
                        } The current review could not refresh; reload before making another decision.`,
                  );
                  void refreshAgentHistory(
                    workspace.subject.id,
                    workspace.assignment.id,
                  );
                }}
                onOpen={openResourceComposer}
                onScreenshot={() => setCaptureOpen(true)}
                open={resourceComposerOpen}
                personId={workspace.subject.id}
                relationshipContextId={workspace.assignment.id}
                scopeLabel={`${workspace.subject.display_label} · ${workspace.assignment.display_label}`}
              />

              <RelationshipSourceLineage workspace={workspace} />

              <div className="context-page-grid">
                <div className="context-page-primary">
                  <RelationshipFactReview
                    busy={Boolean(busy)}
                    mutate={mutate}
                    workspace={workspace}
                  />

                  <RelationshipEvidenceProjection workspace={workspace} />
                </div>

                <aside
                  aria-label="Next move and relationship history"
                  className="context-page-aside"
                >
                  <RelationshipNextMove
                    busy={Boolean(busy)}
                    mutate={mutate}
                    onAnnouncement={setAnnouncement}
                    onBusyChange={setBusy}
                    onError={setError}
                    workspace={workspace}
                  />

                  <RelationshipOutcomeTimeline workspace={workspace} />
                  <GovernedCaptureDeletion
                    busy={Boolean(busy)}
                    captureId={workspace.capture.id}
                    onBusyChange={setBusy}
                    onDeleted={handleCaptureDeleted}
                    onError={setError}
                  />
                </aside>
              </div>
            </div>
          ) : null}
        </main>
      </div>

      {captureOpen ? (
        <CapturePanel
          onClose={closeCapture}
          onCommitted={handleCommitted}
        />
      ) : null}
    </>
  );
}
