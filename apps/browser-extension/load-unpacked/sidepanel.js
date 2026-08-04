import {
  makeCaptureDraft,
} from "./lib/capture-contract.js";
import {
  cropPixels,
  estimateDataUrlBytes,
  isRedactionVisible,
  normalizeCrop,
  normalizeRedaction,
  redactionPixels,
} from "./lib/image-review.js";
import {
  buildHandoffEnvelope,
  classifyReceiptResponse,
  classifyTransportError,
  createRequestIdentity,
  DEFAULT_LOCAL_ORIGIN,
  MAX_HANDOFF_BYTES,
  normalizeLocalOrigin,
  sessionCopy,
} from "./lib/handoff-contract.js";
import {
  fixtureCheck,
  fixtureSubmit,
} from "./lib/fixture-transport.js";

const byId = (id) => document.getElementById(id);

const elements = {
  modeSelect: byId("mode-select"),
  captureView: byId("capture-view"),
  reviewView: byId("review-view"),
  captureEyebrow: byId("capture-eyebrow"),
  captureTitle: byId("capture-title"),
  captureLede: byId("capture-lede"),
  liveControls: byId("live-capture-controls"),
  fixtureControls: byId("fixture-controls"),
  fixtureCase: byId("fixture-case"),
  fixtureScenario: byId("fixture-scenario"),
  captureVisible: byId("capture-visible"),
  captureSelection: byId("capture-selection"),
  loadFixture: byId("load-fixture"),
  captureAlert: byId("capture-alert"),
  captureAlertTitle: byId("capture-alert-title"),
  captureAlertCopy: byId("capture-alert-copy"),
  backButton: byId("back-button"),
  removeButton: byId("remove-button"),
  captureKindChip: byId("capture-kind-chip"),
  sourceTitle: byId("source-page-title"),
  sourceUrl: byId("source-url"),
  sourceTime: byId("source-time"),
  screenshotReview: byId("screenshot-review"),
  textReview: byId("text-review"),
  fixtureReview: byId("fixture-review"),
  localCleared: byId("local-cleared"),
  canvas: byId("review-canvas"),
  imageSummary: byId("image-summary"),
  cropLeft: byId("crop-left"),
  cropTop: byId("crop-top"),
  cropRight: byId("crop-right"),
  cropBottom: byId("crop-bottom"),
  addRedaction: byId("add-redaction"),
  undoRedaction: byId("undo-redaction"),
  resetImageEdits: byId("reset-image-edits"),
  redactionList: byId("redaction-list"),
  reviewedText: byId("reviewed-text"),
  textSummary: byId("text-summary"),
  fixtureTitle: byId("fixture-title"),
  fixtureId: byId("fixture-id"),
  fixtureContext: byId("fixture-context"),
  fixtureMessages: byId("fixture-messages"),
  fixtureDisposition: byId("fixture-disposition"),
  fixtureAssertions: byId("fixture-assertions"),
  fixtureActionBlock: byId("fixture-action-block"),
  fixtureAction: byId("fixture-action"),
  fixtureBoundaries: byId("fixture-boundaries"),
  originField: byId("origin-field"),
  localOrigin: byId("local-origin"),
  openSignIn: byId("open-sign-in"),
  checkSession: byId("check-session"),
  sessionState: byId("session-state"),
  sessionCopy: byId("session-copy"),
  retentionMode: byId("retention-mode"),
  retentionCopy: byId("retention-copy"),
  handoffTarget: byId("handoff-target"),
  approvalCheck: byId("approval-check"),
  submissionStatus: byId("submission-status"),
  submissionStateLabel: byId("submission-state-label"),
  submissionTitle: byId("submission-title"),
  submissionCopy: byId("submission-copy"),
  receiptId: byId("receipt-id"),
  submitButton: byId("submit-button"),
  checkReceipt: byId("check-receipt"),
};

const query = new URLSearchParams(location.search);

const state = {
  mode: query.get("mode") === "fixture" ? "fixture" : "live",
  fixtureSuite: null,
  draft: null,
  image: null,
  drawRedaction: null,
  requestIdentity: null,
  submitAttempt: 0,
  fixtureRecovered: false,
  session: {
    state: "not_checked",
    message:
      "The extension never reads or shows a password, cookie, or bearer token.",
  },
  submission: {
    state: "idle",
    code: null,
    message: null,
    receipt_id: null,
    duplicate: false,
  },
};

function node(tag, text, className) {
  const element = document.createElement(tag);
  if (typeof text === "string") {
    element.textContent = text;
  }
  if (className) {
    element.className = className;
  }
  return element;
}

function humanTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return value || "Unavailable";
  }

  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

function bytesLabel(bytes) {
  if (bytes < 1_000) {
    return `${bytes} B`;
  }
  if (bytes < 1_000_000) {
    return `${(bytes / 1_000).toFixed(1)} KB`;
  }
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

function showCaptureAlert(title, copy) {
  elements.captureAlertTitle.textContent = title;
  elements.captureAlertCopy.textContent = copy;
  elements.captureAlert.hidden = false;
}

function clearCaptureAlert() {
  elements.captureAlert.hidden = true;
  elements.captureAlertTitle.textContent = "";
  elements.captureAlertCopy.textContent = "";
}

function setCaptureBusy(busy, label = "Capturing…") {
  elements.captureVisible.disabled = busy;
  elements.captureSelection.disabled = busy;
  elements.loadFixture.disabled = busy;

  if (busy) {
    showCaptureAlert(label, "Nothing will be submitted during this step.");
  }
}

function resetDecision() {
  state.requestIdentity = null;
  state.submitAttempt = 0;
  state.submission = {
    state: "idle",
    code: null,
    message: null,
    receipt_id: null,
    duplicate: false,
  };
  elements.approvalCheck.checked = false;
  renderSubmission();
}

function draftChanged() {
  if (!state.draft) {
    return;
  }

  state.draft.revision += 1;
  resetDecision();
}

function renderMode() {
  const fixtureMode = state.mode === "fixture";
  elements.modeSelect.value = state.mode;
  elements.liveControls.hidden = fixtureMode;
  elements.fixtureControls.hidden = !fixtureMode;
  elements.captureEyebrow.textContent = fixtureMode
    ? "Deterministic evaluation"
    : "Intentional capture";
  elements.captureTitle.textContent = fixtureMode
    ? "Exercise the same eight safety cases."
    : "Bring only what matters into review.";
  elements.captureLede.textContent = fixtureMode
    ? "Open a bundled synthetic case and inspect its evidence, proposed meaning, action boundary, and truthful receipt state."
    : "Choose the visible page or text you selected. Talent Signal will show the exact payload before anything leaves this panel.";
}

async function loadFixtureSuite() {
  const response = await fetch("./fixtures/candidate-momentum-v1.json");
  if (!response.ok) {
    throw new Error("The bundled fixture suite could not be loaded.");
  }
  state.fixtureSuite = await response.json();
  elements.fixtureCase.replaceChildren();

  for (const fixtureCase of state.fixtureSuite.cases) {
    const option = document.createElement("option");
    option.value = fixtureCase.id;
    option.textContent = `${fixtureCase.id} · ${fixtureCase.title}`;
    elements.fixtureCase.append(option);
  }

  const requestedCase = query.get("case");
  if (
    requestedCase &&
    state.fixtureSuite.cases.some((item) => item.id === requestedCase)
  ) {
    elements.fixtureCase.value = requestedCase;
  }

  const requestedScenario = query.get("scenario");
  if (
    requestedScenario &&
    [...elements.fixtureScenario.options].some(
      (option) => option.value === requestedScenario,
    )
  ) {
    elements.fixtureScenario.value = requestedScenario;
  }
}

async function requestCapture(type) {
  clearCaptureAlert();
  setCaptureBusy(true);

  try {
    const response = await chrome.runtime.sendMessage({ type });
    if (!response?.ok) {
      showCaptureAlert(
        response?.code === "permission_denied"
          ? "Page access not granted"
          : "Capture not created",
        response?.message ??
          "Nothing was captured or submitted. Return to the source tab and try again.",
      );
      return;
    }

    const draft = makeCaptureDraft({
      kind: response.kind,
      source: response.source,
      dataUrl: response.data_url ?? null,
      text: response.text ?? null,
    });
    await openReview(draft);
  } catch (error) {
    showCaptureAlert(
      "Capture not created",
      error instanceof Error
        ? error.message
        : "Nothing was captured or submitted.",
    );
  } finally {
    setCaptureBusy(false);
  }
}

async function loadSelectedFixture() {
  if (!state.fixtureSuite) {
    return;
  }

  const fixtureCase = state.fixtureSuite.cases.find(
    (item) => item.id === elements.fixtureCase.value,
  );
  if (!fixtureCase) {
    showCaptureAlert("Fixture unavailable", "Choose another bundled case.");
    return;
  }

  const source = {
    title: fixtureCase.title,
    url: `fixture://${state.fixtureSuite.suite_id}/${fixtureCase.id}`,
    captured_at: fixtureCase.context.captured_at,
  };
  const draft = makeCaptureDraft({
    kind: "fixture",
    source,
    fixtureCase,
    createdAt: fixtureCase.context.captured_at,
  });
  await openReview(draft);
}

async function loadImage(dataUrl) {
  const image = new Image();
  const loaded = new Promise((resolve, reject) => {
    image.addEventListener("load", resolve, { once: true });
    image.addEventListener("error", reject, { once: true });
  });
  image.src = dataUrl;
  await loaded;
  return image;
}

async function openReview(draft) {
  clearCaptureAlert();
  state.draft = draft;
  state.image = null;
  state.fixtureRecovered = false;
  resetDecision();

  if (draft.kind === "visible_tab") {
    state.image = await loadImage(draft.original_data_url);
  }

  elements.captureView.hidden = true;
  elements.reviewView.hidden = false;
  elements.modeSelect.disabled = true;
  renderReview();
  await checkSession({ quiet: true });
}

function clearDraft() {
  if (state.draft) {
    state.draft.original_data_url = null;
    state.draft.original_text = null;
    state.draft.reviewed_text = null;
    state.draft.fixture_case = null;
  }
  state.draft = null;
  state.image = null;
  state.drawRedaction = null;
  state.requestIdentity = null;
  state.fixtureRecovered = false;
  state.session = {
    state: "not_checked",
    message:
      "The extension never reads or shows a password, cookie, or bearer token.",
  };
  resetDecision();
  elements.reviewView.hidden = true;
  elements.captureView.hidden = false;
  elements.modeSelect.disabled = false;
  clearCaptureAlert();
}

function renderReview() {
  const draft = state.draft;
  if (!draft) {
    return;
  }

  elements.sourceTitle.textContent = draft.source.title;
  elements.sourceUrl.textContent = draft.source.url;
  elements.sourceTime.textContent = humanTime(draft.source.captured_at);
  elements.captureKindChip.textContent = {
    visible_tab: "Visible pixels",
    selected_text: "Selected text",
    fixture: "Synthetic fixture",
  }[draft.kind];

  const cleared = Boolean(draft.local_cleared);
  elements.localCleared.hidden = !cleared;
  elements.screenshotReview.hidden = cleared || draft.kind !== "visible_tab";
  elements.textReview.hidden = cleared || draft.kind !== "selected_text";
  elements.fixtureReview.hidden = draft.kind !== "fixture";

  if (draft.kind === "visible_tab" && !cleared) {
    syncCropInputs();
    renderCanvas();
    renderRedactionList();
  } else if (draft.kind === "selected_text" && !cleared) {
    elements.reviewedText.value = draft.reviewed_text ?? "";
    renderTextSummary();
  } else if (draft.kind === "fixture") {
    renderFixture();
  }

  renderSession();
  renderRetention();
  renderSubmission();
}

function syncCropInputs() {
  const crop = state.draft?.crop ?? {};
  elements.cropLeft.value = String(crop.left ?? 0);
  elements.cropTop.value = String(crop.top ?? 0);
  elements.cropRight.value = String(crop.right ?? 0);
  elements.cropBottom.value = String(crop.bottom ?? 0);
}

function currentCropFromInputs() {
  return normalizeCrop({
    left: elements.cropLeft.value,
    top: elements.cropTop.value,
    right: elements.cropRight.value,
    bottom: elements.cropBottom.value,
  });
}

function renderCanvas() {
  if (!state.image || !state.draft) {
    return;
  }

  const canvas = elements.canvas;
  const context = canvas.getContext("2d", { alpha: false });
  const source = cropPixels(
    state.image.naturalWidth,
    state.image.naturalHeight,
    state.draft.crop,
  );
  const outputScale = Math.min(1, 1_600 / source.width);
  canvas.width = Math.max(1, Math.round(source.width * outputScale));
  canvas.height = Math.max(1, Math.round(source.height * outputScale));
  context.drawImage(
    state.image,
    source.sx,
    source.sy,
    source.width,
    source.height,
    0,
    0,
    canvas.width,
    canvas.height,
  );

  const redactions = [
    ...state.draft.redactions,
    ...(state.drawRedaction ? [state.drawRedaction] : []),
  ];

  for (const item of redactions) {
    if (!isRedactionVisible(item, state.draft.crop)) {
      continue;
    }
    const rectangle = redactionPixels(
      item,
      state.draft.crop,
      canvas.width,
      canvas.height,
    );
    const x = Math.max(0, rectangle.x);
    const y = Math.max(0, rectangle.y);
    const width = Math.min(canvas.width - x, rectangle.width);
    const height = Math.min(canvas.height - y, rectangle.height);
    context.fillStyle = "#181816";
    context.fillRect(x, y, width, height);

    if (width > 68 && height > 24) {
      context.fillStyle = "#fffaf5";
      context.font = `${Math.max(11, Math.round(canvas.width / 90))}px sans-serif`;
      context.textBaseline = "middle";
      context.fillText("Redacted", x + 8, y + height / 2);
    }
  }

  const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
  elements.imageSummary.textContent =
    `${canvas.width}×${canvas.height} · ${bytesLabel(estimateDataUrlBytes(dataUrl))} · ` +
    `${state.draft.redactions.length} redaction${state.draft.redactions.length === 1 ? "" : "s"}`;
}

function renderRedactionList() {
  elements.redactionList.replaceChildren();
  const redactions = state.draft?.redactions ?? [];
  elements.undoRedaction.disabled = redactions.length === 0;

  redactions.forEach((item, index) => {
    const listItem = document.createElement("li");
    const copy = node(
      "span",
      `Box ${index + 1} · ${Math.round(item.width)}×${Math.round(item.height)}%`,
    );
    const remove = node("button", "Remove");
    remove.type = "button";
    remove.setAttribute("aria-label", `Remove redaction ${index + 1}`);
    remove.addEventListener("click", () => {
      state.draft.redactions.splice(index, 1);
      draftChanged();
      renderCanvas();
      renderRedactionList();
    });
    listItem.append(copy, remove);
    elements.redactionList.append(listItem);
  });
}

function renderTextSummary() {
  const text = state.draft?.reviewed_text ?? "";
  const edited = text !== state.draft?.original_text;
  elements.textSummary.textContent =
    `${text.length.toLocaleString()} characters${edited ? " · edited" : ""}`;
}

function renderFixture() {
  const fixtureCase = state.draft?.fixture_case;
  if (!fixtureCase || !state.fixtureSuite) {
    return;
  }

  elements.fixtureTitle.textContent = fixtureCase.title;
  elements.fixtureId.textContent = fixtureCase.id;
  elements.fixtureContext.replaceChildren();

  const contextLines = [
    fixtureCase.context.candidate
      ? `Candidate: ${fixtureCase.context.candidate}`
      : "Candidate: unresolved",
    fixtureCase.context.assignment
      ? `Assignment: ${fixtureCase.context.assignment}`
      : "Assignment: unresolved",
    `Source timezone: ${fixtureCase.context.source_timezone ?? "ambiguous"}`,
  ];
  if (fixtureCase.context.candidate_options) {
    contextLines.push(
      `Possible matches: ${fixtureCase.context.candidate_options.join(" · ")}`,
    );
  }
  if (fixtureCase.context.prior_state) {
    contextLines.push(
      `Prior state: ${Object.values(fixtureCase.context.prior_state).join(", ")}`,
    );
  }
  if (fixtureCase.context.requested_output) {
    contextLines.push(`Requested output: ${fixtureCase.context.requested_output}`);
  }

  contextLines.forEach((line) => elements.fixtureContext.append(node("p", line)));

  elements.fixtureMessages.replaceChildren();
  for (const message of fixtureCase.messages) {
    const item = document.createElement("li");
    item.append(
      node("span", `${message.id} · ${message.speaker}`),
      node("p", message.text),
    );
    elements.fixtureMessages.append(item);
  }

  const dispositionCopy = {
    propose_action:
      "Propose one bounded action after review; no effect is authorized.",
    no_action: "No action is warranted. Preserve only the scoped evidence.",
    clarify:
      "Clarification is required. Do not bind identity, normalize time, persist a fact, or act.",
    block:
      "The requested inference is prohibited. Do not score or rank the candidate.",
  };
  elements.fixtureDisposition.textContent =
    dispositionCopy[fixtureCase.expected.disposition] ??
    fixtureCase.expected.disposition;

  elements.fixtureAssertions.replaceChildren();
  if (fixtureCase.expected.assertions.length === 0) {
    elements.fixtureAssertions.append(
      node("p", "No assertion is supported for persistence.", "edit-note"),
    );
  } else {
    for (const assertion of fixtureCase.expected.assertions) {
      const item = node("article", null, "assertion");
      item.append(
        node("strong", `${assertion.field} · ${assertion.status}`),
        node("p", assertion.value),
        node(
          "small",
          `Evidence ${assertion.evidence_message_id}: “${assertion.evidence_quote}”`,
        ),
      );
      elements.fixtureAssertions.append(item);
    }
  }

  const action = fixtureCase.expected.action;
  elements.fixtureActionBlock.hidden = !action;
  elements.fixtureAction.textContent = action
    ? `${action.type.replaceAll("_", " ")} · ${action.target}. ${action.reason} Due ${action.due}; owned by ${action.owner}.`
    : "";

  elements.fixtureBoundaries.replaceChildren();
  fixtureCase.expected.must_not.forEach((boundary) => {
    elements.fixtureBoundaries.append(node("li", `Must not ${boundary}.`));
  });
}

function renderSession() {
  const fixture = state.draft?.kind === "fixture";
  elements.originField.hidden = fixture;
  elements.openSignIn.hidden = fixture;
  elements.checkSession.hidden = false;
  elements.checkSession.textContent = fixture
    ? "Refresh synthetic session"
    : "Check session";
  elements.sessionState.className = "state-chip";
  elements.sessionState.classList.add(
    state.session.state === "ready"
      ? "state-chip--ready"
      : state.session.state === "checking"
        ? "state-chip--pending"
        : "state-chip--unknown",
  );
  elements.sessionState.textContent = {
    ready: fixture ? "Synthetic session" : "Session ready",
    checking: "Checking",
    not_ready: "Not connected",
    not_checked: "Not checked",
  }[state.session.state];
  elements.sessionCopy.textContent = state.session.message;
  updateSubmitAvailability();
}

function renderRetention() {
  const copy = {
    ephemeral:
      "Ask the local service to discard submitted pixels or text after review. Receipt does not prove deletion.",
    evidence_crop:
      "Ask the local service to keep only this reviewed payload as source evidence. Derived deletion remains a backend responsibility.",
    full_source:
      "Ask the local service to keep the full reviewed payload. Use only when audit need justifies longer source retention.",
  };
  elements.retentionCopy.textContent = copy[elements.retentionMode.value];
  elements.handoffTarget.textContent =
    state.draft?.kind === "fixture"
      ? "Synthetic fixture transport · no network"
      : elements.localOrigin.value;
}

function renderSubmission() {
  const submission = state.submission;
  const visible = submission.state !== "idle";
  elements.submissionStatus.hidden = !visible;
  elements.checkReceipt.hidden = !["pending", "unknown"].includes(
    submission.state,
  );

  if (visible) {
    elements.submissionStatus.dataset.state = submission.state;
    elements.submissionStateLabel.textContent = submission.state;
    elements.submissionTitle.textContent = {
      pending: "Waiting for receipt evidence",
      received: submission.duplicate
        ? "Already received — duplicate avoided"
        : "Receipt confirmed",
      failed:
        submission.code === "session_stale"
          ? "Local session changed"
          : "Upload failed",
      unknown: "Receipt is unknown",
    }[submission.state];
    elements.submissionCopy.textContent = submission.message ?? "";
    elements.receiptId.hidden = !submission.receipt_id;
    elements.receiptId.textContent = submission.receipt_id
      ? `Receipt ${submission.receipt_id}`
      : "";
  }

  elements.submitButton.textContent =
    submission.state === "failed"
      ? "Retry same reviewed packet"
      : submission.state === "pending"
        ? "Upload pending"
        : submission.state === "received"
          ? "Received"
          : submission.state === "unknown"
            ? "Check receipt first"
            : "Submit reviewed capture";
  updateSubmitAvailability();
}

function assetIsReady() {
  if (!state.draft || state.draft.local_cleared) {
    return false;
  }
  if (state.draft.kind === "visible_tab") {
    return Boolean(state.image && elements.canvas.width && elements.canvas.height);
  }
  if (state.draft.kind === "selected_text") {
    return Boolean(state.draft.reviewed_text?.trim());
  }
  return state.draft.kind === "fixture";
}

function updateSubmitAvailability() {
  const blockedState = ["pending", "received", "unknown"].includes(
    state.submission.state,
  );
  elements.submitButton.disabled =
    !assetIsReady() ||
    !elements.approvalCheck.checked ||
    state.session.state !== "ready" ||
    blockedState;
}

function reviewAsset() {
  if (state.draft.kind === "visible_tab") {
    const dataUrl = elements.canvas.toDataURL("image/jpeg", 0.92);
    return {
      type: "reviewed_image",
      mime_type: "image/jpeg",
      width: elements.canvas.width,
      height: elements.canvas.height,
      data_url: dataUrl,
      edits: {
        crop_percent: state.draft.crop,
        redactions_percent: state.draft.redactions,
      },
    };
  }

  if (state.draft.kind === "selected_text") {
    return {
      type: "reviewed_text",
      text: state.draft.reviewed_text.trim(),
      edited_from_selection:
        state.draft.reviewed_text !== state.draft.original_text,
    };
  }

  return {
    type: "synthetic_fixture",
    suite_id: state.fixtureSuite.suite_id,
    suite_version: state.fixtureSuite.version,
    case_id: state.draft.fixture_case.id,
    input: {
      context: state.draft.fixture_case.context,
      messages: state.draft.fixture_case.messages,
    },
    expected_contract: state.draft.fixture_case.expected,
  };
}

async function responseBody(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

async function postRealHandoff(origin, envelope) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const headers = {
      "Content-Type": "application/json",
      "Idempotency-Key": envelope.idempotency_key,
    };
    if (envelope.session.version) {
      headers["X-Talent-Signal-Session-Version"] = envelope.session.version;
    }
    const response = await fetch(`${origin}/api/browser-extension/captures`, {
      method: "POST",
      credentials: "include",
      headers,
      body: JSON.stringify(envelope),
      signal: controller.signal,
    });
    return classifyReceiptResponse(response.status, await responseBody(response));
  } finally {
    clearTimeout(timeout);
  }
}

async function getRealReceipt(origin, requestId) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(
      `${origin}/api/browser-extension/captures/${encodeURIComponent(requestId)}`,
      {
        credentials: "include",
        signal: controller.signal,
      },
    );
    return classifyReceiptResponse(response.status, await responseBody(response));
  } finally {
    clearTimeout(timeout);
  }
}

function clearPrivatePayloadAfterReceipt() {
  if (!state.draft || state.draft.kind === "fixture") {
    return;
  }

  state.draft.original_data_url = null;
  state.draft.original_text = null;
  state.draft.reviewed_text = null;
  state.draft.local_cleared = true;
  state.image = null;
  elements.canvas.width = 1;
  elements.canvas.height = 1;
  renderReview();
}

async function submitHandoff() {
  if (elements.submitButton.disabled || !state.draft) {
    return;
  }

  let origin = DEFAULT_LOCAL_ORIGIN;
  try {
    if (state.draft.kind !== "fixture") {
      origin = normalizeLocalOrigin(elements.localOrigin.value);
    }
  } catch (error) {
    state.submission = {
      state: "failed",
      code: "invalid_origin",
      message: error.message,
      receipt_id: null,
      duplicate: false,
    };
    renderSubmission();
    return;
  }

  state.requestIdentity ??= createRequestIdentity(state.draft.id);
  const envelope = buildHandoffEnvelope({
    draft: state.draft,
    reviewedAsset: reviewAsset(),
    retentionMode: elements.retentionMode.value,
    requestIdentity: state.requestIdentity,
    handoffTarget:
      state.draft.kind === "fixture"
        ? "fixture://local-transport"
        : origin,
    sessionVersion: state.session.session_version ?? null,
  });
  const encodedBytes = new TextEncoder().encode(JSON.stringify(envelope)).byteLength;

  if (encodedBytes > MAX_HANDOFF_BYTES) {
    state.submission = {
      state: "failed",
      code: "payload_too_large",
      message: `The reviewed packet is ${bytesLabel(encodedBytes)}. Crop it below ${bytesLabel(MAX_HANDOFF_BYTES)} before submitting.`,
      receipt_id: null,
      duplicate: false,
    };
    renderSubmission();
    return;
  }

  state.submitAttempt += 1;
  state.submission = {
    state: "pending",
    code: null,
    message:
      "The reviewed packet is being handed to the local service. No downstream fact or action is approved.",
    receipt_id: null,
    duplicate: false,
  };
  renderSubmission();

  try {
    const scenario =
      state.fixtureRecovered &&
      elements.fixtureScenario.value === "stale_session"
        ? "received"
        : elements.fixtureScenario.value;
    const result =
      state.draft.kind === "fixture"
        ? await fixtureSubmit({
            envelope,
            scenario,
            attempt: state.submitAttempt,
          })
        : await postRealHandoff(origin, envelope);
    state.submission = result;
    if (result.code === "session_stale") {
      state.session = {
        state: "not_ready",
        message:
          "The local service rejected the previous session version. Open or check sign-in before retrying.",
      };
      renderSession();
    }
    if (result.state === "received") {
      clearPrivatePayloadAfterReceipt();
    }
  } catch (error) {
    state.submission = classifyTransportError(error);
  }

  renderSubmission();
}

async function checkReceipt() {
  if (!state.requestIdentity || !state.draft) {
    return;
  }

  state.submission = {
    state: "pending",
    code: null,
    message: "Checking the local service for receipt evidence.",
    receipt_id: state.submission.receipt_id,
    duplicate: false,
  };
  renderSubmission();

  try {
    const origin =
      state.draft.kind === "fixture"
        ? DEFAULT_LOCAL_ORIGIN
        : normalizeLocalOrigin(elements.localOrigin.value);
    const result =
      state.draft.kind === "fixture"
        ? await fixtureCheck({
            requestId: state.requestIdentity.request_id,
            scenario: elements.fixtureScenario.value,
          })
        : await getRealReceipt(origin, state.requestIdentity.request_id);
    state.submission = result;
    if (result.state === "received") {
      clearPrivatePayloadAfterReceipt();
    }
  } catch (error) {
    state.submission = classifyTransportError(error);
  }

  renderSubmission();
}

async function checkSession({ quiet = false } = {}) {
  if (!state.draft) {
    return;
  }

  if (state.draft.kind === "fixture") {
    if (
      elements.fixtureScenario.value === "stale_session" &&
      state.submission.code === "session_stale"
    ) {
      state.fixtureRecovered = true;
    }
    state.session = {
      state: "ready",
      message:
        state.fixtureRecovered
          ? "Synthetic session refreshed. Retry reuses the same idempotency key."
          : "Synthetic local session is ready. No network request or external effect will occur.",
    };
    renderSession();
    return;
  }

  state.session = {
    state: "checking",
    message: "Checking only the browser-managed localhost session.",
  };
  renderSession();

  try {
    const origin = normalizeLocalOrigin(elements.localOrigin.value);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);
    let response;
    try {
      response = await fetch(`${origin}/api/browser-extension/session`, {
        credentials: "include",
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
    state.session = sessionCopy(response.status, await responseBody(response));
  } catch (error) {
    state.session = {
      state: "not_ready",
      message:
        "No local session was observed. Nothing was submitted; open the local sign-in flow and check again.",
    };
    if (!quiet) {
      elements.sessionCopy.focus?.();
    }
  }

  renderSession();
}

async function openSignIn() {
  try {
    const origin = normalizeLocalOrigin(elements.localOrigin.value);
    const target = new URL("/login", origin);
    target.searchParams.set("source", "browser-extension");
    target.searchParams.set("returnTo", "/workspace");
    await chrome.tabs.create({ url: target.toString() });
  } catch (error) {
    state.session = {
      state: "not_ready",
      message: error.message,
    };
    renderSession();
  }
}

function canvasPoint(event) {
  const bounds = elements.canvas.getBoundingClientRect();
  const crop = normalizeCrop(state.draft.crop);
  const visibleWidth = 100 - crop.left - crop.right;
  const visibleHeight = 100 - crop.top - crop.bottom;
  return {
    x: crop.left + ((event.clientX - bounds.left) / bounds.width) * visibleWidth,
    y: crop.top + ((event.clientY - bounds.top) / bounds.height) * visibleHeight,
  };
}

let dragStart = null;

elements.canvas.addEventListener("pointerdown", (event) => {
  if (!state.draft || state.draft.local_cleared) {
    return;
  }
  dragStart = canvasPoint(event);
  elements.canvas.setPointerCapture(event.pointerId);
});

elements.canvas.addEventListener("pointermove", (event) => {
  if (!dragStart || !state.draft) {
    return;
  }
  const current = canvasPoint(event);
  state.drawRedaction = normalizeRedaction({
    x: Math.min(dragStart.x, current.x),
    y: Math.min(dragStart.y, current.y),
    width: Math.abs(current.x - dragStart.x),
    height: Math.abs(current.y - dragStart.y),
  });
  renderCanvas();
});

elements.canvas.addEventListener("pointerup", (event) => {
  if (!dragStart || !state.drawRedaction || !state.draft) {
    dragStart = null;
    return;
  }
  elements.canvas.releasePointerCapture(event.pointerId);
  state.draft.redactions.push(state.drawRedaction);
  state.drawRedaction = null;
  dragStart = null;
  draftChanged();
  renderCanvas();
  renderRedactionList();
});

for (const input of [
  elements.cropLeft,
  elements.cropTop,
  elements.cropRight,
  elements.cropBottom,
]) {
  input.addEventListener("change", () => {
    state.draft.crop = currentCropFromInputs();
    syncCropInputs();
    draftChanged();
    renderCanvas();
  });
}

elements.addRedaction.addEventListener("click", () => {
  state.draft.redactions.push(
    normalizeRedaction({ x: 35, y: 40, width: 30, height: 12 }),
  );
  draftChanged();
  renderCanvas();
  renderRedactionList();
});

elements.undoRedaction.addEventListener("click", () => {
  state.draft.redactions.pop();
  draftChanged();
  renderCanvas();
  renderRedactionList();
});

elements.resetImageEdits.addEventListener("click", () => {
  state.draft.crop = { left: 0, top: 0, right: 0, bottom: 0 };
  state.draft.redactions = [];
  syncCropInputs();
  draftChanged();
  renderCanvas();
  renderRedactionList();
});

elements.reviewedText.addEventListener("input", () => {
  state.draft.reviewed_text = elements.reviewedText.value;
  draftChanged();
  renderTextSummary();
});

elements.modeSelect.addEventListener("change", () => {
  state.mode = elements.modeSelect.value;
  clearDraft();
  renderMode();
});
elements.captureVisible.addEventListener("click", () =>
  requestCapture("capture.visible"),
);
elements.captureSelection.addEventListener("click", () =>
  requestCapture("capture.selection"),
);
elements.loadFixture.addEventListener("click", loadSelectedFixture);
elements.backButton.addEventListener("click", clearDraft);
elements.removeButton.addEventListener("click", clearDraft);
elements.retentionMode.addEventListener("change", () => {
  renderRetention();
  draftChanged();
});
elements.localOrigin.addEventListener("change", () => {
  state.session = {
    state: "not_checked",
    message:
      "The local target changed. Check its browser-managed session before approving this handoff.",
  };
  renderRetention();
  draftChanged();
  renderSession();
});
elements.approvalCheck.addEventListener("change", updateSubmitAvailability);
elements.submitButton.addEventListener("click", submitHandoff);
elements.checkReceipt.addEventListener("click", checkReceipt);
elements.checkSession.addEventListener("click", () => checkSession());
elements.openSignIn.addEventListener("click", openSignIn);

async function initialize() {
  elements.localOrigin.value = DEFAULT_LOCAL_ORIGIN;
  renderMode();
  try {
    await loadFixtureSuite();
    if (state.mode === "fixture") {
      await loadSelectedFixture();
    }
  } catch (error) {
    showCaptureAlert("Fixture package unavailable", error.message);
  }
}

initialize();
