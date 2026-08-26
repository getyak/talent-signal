"use client";

import type {
  PersonDirectoryItem,
  PublicResearchResponse,
  RelationshipResourceDetail,
  RelationshipResourceListItem,
  ResourceCaptureResponse,
  SourceAuthorizationDecisionResponse,
} from "@talent-signal/contracts";
import {
  ArrowRight,
  ChatCircleDots,
  Check,
  CheckCircle,
  CircleNotch,
  FileImage,
  LinkSimple,
  PencilSimple,
  Plus,
  Prohibit,
  Quotes,
  ShieldCheck,
  Sparkle,
  Trash,
  UploadSimple,
  Warning,
  X,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";

import type { ConversationTranscriptMessage } from "@/lib/conversation-transcript";
import { ConversationTranscriptComposer } from "./conversation-transcript-composer";
import { fieldLabel, formatDate, reviewLabel } from "./relationship-display";
import {
  relationshipIntegrationFetch,
  relationshipIntegrationSessionExpired,
} from "@/components/workspace-session-request";

type ResourceMode = "conversation" | "note" | "document" | "url";

const relationshipResourceListRequests = new Map<
  string,
  Promise<RelationshipResourceListItem[]>
>();

export function loadRelationshipResourceList(
  personId: string,
  relationshipContextId: string,
  { fresh = false }: { fresh?: boolean } = {},
) {
  const query = new URLSearchParams({
    person_id: personId,
    relationship_context_id: relationshipContextId,
  });
  const key = query.toString();
  const existing = relationshipResourceListRequests.get(key);
  if (!fresh && existing) {
    return existing;
  }

  const request = relationshipIntegrationFetch(
    `/api/local-integration/resources?${query}`,
    { cache: "no-store" },
  ).then(async (response) => {
    const payload = (await response.json()) as
      | { resources: RelationshipResourceListItem[] }
      | { message?: string };
    if (!response.ok || !("resources" in payload)) {
      throw new Error(
        "message" in payload && payload.message
          ? payload.message
          : "Relationship resources could not be loaded.",
      );
    }
    return payload.resources;
  });

  if (!fresh) {
    relationshipResourceListRequests.set(key, request);
    const clear = () => {
      if (relationshipResourceListRequests.get(key) === request) {
        relationshipResourceListRequests.delete(key);
      }
    };
    void request.then(clear, clear);
  }
  return request;
}

export function RelationshipResourceComposer({
  personId,
  relationshipContextId,
  scopeLabel,
  onCommitted,
  onEvidenceChanged,
  onIdentityCorrected,
  onReviewCapture,
  onScreenshot,
}: {
  personId: string;
  relationshipContextId: string;
  scopeLabel: string;
  onCommitted: (receipts: ResourceCaptureResponse[]) => void;
  onEvidenceChanged: (
    announcement?: string,
    relationshipRemoved?: boolean,
  ) => void | Promise<void>;
  onIdentityCorrected: (input: {
    captureId: string;
    captureIdsRebound: number;
    personId: string;
    relationshipContextId: string;
  }) => Promise<"opened" | "session_expired" | "unavailable">;
  onReviewCapture: (captureId: string) => void | Promise<void>;
  onScreenshot: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const requestIdRef = useRef<string | null>(null);
  const requestCapturedAtRef = useRef<string | null>(null);
  const [mode, setMode] = useState<ResourceMode>("note");
  const [title, setTitle] = useState("");
  const [value, setValue] = useState("");
  const [transcriptMessages, setTranscriptMessages] = useState<
    ConversationTranscriptMessage[]
  >([]);
  const [transcriptAttributionReviewed, setTranscriptAttributionReviewed] =
    useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [documentKind, setDocumentKind] = useState<
    "resume" | "document"
  >("resume");
  const [saveDiscoveredLinks, setSaveDiscoveredLinks] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<{
    resources: number;
    linksFound: number;
    warnings: number;
  } | null>(null);
  const [resources, setResources] = useState<
    RelationshipResourceListItem[]
  >([]);
  const [selectedResource, setSelectedResource] =
    useState<RelationshipResourceDetail | null>(null);
  const [claimEdits, setClaimEdits] = useState<Record<string, string>>({});
  const [resourceLoading, setResourceLoading] = useState(true);
  const [deleteResourceConfirm, setDeleteResourceConfirm] =
    useState(false);
  const [researchApproval, setResearchApproval] = useState(false);
  const [researchPageCount, setResearchPageCount] = useState(1);
  const [researchLinkDepth, setResearchLinkDepth] = useState(0);
  const [researchResult, setResearchResult] =
    useState<PublicResearchResponse | null>(null);
  const identityCorrectionRequestRef = useRef<string | null>(null);
  const [identityCorrectionOpen, setIdentityCorrectionOpen] =
    useState(false);
  const [identityPeople, setIdentityPeople] = useState<
    PersonDirectoryItem[]
  >([]);
  const [identityPeopleLoading, setIdentityPeopleLoading] =
    useState(false);
  const [identityTargetMode, setIdentityTargetMode] = useState<
    "existing" | "new"
  >("existing");
  const [identityTargetPersonId, setIdentityTargetPersonId] =
    useState("");
  const [identityTargetContextId, setIdentityTargetContextId] =
    useState("");
  const [identityNewPersonLabel, setIdentityNewPersonLabel] =
    useState("");
  const [identityNewContextLabel, setIdentityNewContextLabel] =
    useState("");
  const [identityCorrectionReason, setIdentityCorrectionReason] =
    useState("");
  const sourceAuthorizationRequestRef = useRef<string | null>(null);
  const [sourceAuthorizationOpen, setSourceAuthorizationOpen] =
    useState(false);
  const [sourceAuthorizationReason, setSourceAuthorizationReason] =
    useState("");
  const [
    sourceAuthorizationExpiresAt,
    setSourceAuthorizationExpiresAt,
  ] = useState("");

  const identityTargetPerson =
    identityPeople.find(
      (person) => person.id === identityTargetPersonId,
    ) ?? null;

  function resetIdentityCorrectionRequest() {
    identityCorrectionRequestRef.current = null;
  }

  function resetSourceAuthorizationDecision() {
    sourceAuthorizationRequestRef.current = null;
    setSourceAuthorizationReason("");
    setSourceAuthorizationExpiresAt("");
  }

  async function beginIdentityCorrection() {
    setDeleteResourceConfirm(false);
    setSourceAuthorizationOpen(false);
    resetSourceAuthorizationDecision();
    setIdentityCorrectionOpen(true);
    setIdentityPeopleLoading(true);
    setError("");
    try {
      const response = await relationshipIntegrationFetch(
        "/api/local-integration/people",
        { cache: "no-store" },
      );
      const payload = (await response.json()) as
        | { people: PersonDirectoryItem[] }
        | { message?: string };
      if (!response.ok || !("people" in payload)) {
        throw new Error(
          "message" in payload && payload.message
            ? payload.message
            : "Existing people could not be loaded.",
        );
      }
      const alternatives = payload.people.filter(
        (person) => person.id !== personId,
      );
      setIdentityPeople(alternatives);
      setIdentityTargetPersonId("");
      setIdentityTargetContextId("");
      setIdentityTargetMode(
        alternatives.length > 0 ? "existing" : "new",
      );
      resetIdentityCorrectionRequest();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Existing people could not be loaded.",
      );
    } finally {
      setIdentityPeopleLoading(false);
    }
  }

  async function correctSelectedResourceIdentity() {
    if (!selectedResource || !identityCorrectionReason.trim()) {
      return;
    }
    const existingContext =
      identityTargetMode === "existing" &&
      identityTargetPerson?.contexts.find(
        (context) => context.id === identityTargetContextId,
      );
    const createsContext =
      identityTargetMode === "existing" &&
      identityTargetContextId === "__new__";
    const target =
      identityTargetMode === "existing" && identityTargetPerson
        ? {
            status: "existing_person" as const,
            person_id: identityTargetPerson.id,
            relationship_context: existingContext
              ? {
                  status: "existing" as const,
                  relationship_context_id: existingContext.id,
                }
              : {
                  status: "proposed" as const,
                  label: identityNewContextLabel.trim(),
                  purpose:
                    "Correct a governed source into the recruiter-selected relationship context",
                },
          }
        : {
            status: "new_person" as const,
            display_label: identityNewPersonLabel.trim(),
            relationship_context: {
              status: "proposed" as const,
              label: identityNewContextLabel.trim(),
              purpose:
                "Correct a governed source into a newly created person and relationship context",
            },
          };
    const targetReady =
      target.status === "existing_person"
        ? Boolean(
            identityTargetPerson &&
              (existingContext ||
                (createsContext && identityNewContextLabel.trim())),
          )
        : Boolean(
            identityNewPersonLabel.trim() &&
              identityNewContextLabel.trim(),
          );
    if (!targetReady) {
      return;
    }

    setBusy(true);
    setError("");
    identityCorrectionRequestRef.current ??= crypto.randomUUID();
    try {
      const response = await relationshipIntegrationFetch(
        `/api/local-integration/captures/${selectedResource.resource.capture_id}/identity-corrections`,
        {
          method: "POST",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            idempotency_key: identityCorrectionRequestRef.current,
            expected_capture_version:
              selectedResource.resource.capture_version,
            expected_person_id: personId,
            expected_relationship_context_id:
              relationshipContextId,
            reason: identityCorrectionReason.trim(),
            binding_basis:
              "The recruiter inspected this governed source and explicitly selected the corrected person and relationship context.",
            target,
          }),
        },
      );
      const payload = (await response.json()) as
        | {
            capture_ids_rebound: string[];
            claims_reopened: number;
            person_id: string;
            relationship_context_id: string;
          }
        | { message?: string };
      if (
        relationshipIntegrationSessionExpired(response.status, payload)
      ) {
        return;
      }
      if (!response.ok || !("person_id" in payload)) {
        throw new Error(
          "message" in payload && payload.message
            ? payload.message
            : "The source identity could not be corrected.",
        );
      }
      const readback = await onIdentityCorrected({
        captureId: selectedResource.resource.capture_id,
        captureIdsRebound: payload.capture_ids_rebound.length,
        personId: payload.person_id,
        relationshipContextId: payload.relationship_context_id,
      });
      if (readback === "unavailable") {
        setError(
          "The identity correction was recorded, but the corrected relationship could not be read back. Reload before another decision.",
        );
      }
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The source identity could not be corrected.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function loadResources() {
    setResourceLoading(true);
    try {
      setResources(
        await loadRelationshipResourceList(
          personId,
          relationshipContextId,
          { fresh: true },
        ),
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Relationship resources could not be loaded.",
      );
    } finally {
      setResourceLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    void loadRelationshipResourceList(personId, relationshipContextId)
      .then((resources) => {
        if (active) {
          setResources(resources);
        }
      })
      .catch((caught: unknown) => {
        if (active) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Relationship resources could not be loaded.",
          );
        }
      })
      .finally(() => {
        if (active) {
          setResourceLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [personId, relationshipContextId]);

  async function openResource(resourceId: string) {
    setError("");
    try {
      const response = await relationshipIntegrationFetch(
        `/api/local-integration/resources?resource_id=${encodeURIComponent(
          resourceId,
        )}`,
        { cache: "no-store" },
      );
      const payload = (await response.json()) as
        | RelationshipResourceDetail
        | { message?: string };
      if (!response.ok || !("fragments" in payload)) {
        throw new Error(
          "message" in payload && payload.message
            ? payload.message
            : "The source evidence could not be opened.",
        );
      }
      setSelectedResource(payload);
      setClaimEdits(
        Object.fromEntries(
          payload.claim_proposals.map((claim) => [
            claim.id,
            claim.proposed_value ?? "",
          ]),
        ),
      );
      setResearchApproval(false);
      setResearchResult(null);
      setIdentityCorrectionOpen(false);
      setIdentityCorrectionReason("");
      resetIdentityCorrectionRequest();
      setSourceAuthorizationOpen(false);
      resetSourceAuthorizationDecision();
      if (
        payload.resource.kind === "public_url" &&
        payload.resource.input_channel !== "api_connector" &&
        payload.resource.source_locator
      ) {
        try {
          await refreshResearchStatus(payload.resource.id);
        } catch (caught) {
          setError(
            caught instanceof Error
              ? caught.message
              : "The source opened, but its prior research status could not be restored.",
          );
        }
      }
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The source evidence could not be opened.",
      );
    }
  }

  async function loadLatestResearch(
    seedResourceId: string,
  ): Promise<PublicResearchResponse | null> {
    const query = new URLSearchParams({
      seed_resource_id: seedResourceId,
    });
    const response = await relationshipIntegrationFetch(
      `/api/local-integration/research?${query}`,
      { cache: "no-store" },
    );
    const payload = (await response.json()) as
      | PublicResearchResponse
      | null
      | { message?: string };
    if (!response.ok) {
      throw new Error(
        payload &&
          "message" in payload &&
          typeof payload.message === "string"
          ? payload.message
          : "The prior public research status could not be restored.",
      );
    }
    if (payload === null || "task_id" in payload) {
      return payload;
    }
    throw new Error(
      "The prior public research status could not be restored.",
    );
  }

  async function refreshResearchStatus(seedResourceId?: string) {
    const resourceId =
      seedResourceId ?? selectedResource?.resource.id;
    if (!resourceId) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      setResearchResult(await loadLatestResearch(resourceId));
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The prior public research status could not be restored.",
      );
      throw caught;
    } finally {
      setBusy(false);
    }
  }

  async function researchSelectedResource() {
    if (
      !selectedResource ||
      selectedResource.resource.kind !== "public_url" ||
      !selectedResource.resource.source_locator
    ) {
      return;
    }
    let domain: string;
    try {
      domain = new URL(
        selectedResource.resource.source_locator,
      ).hostname.toLowerCase();
    } catch {
      setError("The saved public URL is invalid.");
      return;
    }
    setBusy(true);
    setError("");
    setResearchResult(null);
    try {
      const response = await relationshipIntegrationFetch(
        "/api/local-integration/research",
        {
          method: "POST",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
          request_id: crypto.randomUUID(),
          person_id: personId,
          relationship_context_id: relationshipContextId,
          seed_resource_id: selectedResource.resource.id,
          expected_seed_url:
            selectedResource.resource.source_locator,
          allowed_domain: domain,
          maximum_page_count: researchPageCount,
          maximum_link_depth: researchLinkDepth,
          }),
        },
      );
      const payload = (await response.json()) as
        | PublicResearchResponse
        | { message?: string };
      if (!response.ok || !("task_id" in payload)) {
        throw new Error(
          "message" in payload && payload.message
            ? payload.message
            : "The bounded public research could not be completed.",
        );
      }
      setResearchResult(payload);
      setResearchApproval(false);
      await loadResources();
      onEvidenceChanged();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The bounded public research could not be completed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function decideFragment(
    fragmentId: string,
    currentStatus: "proposed" | "reviewed" | "rejected",
    decision: "reviewed" | "rejected",
  ) {
    setBusy(true);
    setError("");
    try {
      const response = await relationshipIntegrationFetch(
        `/api/local-integration/evidence-fragments/${fragmentId}/reviews`,
        {
          method: "POST",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            idempotency_key: crypto.randomUUID(),
            expected_review_status: currentStatus,
            expected_last_review_id: null,
            decision,
            reason:
              decision === "reviewed"
                ? "The recruiter compared this extraction with the visible source."
                : "The recruiter rejected this extraction as unreliable.",
          }),
        },
      );
      const payload = (await response.json()) as { message?: string };
      if (!response.ok) {
        throw new Error(
          payload.message ?? "The evidence review could not be saved.",
        );
      }
      if (selectedResource) {
        await openResource(selectedResource.resource.id);
      }
      await loadResources();
      onEvidenceChanged();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The evidence review could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function decideClaim(
    claim: RelationshipResourceDetail["claim_proposals"][number],
    decision: "confirm" | "dismiss" | "leave_unresolved",
  ) {
    if (!selectedResource) {
      return;
    }
    const correctedValue = claimEdits[claim.id]?.trim() ?? "";
    if (decision === "confirm" && !correctedValue) {
      setError("Add the value you intend to confirm.");
      return;
    }
    const resourceId = selectedResource.resource.id;
    setBusy(true);
    setError("");
    try {
      const response = await relationshipIntegrationFetch(
        `/api/local-integration/resource-claims/${claim.id}/decisions`,
        {
          method: "POST",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            idempotency_key: crypto.randomUUID(),
            expected_assertion_version: claim.version,
            decision,
            ...(decision === "confirm"
              ? { corrected_value: correctedValue }
              : {}),
          }),
        },
      );
      const payload = (await response.json()) as { message?: string };
      if (!response.ok) {
        throw new Error(
          payload.message ?? "The fact decision could not be saved.",
        );
      }
      await openResource(resourceId);
      await loadResources();
      onEvidenceChanged();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The fact decision could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function deleteSelectedResource() {
    if (!selectedResource) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await relationshipIntegrationFetch(
        `/api/local-integration/captures/${selectedResource.resource.capture_id}/deletion`,
        {
          method: "POST",
          cache: "no-store",
        },
      );
      const payload = (await response.json()) as {
        message?: string;
        compilation?: { status?: string } | null;
        compilation_error?: string | null;
      };
      if (!response.ok) {
        throw new Error(
          payload.message ?? "The governed source could not be deleted.",
        );
      }
      setSelectedResource(null);
      setDeleteResourceConfirm(false);
      const relationshipRemoved =
        !payload.compilation && !payload.compilation_error;
      const announcement = payload.compilation?.status === "published"
        ? "Source lineage deleted. The relationship Wiki was rebuilt from the governed sources that remain."
        : payload.compilation_error
          ? `Source lineage deleted. Wiki recompilation needs attention: ${payload.compilation_error}`
          : "Source lineage deleted. No active relationship remains.";
      if (relationshipRemoved) {
        onEvidenceChanged(announcement, true);
        return;
      }
      await loadResources();
      onEvidenceChanged(announcement);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The governed source could not be deleted.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function decideSelectedSourceAuthorization() {
    if (!selectedResource || !sourceAuthorizationReason.trim()) {
      return;
    }
    const decision =
      selectedResource.resource.source_authorization_state ===
      "authorized"
        ? "revoke"
        : "restore";
    let authorizationExpiresAt: string | undefined;
    if (decision === "restore" && sourceAuthorizationExpiresAt) {
      const parsedExpiry = new Date(sourceAuthorizationExpiresAt);
      if (
        !Number.isFinite(parsedExpiry.getTime()) ||
        parsedExpiry <= new Date()
      ) {
        setError(
          "Choose a source-authorization deadline in the future.",
        );
        return;
      }
      authorizationExpiresAt = parsedExpiry.toISOString();
    }
    const resourceId = selectedResource.resource.id;
    setBusy(true);
    setError("");
    sourceAuthorizationRequestRef.current ??= crypto.randomUUID();
    try {
      const response = await relationshipIntegrationFetch(
        `/api/local-integration/captures/${selectedResource.resource.capture_id}/source-authorization`,
        {
          method: "POST",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            idempotency_key:
              sourceAuthorizationRequestRef.current,
            expected_capture_version:
              selectedResource.resource.capture_version,
            decision,
            reason: sourceAuthorizationReason.trim(),
            ...(authorizationExpiresAt
              ? {
                  authorization_expires_at:
                    authorizationExpiresAt,
                }
              : {}),
          }),
        },
      );
      const payload = (await response.json()) as
        | SourceAuthorizationDecisionResponse
        | { message?: string };
      if (!response.ok || !("authorization_state" in payload)) {
        throw new Error(
          "message" in payload && payload.message
            ? payload.message
            : "The source authorization could not be changed.",
        );
      }
      await openResource(resourceId);
      await loadResources();
      setSourceAuthorizationOpen(false);
      resetSourceAuthorizationDecision();
      const externalEffectFollowUp =
        payload.external_effects_requiring_follow_up > 0
          ? ` ${payload.external_effects_requiring_follow_up} ${
              payload.external_effects_requiring_follow_up === 1
                ? "external effect still requires"
                : "external effects still require"
            } recruiter follow-up; nothing already completed was represented as undone.`
          : "";
      const authorizationMessage =
        payload.decision === "revoke"
          ? payload.compilation
            ? `Source access revoked. ${payload.states_retracted} confirmed ${
                payload.states_retracted === 1 ? "state was" : "states were"
              } withdrawn, and the relationship Wiki was rebuilt from authorized sources that remain.`
            : `Source access revoked. Wiki recompilation needs attention: ${
                payload.compilation_error ??
                "no authorized relationship memory was publishable"
              }`
          : payload.compilation
            ? `Source access restored for review. ${payload.claims_reopened} ${
                payload.claims_reopened === 1 ? "claim is" : "claims are"
              } pending; no prior conclusion or action was restored automatically.`
            : `Source access restored for review. Wiki recompilation needs attention: ${
                payload.compilation_error ??
                "the restored evidence still requires review"
              }`;
      await onEvidenceChanged(
        `${authorizationMessage}${externalEffectFollowUp}`,
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The source authorization could not be changed.",
      );
    } finally {
      setBusy(false);
    }
  }

  function resetRequest() {
    requestIdRef.current = null;
    requestCapturedAtRef.current = null;
    setReceipt(null);
    setError("");
  }

  async function submit() {
    if (
      (mode === "document" && !file) ||
      (mode === "conversation" &&
        (transcriptMessages.length === 0 ||
          !transcriptAttributionReviewed)) ||
      (mode !== "document" && mode !== "conversation" && !value.trim())
    ) {
      setError(
        mode === "document"
          ? "Choose one resume or document."
          : mode === "conversation"
            ? "Analyze the transcript and confirm every speaker label."
          : "Add the context you want to preserve.",
      );
      return;
    }
    if (!requestIdRef.current) {
      requestIdRef.current = crypto.randomUUID();
      requestCapturedAtRef.current = new Date().toISOString();
    }
    const capturedAt = requestCapturedAtRef.current;
    if (!capturedAt) {
      setError("The source observation time could not be preserved.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      let response: Response;
      if (mode === "document" && file) {
        const form = new FormData();
        form.set("request_id", requestIdRef.current);
        form.set("captured_at", capturedAt);
        form.set("person_id", personId);
        form.set("relationship_context_id", relationshipContextId);
        form.set("document_kind", documentKind);
        form.set(
          "save_discovered_links",
          saveDiscoveredLinks ? "true" : "false",
        );
        form.set("file", file);
        response = await relationshipIntegrationFetch(
          "/api/local-integration/resources",
          {
            method: "POST",
            body: form,
            cache: "no-store",
          },
        );
      } else {
        response = await relationshipIntegrationFetch(
          "/api/local-integration/resources",
          {
            method: "POST",
            cache: "no-store",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
            request_id: requestIdRef.current,
            captured_at: capturedAt,
            person_id: personId,
            relationship_context_id: relationshipContextId,
            type: mode,
            title: title.trim() || undefined,
            value: value.trim(),
            ...(mode === "conversation"
              ? {
                  transcript_messages: transcriptMessages,
                  attribution_reviewed: transcriptAttributionReviewed,
                }
              : {}),
            }),
          },
        );
      }
      const payload = (await response.json()) as
        | {
            receipts: ResourceCaptureResponse[];
            discovered_links: string[];
            parser_warnings: string[];
          }
        | { message?: string };
      if (!response.ok || !("receipts" in payload)) {
        throw new Error(
          "message" in payload && payload.message
            ? payload.message
            : "The context could not be attached.",
        );
      }
      setReceipt({
        resources: payload.receipts.length,
        linksFound: payload.discovered_links.length,
        warnings: payload.parser_warnings.length,
      });
      setTitle("");
      setValue("");
      setTranscriptMessages([]);
      setTranscriptAttributionReviewed(false);
      setFile(null);
      onCommitted(payload.receipts);
      await loadResources();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The context could not be attached.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby="add-context-title"
      className="context-resource-composer"
      id="relationship-resources"
    >
      <div className="context-resource-composer__heading">
        <div>
          <p className="eyebrow">ADD CONTEXT</p>
          <h2 id="add-context-title">One person, more than one source.</h2>
          <p>
            Attach to {scopeLabel}. Each source keeps its own authority,
            evidence location, and deletion path.
          </p>
        </div>
        <div aria-label="Context source type" role="tablist">
          <button
            aria-selected={mode === "note"}
            onClick={() => {
              setMode("note");
              resetRequest();
            }}
            role="tab"
            type="button"
          >
            <PencilSimple aria-hidden="true" size={16} />
            Note
          </button>
          <button
            aria-selected={mode === "conversation"}
            onClick={() => {
              setMode("conversation");
              resetRequest();
            }}
            role="tab"
            type="button"
          >
            <ChatCircleDots aria-hidden="true" size={16} />
            Transcript
          </button>
          <button
            aria-selected={mode === "document"}
            onClick={() => {
              setMode("document");
              resetRequest();
            }}
            role="tab"
            type="button"
          >
            <UploadSimple aria-hidden="true" size={16} />
            File
          </button>
          <button
            aria-selected={mode === "url"}
            onClick={() => {
              setMode("url");
              resetRequest();
            }}
            role="tab"
            type="button"
          >
            <LinkSimple aria-hidden="true" size={16} />
            Link
          </button>
          <button onClick={onScreenshot} type="button">
            <FileImage aria-hidden="true" size={16} />
            Screenshot
          </button>
        </div>
      </div>

      {mode === "conversation" ? (
        <ConversationTranscriptComposer
          attributionReviewed={transcriptAttributionReviewed}
          messages={transcriptMessages}
          onAttributionReviewedChange={(reviewed) => {
            setTranscriptAttributionReviewed(reviewed);
            resetRequest();
          }}
          onMessagesChange={(messages) => {
            setTranscriptMessages(messages);
            resetRequest();
          }}
          onTitleChange={(nextTitle) => {
            setTitle(nextTitle);
            resetRequest();
          }}
          onValueChange={(nextValue) => {
            setValue(nextValue);
            resetRequest();
          }}
          title={title}
          value={value}
        />
      ) : mode === "document" ? (
        <div className="context-resource-composer__document">
          <input
            accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown"
            className="sr-only"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              resetRequest();
            }}
            ref={fileInputRef}
            type="file"
          />
          <button
            className="context-resource-file"
            onClick={() => fileInputRef.current?.click()}
            type="button"
          >
            <UploadSimple aria-hidden="true" size={20} />
            <span>
              <strong>{file?.name ?? "Choose PDF, DOCX, TXT, or Markdown"}</strong>
              <small>
                {file
                  ? `${(file.size / 1024 / 1024).toFixed(1)} MB`
                  : "Raw file is parsed transiently and is not retained."}
              </small>
            </span>
          </button>
          <label>
            <span>Document meaning</span>
            <select
              onChange={(event) => {
                setDocumentKind(
                  event.target.value as "resume" | "document",
                );
                resetRequest();
              }}
              value={documentKind}
            >
              <option value="resume">Resume</option>
              <option value="document">Supporting document</option>
            </select>
          </label>
          <label className="context-resource-checkbox">
            <input
              checked={saveDiscoveredLinks}
              onChange={(event) => {
                setSaveDiscoveredLinks(event.target.checked);
                resetRequest();
              }}
              type="checkbox"
            />
            <span>
              Save visible URLs as research seeds
              <small>
                This does not fetch pages or authorize deep research.
              </small>
            </span>
          </label>
        </div>
      ) : (
        <div className="context-resource-composer__text">
          <label>
            <span>{mode === "note" ? "Note title" : "Link label"}</span>
            <input
              maxLength={240}
              onChange={(event) => {
                setTitle(event.target.value);
                resetRequest();
              }}
              placeholder={
                mode === "note"
                  ? "e.g. Prep for Thursday call"
                  : "e.g. Portfolio or public profile"
              }
              value={title}
            />
          </label>
          <label>
            <span>{mode === "note" ? "Your note" : "Public URL"}</span>
            {mode === "note" ? (
              <textarea
                maxLength={40_000}
                onChange={(event) => {
                  setValue(event.target.value);
                  resetRequest();
                }}
                placeholder="What do you want your future self to remember? This remains a recruiter-authored note, not candidate testimony."
                rows={3}
                value={value}
              />
            ) : (
              <input
                maxLength={2_000}
                onChange={(event) => {
                  setValue(event.target.value);
                  resetRequest();
                }}
                placeholder="https://"
                type="url"
                value={value}
              />
            )}
          </label>
        </div>
      )}

      {error ? (
        <p className="context-resource-composer__error" role="alert">
          <Warning aria-hidden="true" size={16} />
          {error}
        </p>
      ) : null}
      {receipt ? (
        <p className="context-resource-composer__receipt" role="status">
          <CheckCircle aria-hidden="true" size={17} weight="fill" />
          {receipt.resources} governed{" "}
          {receipt.resources === 1 ? "resource" : "resources"} attached
          {receipt.linksFound > 0
            ? ` · ${receipt.linksFound} visible links found`
            : ""}
          {receipt.warnings > 0
            ? ` · ${receipt.warnings} parser warnings retained`
            : ""}
        </p>
      ) : null}
      <footer>
        <p>
          Every source remains separately reviewable. Saving a URL is not
          permission to crawl it.
        </p>
        <button
          className="context-primary-button context-primary-button--compact"
          disabled={
            busy ||
            (mode === "document"
              ? !file
              : mode === "conversation"
                ? transcriptMessages.length === 0 ||
                  !transcriptAttributionReviewed
                : !value.trim())
          }
          onClick={() => void submit()}
          type="button"
        >
          {busy ? (
            <CircleNotch aria-hidden="true" className="spin" size={17} />
          ) : (
            <Plus aria-hidden="true" size={17} />
          )}
          {busy ? "Attaching source" : "Attach to person"}
        </button>
      </footer>

      <div className="context-resource-ledger">
        <div>
          <h3>Sources on this relationship</h3>
          <span>
            {resourceLoading
              ? "Loading…"
              : `${resources.length} governed ${
                  resources.length === 1 ? "source" : "sources"
                }`}
          </span>
        </div>
        {resources.length > 0 ? (
          <div className="context-resource-ledger__list">
            {resources.map((resource) => (
              <button
                data-state={resource.processing_state}
                key={resource.id}
                onClick={() => void openResource(resource.id)}
                type="button"
              >
                <span>
                  {resource.kind === "personal_note" ? (
                    <PencilSimple aria-hidden="true" size={17} />
                  ) : resource.kind === "conversation_transcript" ? (
                    <ChatCircleDots aria-hidden="true" size={17} />
                  ) : resource.kind === "public_url" ? (
                    <LinkSimple aria-hidden="true" size={17} />
                  ) : (
                    <UploadSimple aria-hidden="true" size={17} />
                  )}
                </span>
                <p>
                  <strong>{resource.display_name}</strong>
                  <small>
                    {resource.kind.replaceAll("_", " ")} ·{" "}
                    {resource.source_authorization_state === "revoked"
                      ? "Access revoked · evidence excluded from memory"
                      : resource.source_authorization_state === "expired"
                        ? "Authorization expired · evidence excluded from memory"
                      : resource.proposed_fragment_count > 0
                      ? `${resource.proposed_fragment_count} excerpts need review`
                      : resource.pending_claim_count > 0
                        ? `${resource.pending_claim_count} facts need review${
                            resource.conflicted_claim_count > 0
                              ? ` · ${resource.conflicted_claim_count} conflicting`
                              : ""
                          }`
                      : "Evidence reviewed"}
                    {resource.duplicate_of_resource_id
                      ? " · duplicate retained"
                      : ""}
                    {resource.source_authorization_state ===
                      "authorized" &&
                    resource.source_authorization_expires_at
                      ? ` · authorized until ${formatDate(
                          resource.source_authorization_expires_at,
                        )}`
                      : ""}
                  </small>
                </p>
                <i>
                  {resource.source_authorization_state !== "authorized"
                    ? resource.source_authorization_state
                    : resource.processing_state.replaceAll("_", " ")}
                </i>
              </button>
            ))}
          </div>
        ) : resourceLoading ? null : (
          <p className="context-resource-ledger__empty">
            No additional note, transcript, file, or link is attached yet.
          </p>
        )}
      </div>

      {selectedResource ? (
        <div className="context-resource-review">
          <header>
            <div>
              <p className="eyebrow">EVIDENCE REVIEW</p>
              <h3>{selectedResource.resource.display_name}</h3>
              <span>
                {selectedResource.resource.kind.replaceAll("_", " ")} ·{" "}
                {selectedResource.resource.source_authorization_state !==
                "authorized"
                  ? selectedResource.resource.source_authorization_state ===
                    "expired"
                    ? "authorization expired"
                    : "access revoked"
                  : `${selectedResource.fragments.length} addressable ${
                      selectedResource.fragments.length === 1
                        ? "fragment"
                        : "fragments"
                    }`}
              </span>
            </div>
            <div className="context-resource-review__actions">
              <button
                aria-expanded={identityCorrectionOpen}
                className="context-text-button"
                onClick={() => {
                  if (identityCorrectionOpen) {
                    setIdentityCorrectionOpen(false);
                  } else {
                    void beginIdentityCorrection();
                  }
                }}
                type="button"
              >
                <PencilSimple aria-hidden="true" size={15} />
                Wrong person?
              </button>
              <button
                aria-expanded={sourceAuthorizationOpen}
                className="context-text-button"
                onClick={() => {
                  setDeleteResourceConfirm(false);
                  setIdentityCorrectionOpen(false);
                  if (sourceAuthorizationOpen) {
                    setSourceAuthorizationOpen(false);
                    resetSourceAuthorizationDecision();
                  } else {
                    setSourceAuthorizationOpen(true);
                  }
                }}
                type="button"
              >
                {selectedResource.resource
                  .source_authorization_state === "authorized" ? (
                  <Prohibit aria-hidden="true" size={15} />
                ) : (
                  <ShieldCheck aria-hidden="true" size={15} />
                )}
                {selectedResource.resource
                  .source_authorization_state === "authorized"
                  ? "Revoke access"
                  : selectedResource.resource
                        .source_authorization_state === "expired"
                    ? "Renew access"
                    : "Restore access"}
              </button>
              <button
                className="context-text-button"
                onClick={() => {
                  setSourceAuthorizationOpen(false);
                  resetSourceAuthorizationDecision();
                  setDeleteResourceConfirm((current) => !current);
                }}
                type="button"
              >
                <Trash aria-hidden="true" size={15} />
                Delete source
              </button>
              <button
                aria-label="Close evidence review"
                className="context-icon-button"
                onClick={() => {
                  setSelectedResource(null);
                  setClaimEdits({});
                  setDeleteResourceConfirm(false);
                  setResearchApproval(false);
                  setResearchResult(null);
                  setIdentityCorrectionOpen(false);
                  setIdentityCorrectionReason("");
                  resetIdentityCorrectionRequest();
                  setSourceAuthorizationOpen(false);
                  resetSourceAuthorizationDecision();
                }}
                type="button"
              >
                <X aria-hidden="true" size={17} />
              </button>
            </div>
          </header>
          {sourceAuthorizationOpen ? (
            <section className="context-identity-correction">
              <header>
                <div>
                  <p className="eyebrow">SOURCE AUTHORIZATION</p>
                  <h4>
                    {selectedResource.resource
                      .source_authorization_state === "authorized"
                      ? "Remove this source from relationship memory."
                      : selectedResource.resource
                            .source_authorization_state === "expired"
                        ? "Renew this source as reviewable evidence."
                        : "Return this source as reviewable evidence."}
                  </h4>
                </div>
                {selectedResource.resource
                  .source_authorization_state === "authorized" ? (
                  <Prohibit aria-hidden="true" size={19} />
                ) : (
                  <ShieldCheck aria-hidden="true" size={19} />
                )}
              </header>
              <p>
                {selectedResource.resource
                  .source_authorization_state === "authorized"
                  ? "Revoking access hides the evidence, withdraws dependent facts and pending actions, and rebuilds the Wiki from authorized sources that remain. It does not delete the governed source, so access can be restored later."
                  : selectedResource.resource
                        .source_authorization_state === "expired"
                    ? "Renewing authorization reveals the governed evidence again, but every source-derived claim returns to recruiter review. Prior facts, approvals, and actions stay withdrawn."
                    : "Restoring access reveals the governed evidence again, but every source-derived claim returns to recruiter review. Prior facts, approvals, and actions stay withdrawn."}
              </p>
              <label className="context-identity-correction__reason">
                <span>Why is this authorization changing?</span>
                <textarea
                  maxLength={500}
                  onChange={(event) => {
                    setSourceAuthorizationReason(
                      event.currentTarget.value,
                    );
                    sourceAuthorizationRequestRef.current = null;
                  }}
                  placeholder={
                    selectedResource.resource
                      .source_authorization_state === "authorized"
                      ? "For example: the candidate withdrew permission to use this conversation."
                      : "For example: the recruiter confirmed renewed permission for this purpose."
                  }
                  rows={3}
                  value={sourceAuthorizationReason}
                />
              </label>
              {selectedResource.resource
                .source_authorization_state !== "authorized" ? (
                <label className="context-identity-correction__reason">
                  <span>
                    New authorization deadline
                    {selectedResource.resource
                      .source_authorization_state === "expired"
                      ? " (recommended)"
                      : " (optional)"}
                  </span>
                  <input
                    onChange={(event) => {
                      setSourceAuthorizationExpiresAt(
                        event.currentTarget.value,
                      );
                      sourceAuthorizationRequestRef.current = null;
                    }}
                    type="datetime-local"
                    value={sourceAuthorizationExpiresAt}
                  />
                  <small>
                    This governs use of the evidence, independently
                    from how long the original file is retained.
                  </small>
                </label>
              ) : null}
              <footer>
                <button
                  className="context-secondary-button"
                  onClick={() => {
                    setSourceAuthorizationOpen(false);
                    resetSourceAuthorizationDecision();
                  }}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className={
                    selectedResource.resource
                      .source_authorization_state === "authorized"
                      ? "context-danger-button"
                      : "context-primary-button context-primary-button--compact"
                  }
                  disabled={
                    busy || !sourceAuthorizationReason.trim()
                  }
                  onClick={() =>
                    void decideSelectedSourceAuthorization()
                  }
                  type="button"
                >
                  {busy ? (
                    <CircleNotch
                      aria-hidden="true"
                      className="spin"
                      size={16}
                    />
                  ) : null}
                  {selectedResource.resource
                    .source_authorization_state === "authorized"
                    ? "Revoke and rebuild Wiki"
                    : selectedResource.resource
                          .source_authorization_state === "expired"
                      ? "Renew for review"
                      : "Restore for review"}
                </button>
              </footer>
            </section>
          ) : null}
          {deleteResourceConfirm ? (
            <div className="context-resource-review__delete">
              <p>
                This retracts this source, sources discovered from it, and
                every dependent Wiki or Chat snapshot.
              </p>
              <button
                className="context-secondary-button"
                onClick={() => setDeleteResourceConfirm(false)}
                type="button"
              >
                Keep source
              </button>
              <button
                className="context-danger-button"
                disabled={busy}
                onClick={() => void deleteSelectedResource()}
                type="button"
              >
                Delete governed lineage
              </button>
            </div>
          ) : null}
          {identityCorrectionOpen ? (
            <section className="context-identity-correction">
              <header>
                <div>
                  <p className="eyebrow">IDENTITY CORRECTION</p>
                  <h4>Move this governed source to the right person.</h4>
                </div>
                <Warning aria-hidden="true" size={19} />
              </header>
              <p>
                This source and anything discovered from it move together.
                Facts confirmed under {scopeLabel} are withdrawn; the new
                relationship receives reviewable proposals, never automatic
                truth.
              </p>
              <div
                aria-label="Identity correction target type"
                className="context-identity-correction__mode"
                role="group"
              >
                <button
                  aria-pressed={identityTargetMode === "existing"}
                  disabled={identityPeople.length === 0}
                  onClick={() => {
                    setIdentityTargetMode("existing");
                    resetIdentityCorrectionRequest();
                  }}
                  type="button"
                >
                  Existing person
                </button>
                <button
                  aria-pressed={identityTargetMode === "new"}
                  onClick={() => {
                    setIdentityTargetMode("new");
                    resetIdentityCorrectionRequest();
                  }}
                  type="button"
                >
                  New person
                </button>
              </div>
              {identityPeopleLoading ? (
                <p className="context-identity-correction__loading">
                  <CircleNotch
                    aria-hidden="true"
                    className="spin"
                    size={16}
                  />
                  Loading governed people…
                </p>
              ) : identityTargetMode === "existing" ? (
                <div className="context-identity-correction__fields">
                  <label>
                    <span>Correct person</span>
                    <select
                      disabled={busy}
                      onChange={(event) => {
                        setIdentityTargetPersonId(event.target.value);
                        setIdentityTargetContextId("");
                        setIdentityNewContextLabel("");
                        resetIdentityCorrectionRequest();
                      }}
                      value={identityTargetPersonId}
                    >
                      <option disabled value="">
                        Choose the correct person…
                      </option>
                      {identityPeople.map((person) => (
                        <option key={person.id} value={person.id}>
                          {person.display_label} · {person.capture_count}{" "}
                          sources
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Relationship context</span>
                    <select
                      disabled={busy}
                      onChange={(event) => {
                        setIdentityTargetContextId(event.target.value);
                        resetIdentityCorrectionRequest();
                      }}
                      value={identityTargetContextId}
                    >
                      <option disabled value="">
                        Choose the relationship context…
                      </option>
                      {identityTargetPerson?.contexts.map((context) => (
                        <option key={context.id} value={context.id}>
                          {context.display_label}
                        </option>
                      ))}
                      <option value="__new__">
                        Create a separate context…
                      </option>
                    </select>
                  </label>
                  {identityTargetContextId === "__new__" ? (
                    <label>
                      <span>New context label</span>
                      <input
                        disabled={busy}
                        maxLength={200}
                        onChange={(event) => {
                          setIdentityNewContextLabel(event.target.value);
                          resetIdentityCorrectionRequest();
                        }}
                        placeholder="e.g. VP Product · Northstar search"
                        value={identityNewContextLabel}
                      />
                    </label>
                  ) : null}
                </div>
              ) : (
                <div className="context-identity-correction__fields">
                  <label>
                    <span>New person name</span>
                    <input
                      disabled={busy}
                      maxLength={200}
                      onChange={(event) => {
                        setIdentityNewPersonLabel(event.target.value);
                        resetIdentityCorrectionRequest();
                      }}
                      placeholder="e.g. Maya Chen"
                      value={identityNewPersonLabel}
                    />
                  </label>
                  <label>
                    <span>Relationship context</span>
                    <input
                      disabled={busy}
                      maxLength={200}
                      onChange={(event) => {
                        setIdentityNewContextLabel(event.target.value);
                        resetIdentityCorrectionRequest();
                      }}
                      placeholder="e.g. VP Product · Northstar search"
                      value={identityNewContextLabel}
                    />
                  </label>
                </div>
              )}
              <label className="context-identity-correction__reason">
                <span>Why is this the right identity?</span>
                <textarea
                  disabled={busy}
                  maxLength={500}
                  onChange={(event) => {
                    setIdentityCorrectionReason(event.target.value);
                    resetIdentityCorrectionRequest();
                  }}
                  placeholder="e.g. The email address and employment history match the existing contact."
                  rows={2}
                  value={identityCorrectionReason}
                />
              </label>
              <footer>
                <p>
                  Pending actions are revoked. In-flight effects must be
                  reconciled before the move can proceed.
                </p>
                <div>
                  <button
                    className="context-text-button"
                    disabled={busy}
                    onClick={() => setIdentityCorrectionOpen(false)}
                    type="button"
                  >
                    Keep current identity
                  </button>
                  <button
                    className="context-primary-button context-primary-button--compact"
                    disabled={
                      busy ||
                      !identityCorrectionReason.trim() ||
                      (identityTargetMode === "existing"
                        ? !identityTargetPerson ||
                          !identityTargetContextId ||
                          (identityTargetContextId === "__new__" &&
                            !identityNewContextLabel.trim())
                        : !identityNewPersonLabel.trim() ||
                          !identityNewContextLabel.trim())
                    }
                    onClick={() =>
                      void correctSelectedResourceIdentity()
                    }
                    type="button"
                  >
                    {busy ? (
                      <CircleNotch
                        aria-hidden="true"
                        className="spin"
                        size={16}
                      />
                    ) : (
                      <ArrowRight aria-hidden="true" size={16} />
                    )}
                    Move source lineage
                  </button>
                </div>
              </footer>
            </section>
          ) : null}
          {selectedResource.resource.kind === "public_url" &&
          selectedResource.resource.input_channel !== "api_connector" &&
          selectedResource.resource.source_locator ? (
            <section className="context-research-approval">
              <div>
                <p className="eyebrow">PUBLIC RESEARCH</p>
                <h4>Choose the boundary before AI reads beyond the seed.</h4>
                <p>
                  Approved domain:{" "}
                  <strong>
                    {
                      new URL(
                        selectedResource.resource.source_locator,
                      ).hostname
                    }
                  </strong>
                  . Every retrieved page returns as proposed evidence with
                  its URL, retrieval time, freshness, and deletion lineage.
                </p>
              </div>
              <div className="context-research-approval__scope">
                <label>
                  <span>Maximum pages</span>
                  <select
                    disabled={busy}
                    onChange={(event) =>
                      setResearchPageCount(Number(event.target.value))
                    }
                    value={researchPageCount}
                  >
                    <option value={1}>1 page</option>
                    <option value={3}>Up to 3 pages</option>
                    <option value={5}>Up to 5 pages</option>
                  </select>
                </label>
                <label>
                  <span>Follow links</span>
                  <select
                    disabled={busy}
                    onChange={(event) =>
                      setResearchLinkDepth(Number(event.target.value))
                    }
                    value={researchLinkDepth}
                  >
                    <option value={0}>Seed page only</option>
                    <option value={1}>One same-domain layer</option>
                  </select>
                </label>
              </div>
              <label className="context-resource-checkbox">
                <input
                  checked={researchApproval}
                  disabled={busy}
                  onChange={(event) =>
                    setResearchApproval(event.target.checked)
                  }
                  type="checkbox"
                />
                <span>
                  I approve this bounded public research
                  <small>
                    HTTPS only. Private networks and cross-domain redirects
                    are blocked.
                  </small>
                </span>
              </label>
              {researchResult ? (
                <div
                  className={`context-research-status context-research-status--${researchResult.status}`}
                  role="status"
                >
                  <div className="context-research-status__summary">
                    {researchResult.status === "running" ? (
                      <CircleNotch
                        aria-hidden="true"
                        className="spin"
                        size={17}
                      />
                    ) : researchResult.status === "completed" ? (
                      <CheckCircle
                        aria-hidden="true"
                        size={17}
                        weight="fill"
                      />
                    ) : (
                      <Warning
                        aria-hidden="true"
                        size={17}
                        weight="fill"
                      />
                    )}
                    <span>
                      {researchResult.status === "running"
                        ? "Research is still running. Its durable task can be checked after a refresh or interruption."
                        : `${researchResult.pages.length} public ${
                            researchResult.pages.length === 1
                              ? "page"
                              : "pages"
                          } returned as proposed evidence · ${
                            researchResult.status
                          }`}
                    </span>
                  </div>
                  {researchResult.warnings.length > 0 ? (
                    <div className="context-research-status__warnings">
                      <strong>
                        {researchResult.warnings.length} page-level{" "}
                        {researchResult.warnings.length === 1
                          ? "warning"
                          : "warnings"}
                      </strong>
                      <ul>
                        {researchResult.warnings
                          .slice(0, 5)
                          .map((warning, index) => (
                            <li key={`${researchResult.task_id}:${index}`}>
                              {warning}
                            </li>
                          ))}
                      </ul>
                      <small>
                        Retrieval warnings are operational evidence, not
                        claims about this person.
                      </small>
                    </div>
                  ) : null}
                </div>
              ) : null}
              <footer>
                <p>
                  Research never confirms a person fact and never contacts
                  anyone.
                </p>
                <button
                  className="context-primary-button context-primary-button--compact"
                  disabled={
                    researchResult?.status === "running"
                      ? busy
                      : !researchApproval || busy
                  }
                  onClick={() =>
                    void (researchResult?.status === "running"
                      ? refreshResearchStatus()
                      : researchSelectedResource())
                  }
                  type="button"
                >
                  {busy ? (
                    <CircleNotch
                      aria-hidden="true"
                      className="spin"
                      size={17}
                    />
                  ) : (
                    <Sparkle aria-hidden="true" size={17} />
                  )}
                  {busy
                    ? researchResult?.status === "running"
                      ? "Checking durable task"
                      : "Researching public pages"
                    : researchResult?.status === "running"
                      ? "Check research status"
                      : "Run public research"}
                </button>
              </footer>
            </section>
          ) : null}
          {selectedResource.resource.kind === "conversation_screenshot" &&
          selectedResource.resource.processing_state ===
            "needs_fact_review" ? (
            <section className="context-capture-review-bridge">
              <div>
                <span>
                  <FileImage aria-hidden="true" size={18} weight="duotone" />
                </span>
                <p>
                  <strong>Screenshot facts still need your judgment</strong>
                  <small>
                    Transcription review and fact decisions remain separate.
                    Open the original capture review to confirm, dismiss, or
                    leave each proposal unresolved.
                  </small>
                </p>
              </div>
              <button
                className="context-secondary-button"
                onClick={() =>
                  void onReviewCapture(
                    selectedResource.resource.capture_id,
                  )
                }
                type="button"
              >
                Continue fact review
                <ArrowRight aria-hidden="true" size={15} />
              </button>
            </section>
          ) : null}
          {selectedResource.claim_proposals.length > 0 ? (
            <section className="context-claim-review">
              <header>
                <div>
                  <p className="eyebrow">PROPOSED PERSON UPDATES</p>
                  <h4>Decide what becomes part of this relationship.</h4>
                </div>
                <span>
                  {
                    selectedResource.claim_proposals.filter((claim) =>
                      ["pending", "unresolved"].includes(
                        claim.review_status,
                      ),
                    ).length
                  }{" "}
                  open
                </span>
              </header>
              <p>
                Each update keeps the exact source fragment. Conflicting
                claims stay separate until you choose the current value.
              </p>
              <div className="context-claim-review__list">
                {selectedResource.claim_proposals.map((claim) => {
                  const open = ["pending", "unresolved"].includes(
                    claim.review_status,
                  );
                  const conflicting =
                    claim.proposal_status === "ambiguous" ||
                    claim.temporal_relation === "supersedes";
                  return (
                    <article
                      data-conflict={conflicting}
                      data-state={claim.review_status}
                      key={claim.id}
                    >
                      <header>
                        <div>
                          <strong>{fieldLabel(claim.field)}</strong>
                          <span>
                            {claim.review_status === "confirmed"
                              ? "Confirmed for this relationship"
                              : claim.review_status === "dismissed"
                                ? "Dismissed by recruiter"
                                : claim.temporal_relation === "supersedes"
                                  ? "Review before replacing current value"
                                  : claim.temporal_relation === "reinforces"
                                    ? "Reinforces current value"
                                    : "New proposed fact"}
                          </span>
                        </div>
                        <i>{reviewLabel(claim.review_status)}</i>
                      </header>
                      {claim.prior_confirmed_value ? (
                        <div
                          aria-label="Proposed fact change"
                          className="context-claim-review__diff"
                        >
                          <span>
                            <small>Before</small>
                            <del>{claim.prior_confirmed_value}</del>
                          </span>
                          <ArrowRight aria-hidden="true" size={15} />
                          <span>
                            <small>Proposed</small>
                            <ins>{claimEdits[claim.id] ?? ""}</ins>
                          </span>
                        </div>
                      ) : null}
                      <label>
                        <span>Value to confirm</span>
                        <input
                          disabled={!open || busy}
                          maxLength={2_000}
                          onChange={(event) =>
                            setClaimEdits((current) => ({
                              ...current,
                              [claim.id]: event.target.value,
                            }))
                          }
                          value={claimEdits[claim.id] ?? ""}
                        />
                      </label>
                      <blockquote>
                        <Quotes aria-hidden="true" size={15} />
                        <span>
                          {claim.evidence_quote ??
                            "No exact source quote is available."}
                        </span>
                      </blockquote>
                      <p>
                        {claim.producer.name} {claim.producer.version} ·
                        source fragment {claim.evidence_fragment_id.slice(0, 8)}
                      </p>
                      {open ? (
                        <footer>
                          <button
                            className="context-text-button"
                            disabled={busy}
                            onClick={() =>
                              void decideClaim(claim, "dismiss")
                            }
                            type="button"
                          >
                            Dismiss
                          </button>
                          <button
                            className="context-secondary-button"
                            disabled={busy}
                            onClick={() =>
                              void decideClaim(
                                claim,
                                "leave_unresolved",
                              )
                            }
                            type="button"
                          >
                            Leave unresolved
                          </button>
                          <button
                            className="context-primary-button"
                            disabled={
                              busy ||
                              !(claimEdits[claim.id] ?? "").trim()
                            }
                            onClick={() =>
                              void decideClaim(claim, "confirm")
                            }
                            type="button"
                          >
                            <Check aria-hidden="true" size={16} />
                            Confirm for this relationship
                          </button>
                        </footer>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            </section>
          ) : null}
          <div>
            {selectedResource.fragments.map((fragment) => (
              <article
                data-state={fragment.review_status}
                key={fragment.id}
              >
                <header>
                  <span>
                    {fragment.locator.kind.replaceAll("_", " ")} ·{" "}
                    {fragment.sequence + 1}
                  </span>
                  <i>{fragment.review_status}</i>
                </header>
                <pre>{fragment.text}</pre>
                <p>
                  {fragment.attribution.actor_kind.replaceAll("_", " ")} ·{" "}
                  attribution {fragment.attribution.status} ·{" "}
                  {fragment.parser.name} {fragment.parser.version}
                </p>
                {fragment.review_status === "proposed" ? (
                  <footer>
                    <button
                      className="context-secondary-button"
                      disabled={busy}
                      onClick={() =>
                        void decideFragment(
                          fragment.id,
                          fragment.review_status,
                          "rejected",
                        )
                      }
                      type="button"
                    >
                      Reject extraction
                    </button>
                    <button
                      className="context-primary-button"
                      disabled={busy}
                      onClick={() =>
                        void decideFragment(
                          fragment.id,
                          fragment.review_status,
                          "reviewed",
                        )
                      }
                      type="button"
                    >
                      <Check aria-hidden="true" size={16} />
                      Extraction matches source
                    </button>
                  </footer>
                ) : null}
              </article>
            ))}
          </div>
          <p>
            Reviewing confirms transcription accuracy only. It does not make
            the document&apos;s claims current facts about the person.
          </p>
        </div>
      ) : null}
    </section>
  );
}
