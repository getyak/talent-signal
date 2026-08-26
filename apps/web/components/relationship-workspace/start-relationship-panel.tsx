"use client";

import {
  parseIdentityHandleQuery,
  type PersonDirectoryItem,
  type RelationshipScope,
  type ResourceCaptureResponse,
} from "@talent-signal/contracts";
import {
  ArrowRight,
  ChatCircleDots,
  CircleNotch,
  FileImage,
  LinkSimple,
  PencilSimple,
  Plus,
  UploadSimple,
  Warning,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";

import type { ConversationTranscriptMessage } from "@/lib/conversation-transcript";
import { ConversationTranscriptComposer } from "./conversation-transcript-composer";
import { relationshipIntegrationFetch } from "@/components/workspace-session-request";
import { initials, personContextSummary } from "./relationship-display";

type ResourceMode = "conversation" | "note" | "document" | "url";

export function StartRelationshipPanel({
  onCommitted,
  onScreenshot,
}: {
  onCommitted: (
    scope: RelationshipScope,
    receipts: ResourceCaptureResponse[],
    outcome:
      | "created_person"
      | "created_relationship_context"
      | "reused_relationship",
  ) => void;
  onScreenshot: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const requestIdRef = useRef<string | null>(null);
  const requestCapturedAtRef = useRef<string | null>(null);
  const peopleRequestIdRef = useRef(0);
  const [people, setPeople] = useState<PersonDirectoryItem[]>([]);
  const [peopleLoading, setPeopleLoading] = useState(true);
  const [peopleLookupFailed, setPeopleLookupFailed] = useState(false);
  const [mode, setMode] = useState<ResourceMode>("note");
  const [contactName, setContactName] = useState("");
  const [contextLabel, setContextLabel] = useState("");
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(
    null,
  );
  const [selectedContextId, setSelectedContextId] = useState<string | null>(
    null,
  );
  const [createNewPerson, setCreateNewPerson] = useState(false);
  const [createNewContext, setCreateNewContext] = useState(false);
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

  useEffect(() => {
    const query = contactName.normalize("NFKC").trim();
    const requestId = ++peopleRequestIdRef.current;
    const controller = new AbortController();
    const timer = window.setTimeout(
      () => {
        setPeopleLoading(true);
        setPeopleLookupFailed(false);
        void relationshipIntegrationFetch(
          query
            ? "/api/local-integration/people/search"
            : "/api/local-integration/people",
          query
            ? {
                method: "POST",
                cache: "no-store",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ query }),
                signal: controller.signal,
              }
            : { cache: "no-store", signal: controller.signal },
        )
          .then(async (response) => {
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
            if (requestId !== peopleRequestIdRef.current) {
              return;
            }
            setPeople(payload.people);
            setPeopleLookupFailed(false);
          })
          .catch((caught: unknown) => {
            if (
              requestId !== peopleRequestIdRef.current ||
              caught instanceof DOMException &&
              caught.name === "AbortError"
            ) {
              return;
            }
            setPeople([]);
            setPeopleLookupFailed(true);
            setError(
              caught instanceof Error
                ? caught.message
                : "Existing people could not be loaded.",
            );
          })
          .finally(() => {
            if (requestId === peopleRequestIdRef.current) {
              setPeopleLoading(false);
            }
          });
      },
      query ? 250 : 0,
    );
    return () => {
      window.clearTimeout(timer);
      if (requestId === peopleRequestIdRef.current) {
        peopleRequestIdRef.current += 1;
      }
      controller.abort();
    };
  }, [contactName]);

  const selectedPerson =
    people.find((person) => person.id === selectedPersonId) ?? null;
  const selectedContext =
    selectedPerson?.contexts.find(
      (context) => context.id === selectedContextId,
    ) ?? null;
  const matchingPeople = people.slice(0, 4);
  const contactQueryIsHandle = parseIdentityHandleQuery(contactName) !== null;
  const identityReady =
    (createNewPerson &&
      !peopleLoading &&
      !peopleLookupFailed &&
      !contactQueryIsHandle &&
      contactName.trim() &&
      contextLabel.trim()) ||
    (selectedPerson &&
      (selectedContext || (createNewContext && contextLabel.trim())));
  const sourceReady =
    mode === "document"
      ? file !== null
      : mode === "conversation"
        ? transcriptMessages.length > 0 && transcriptAttributionReviewed
        : value.trim().length > 0;

  function resetRequest() {
    requestIdRef.current = null;
    requestCapturedAtRef.current = null;
    setError("");
  }

  async function submit() {
    if (!identityReady || !sourceReady) {
      setError(
        "Choose an existing person and context, or explicitly create a new person, then add one source.",
      );
      return;
    }
    if (!requestIdRef.current) {
      requestIdRef.current = crypto.randomUUID();
      requestCapturedAtRef.current = new Date().toISOString();
    }
    const requestId = requestIdRef.current;
    const capturedAt = requestCapturedAtRef.current;
    if (!capturedAt) {
      setError("The source observation time could not be preserved.");
      return;
    }
    const scopeMode = createNewPerson
      ? "new_person"
      : createNewContext
        ? "existing_person_new_context"
        : "existing";
    setBusy(true);
    setError("");
    try {
      let response: Response;
      if (mode === "document" && file) {
        const form = new FormData();
        form.set("request_id", requestId);
        form.set("captured_at", capturedAt);
        form.set("scope_mode", scopeMode);
        form.set("contact_name", contactName.trim());
        form.set("relationship_context_label", contextLabel.trim());
        if (selectedPersonId) {
          form.set("person_id", selectedPersonId);
        }
        if (selectedContextId) {
          form.set("relationship_context_id", selectedContextId);
        }
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
            request_id: requestId,
            captured_at: capturedAt,
            scope_mode: scopeMode,
            contact_name: contactName.trim(),
            relationship_context_label: contextLabel.trim(),
            person_id: selectedPersonId ?? undefined,
            relationship_context_id: selectedContextId ?? undefined,
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
        | { receipts: ResourceCaptureResponse[] }
        | { message?: string };
      if (!response.ok || !("receipts" in payload)) {
        throw new Error(
          "message" in payload && payload.message
            ? payload.message
            : "The first source could not be committed.",
        );
      }
      const first = payload.receipts[0];
      const personId = first?.identity.person_id;
      const relationshipContextId =
        first?.identity.relationship_context_id;
      if (!first || !personId || !relationshipContextId) {
        throw new Error(
          "The first source is waiting for identity review and cannot open a person page yet.",
        );
      }
      onCommitted(
        {
          contract_version: first.contract_version,
          person: {
            id: personId,
            display_label:
              selectedPerson?.display_label ?? contactName.trim(),
          },
          relationship_context: {
            id: relationshipContextId,
            display_label:
              selectedContext?.display_label ?? contextLabel.trim(),
          },
        },
        payload.receipts,
        !selectedPerson
          ? "created_person"
          : selectedContext
            ? "reused_relationship"
            : "created_relationship_context",
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The first source could not be committed.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="context-start">
      <div className="context-start__intro">
        <p className="eyebrow">FIRST GOVERNED SOURCE</p>
        <h2>Choose the person, relationship, and source.</h2>
        <p>
          Identity is your decision. Extraction and source claims remain
          separate review states.
        </p>
      </div>

      <div className="context-start__identity">
        <label>
          <span>Person</span>
          <input
            autoComplete="off"
            maxLength={200}
            onChange={(event) => {
              setPeopleLoading(true);
              setPeopleLookupFailed(false);
              setContactName(event.target.value);
              setSelectedPersonId(null);
              setSelectedContextId(null);
              setCreateNewPerson(false);
              setCreateNewContext(false);
              resetRequest();
            }}
            placeholder="Search or name a person"
            value={contactName}
          />
        </label>
        <div className="context-start__choices">
          {peopleLoading ? (
            <span>Loading people…</span>
          ) : (
            matchingPeople.map((person) => (
              <button
                data-selected={selectedPersonId === person.id}
                key={person.id}
                onClick={() => {
                  setSelectedPersonId(person.id);
                  setContactName(person.display_label);
                  setCreateNewPerson(false);
                  setCreateNewContext(false);
                  setSelectedContextId(null);
                  setContextLabel("");
                  resetRequest();
                }}
                type="button"
              >
                <span>{initials(person.display_label)}</span>
                <p>
                  <strong>{person.display_label}</strong>
                  <small>
                    {personContextSummary(person)} · {person.capture_count}{" "}
                    {person.capture_count === 1 ? "source" : "sources"}
                  </small>
                </p>
              </button>
            ))
          )}
          {!peopleLoading &&
          !peopleLookupFailed &&
          contactName.trim() &&
          !contactQueryIsHandle ? (
            <button
              data-selected={createNewPerson}
              onClick={() => {
                setCreateNewPerson(true);
                setSelectedPersonId(null);
                setSelectedContextId(null);
                setCreateNewContext(false);
                resetRequest();
              }}
              type="button"
            >
              <Plus aria-hidden="true" size={17} />
              <p>
                <strong>Create “{contactName.trim()}”</strong>
                <small>This is an explicit new-person decision.</small>
              </p>
            </button>
          ) : null}
        </div>
        {contactQueryIsHandle &&
        matchingPeople.length === 0 &&
        !peopleLoading &&
        !peopleLookupFailed ? (
          <p className="context-start__lookup-note">
            No current or historical owner matched this masked identity clue.
            Enter the person&apos;s name before creating a new identity.
          </p>
        ) : null}

        {selectedPerson ? (
          <div className="context-start__contexts">
            <span>Choose the relationship context</span>
            {selectedPerson.contexts.map((context) => (
              <button
                data-selected={selectedContextId === context.id}
                key={context.id}
                onClick={() => {
                  setSelectedContextId(context.id);
                  setContextLabel(context.display_label);
                  setCreateNewContext(false);
                  resetRequest();
                }}
                type="button"
              >
                {context.display_label}
              </button>
            ))}
            <button
              data-selected={createNewContext}
              onClick={() => {
                setSelectedContextId(null);
                setCreateNewContext(true);
                setContextLabel("");
                resetRequest();
              }}
              type="button"
            >
              <Plus aria-hidden="true" size={15} />
              New relationship context
            </button>
          </div>
        ) : null}
        {createNewPerson || createNewContext ? (
          <label>
            <span>Relationship context</span>
            <input
              maxLength={200}
              onChange={(event) => {
                setContextLabel(event.target.value);
                resetRequest();
              }}
              placeholder="e.g. VP Product · Northstar search"
              value={contextLabel}
            />
          </label>
        ) : null}
      </div>

      <div className="context-start__source">
        <div aria-label="First source type" role="tablist">
          {(["note", "conversation", "document", "url"] as const).map((sourceMode) => (
            <button
              aria-selected={mode === sourceMode}
              key={sourceMode}
              onClick={() => {
                setMode(sourceMode);
                resetRequest();
              }}
              role="tab"
              type="button"
            >
              {sourceMode === "note" ? (
                <PencilSimple aria-hidden="true" size={16} />
              ) : sourceMode === "conversation" ? (
                <ChatCircleDots aria-hidden="true" size={16} />
              ) : sourceMode === "document" ? (
                <UploadSimple aria-hidden="true" size={16} />
              ) : (
                <LinkSimple aria-hidden="true" size={16} />
              )}
              {sourceMode === "document"
                ? "File"
                : sourceMode === "conversation"
                  ? "Transcript"
                  : sourceMode}
            </button>
          ))}
          <button onClick={onScreenshot} type="button">
            <FileImage aria-hidden="true" size={16} />
            Screenshot
          </button>
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
                <strong>{file?.name ?? "Choose resume or document"}</strong>
                <small>Raw file is parsed transiently and not retained.</small>
              </span>
            </button>
            <label>
              <span>Document meaning</span>
              <select
                onChange={(event) =>
                  setDocumentKind(
                    event.target.value as "resume" | "document",
                  )
                }
                value={documentKind}
              >
                <option value="resume">Resume</option>
                <option value="document">Supporting document</option>
              </select>
            </label>
            <label className="context-resource-checkbox">
              <input
                checked={saveDiscoveredLinks}
                onChange={(event) =>
                  setSaveDiscoveredLinks(event.target.checked)
                }
                type="checkbox"
              />
              <span>
                Save visible URLs as research seeds
                <small>No page is fetched and no research is authorized.</small>
              </span>
            </label>
          </div>
        ) : (
          <div className="context-resource-composer__text">
            <label>
              <span>{mode === "note" ? "Note title" : "Link label"}</span>
              <input
                maxLength={240}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={
                  mode === "note"
                    ? "e.g. First-call context"
                    : "e.g. Public profile"
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
                  rows={4}
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
      </div>

      {error ? (
        <p className="context-resource-composer__error" role="alert">
          <Warning aria-hidden="true" size={16} />
          {error}
        </p>
      ) : null}
      <footer>
        <p>
          The source stays separate from confirmed facts. Files remain
          proposed until you review the extraction.
        </p>
        <button
          className="context-primary-button"
          disabled={busy || !identityReady || !sourceReady}
          onClick={() => void submit()}
          type="button"
        >
          {busy ? (
            <CircleNotch aria-hidden="true" className="spin" size={17} />
          ) : (
            <ArrowRight aria-hidden="true" size={17} />
          )}
          {busy ? "Creating person page" : "Open living person page"}
        </button>
      </footer>
    </section>
  );
}
