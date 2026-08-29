"use client";

import {
  parseIdentityHandleQuery,
  type PersonDirectoryItem,
  type WorkspaceReviewResponse,
} from "@talent-signal/contracts";
import { useCallback, useEffect, useReducer, useRef } from "react";

import {
  redactionInPreparedImage,
  type NormalizedImageRedaction,
} from "@/lib/image-minimization";
import {
  analyzeScreenshotCapture,
  commitScreenshotCapture,
  findScreenshotCapturePeople,
  ScreenshotCaptureRequestError,
  type ScreenshotCaptureAnalysis,
} from "@/lib/screenshot-capture-client";
import type {
  ScreenshotCaptureDraft,
  ScreenshotOwnerRole,
} from "@/lib/screenshot-capture";

export type ScreenshotCapturePhase =
  | "select"
  | "analyzing"
  | "binding"
  | "review"
  | "committing";

export type ScreenshotCaptureControllerState = {
  analysis: ScreenshotCaptureAnalysis | null;
  analysisPreviewImage: File | null;
  analysisStatus: string;
  assignmentLabel: string;
  contactName: string;
  createNewContext: boolean;
  createNewPerson: boolean;
  cropBottomPercent: number;
  cropTopPercent: number;
  dragging: boolean;
  error: string;
  file: File | null;
  people: PersonDirectoryItem[];
  peopleLoading: boolean;
  peopleLookupFailed: boolean;
  phase: ScreenshotCapturePhase;
  redactionMode: boolean;
  redactions: NormalizedImageRedaction[];
  reviewedDraft: ScreenshotCaptureDraft | null;
  screenshotOwner: ScreenshotOwnerRole;
  selectedContextId: string | null;
  selectedPersonId: string | null;
  transcriptEditing: boolean;
};

export const initialScreenshotCaptureState: ScreenshotCaptureControllerState = {
  analysis: null,
  analysisPreviewImage: null,
  analysisStatus: "",
  assignmentLabel: "",
  contactName: "",
  createNewContext: false,
  createNewPerson: false,
  cropBottomPercent: 100,
  cropTopPercent: 0,
  dragging: false,
  error: "",
  file: null,
  people: [],
  peopleLoading: true,
  peopleLookupFailed: false,
  phase: "select",
  redactionMode: false,
  redactions: [],
  reviewedDraft: null,
  screenshotOwner: "unknown",
  selectedContextId: null,
  selectedPersonId: null,
  transcriptEditing: false,
};

export type ScreenshotCaptureControllerAction =
  | { type: "analysis_cancelled" }
  | { type: "analysis_failed"; error: string }
  | {
      type: "analysis_succeeded";
      analysis: ScreenshotCaptureAnalysis;
      previewImage: File | null;
    }
  | { type: "analysis_started" }
  | { type: "analysis_slow" }
  | { type: "assignment_changed"; value: string }
  | { type: "commit_failed"; error: string; outcomeUnknown: boolean }
  | { type: "commit_started" }
  | { type: "contact_changed"; value: string }
  | { type: "context_selected"; id: string; label: string }
  | { type: "crop_bottom_changed"; value: number }
  | { type: "crop_top_changed"; value: number }
  | { type: "dragging_changed"; value: boolean }
  | { type: "file_rejected"; error: string }
  | { type: "file_selected"; file: File | null }
  | { type: "new_context_selected" }
  | { type: "new_person_selected" }
  | { type: "people_failed"; error: string }
  | { type: "people_loaded"; people: PersonDirectoryItem[] }
  | { type: "people_loading" }
  | { type: "person_cleared" }
  | { type: "person_selected"; person: PersonDirectoryItem }
  | { type: "phase_changed"; phase: ScreenshotCapturePhase }
  | { type: "redaction_added"; redaction: NormalizedImageRedaction }
  | { type: "redaction_adjusted"; redaction: NormalizedImageRedaction }
  | { type: "redactions_cleared" }
  | { type: "redaction_undone" }
  | { type: "redaction_mode_toggled" }
  | { type: "review_message_changed"; draft: ScreenshotCaptureDraft }
  | { type: "review_reset" }
  | { type: "screenshot_owner_changed"; value: ScreenshotOwnerRole }
  | { type: "transcript_editing_changed"; value: boolean };

export function screenshotCaptureControllerReducer(
  state: ScreenshotCaptureControllerState,
  action: ScreenshotCaptureControllerAction,
): ScreenshotCaptureControllerState {
  switch (action.type) {
    case "analysis_cancelled":
      return {
        ...state,
        analysisPreviewImage: null,
        analysisStatus:
          "分析已取消。未保存任何来源；裁剪区域与本地遮罩仍可用于重试。",
        error: "",
        phase: "select",
      };
    case "analysis_failed":
      return {
        ...state,
        analysisStatus:
          "未保存任何来源；裁剪区域与本地遮罩仍可用于重试。",
        error: action.error,
        phase: "select",
      };
    case "analysis_succeeded":
      return {
        ...state,
        analysis: action.analysis,
        analysisPreviewImage: action.previewImage,
        analysisStatus: "",
        phase: "binding",
        reviewedDraft: action.analysis.draft,
      };
    case "analysis_started":
      return {
        ...state,
        analysisStatus:
          "正在读取临时截图。你可以取消；尚未保存人物、来源或联系人。",
        error: "",
        phase: "analyzing",
      };
    case "analysis_slow":
      return {
        ...state,
        analysisStatus:
          "所需时间比平时更长。你可以取消；尚未保存任何来源。",
      };
    case "assignment_changed":
      return { ...state, assignmentLabel: action.value };
    case "commit_failed":
      return {
        ...state,
        analysisStatus: action.outcomeUnknown
          ? "结果未知。重试会使用同一请求 ID，因此不会创建重复审阅。"
          : "没有提交任何内容；已审阅草稿仍可用于重试。",
        error: action.error,
        phase: "review",
      };
    case "commit_started":
      return {
        ...state,
        analysisStatus: "",
        error: "",
        phase: "committing",
      };
    case "contact_changed":
      return {
        ...state,
        assignmentLabel: "",
        contactName: action.value,
        createNewContext: false,
        createNewPerson: false,
        peopleLoading: true,
        peopleLookupFailed: false,
        selectedContextId: null,
        selectedPersonId: null,
      };
    case "context_selected":
      return {
        ...state,
        assignmentLabel: action.label,
        createNewContext: false,
        selectedContextId: action.id,
      };
    case "crop_bottom_changed":
      return { ...state, cropBottomPercent: action.value };
    case "crop_top_changed":
      return { ...state, cropTopPercent: action.value };
    case "dragging_changed":
      return { ...state, dragging: action.value };
    case "file_rejected":
      return { ...state, error: action.error };
    case "file_selected":
      return {
        ...state,
        analysis: null,
        analysisPreviewImage: null,
        analysisStatus: "",
        cropBottomPercent: 100,
        cropTopPercent: 0,
        error: "",
        file: action.file,
        phase: "select",
        redactionMode: false,
        redactions: [],
        reviewedDraft: null,
        transcriptEditing: false,
      };
    case "new_context_selected":
      return {
        ...state,
        assignmentLabel: "",
        createNewContext: true,
        selectedContextId: null,
      };
    case "new_person_selected":
      return {
        ...state,
        assignmentLabel: "",
        createNewContext: false,
        createNewPerson: true,
        selectedContextId: null,
        selectedPersonId: null,
      };
    case "people_failed":
      return {
        ...state,
        error: action.error,
        people: [],
        peopleLoading: false,
        peopleLookupFailed: true,
      };
    case "people_loaded":
      return {
        ...state,
        people: action.people,
        peopleLoading: false,
        peopleLookupFailed: false,
      };
    case "people_loading":
      return {
        ...state,
        peopleLoading: true,
        peopleLookupFailed: false,
      };
    case "person_cleared":
      return {
        ...state,
        assignmentLabel: "",
        createNewContext: false,
        createNewPerson: false,
        selectedContextId: null,
        selectedPersonId: null,
      };
    case "person_selected":
      return {
        ...state,
        assignmentLabel: "",
        contactName: action.person.display_label,
        createNewContext: false,
        createNewPerson: false,
        selectedContextId: null,
        selectedPersonId: action.person.id,
      };
    case "phase_changed":
      return { ...state, error: "", phase: action.phase };
    case "redaction_added":
      return { ...state, redactions: [...state.redactions, action.redaction] };
    case "redaction_adjusted":
      return {
        ...state,
        redactions: [...state.redactions.slice(0, -1), action.redaction],
      };
    case "redactions_cleared":
      return { ...state, redactions: [] };
    case "redaction_undone":
      return { ...state, redactions: state.redactions.slice(0, -1) };
    case "redaction_mode_toggled":
      return { ...state, redactionMode: !state.redactionMode };
    case "review_message_changed":
      return { ...state, reviewedDraft: action.draft };
    case "review_reset":
      return {
        ...state,
        reviewedDraft: state.analysis?.draft ?? state.reviewedDraft,
        transcriptEditing: false,
      };
    case "screenshot_owner_changed":
      return { ...state, screenshotOwner: action.value };
    case "transcript_editing_changed":
      return { ...state, transcriptEditing: action.value };
  }
}

async function prepareConversationImage(
  source: File,
  topPercent: number,
  bottomPercent: number,
  redactions: NormalizedImageRedaction[],
): Promise<File> {
  if (
    topPercent === 0 &&
    bottomPercent === 100 &&
    redactions.length === 0
  ) {
    return source;
  }
  const bitmap = await createImageBitmap(source);
  try {
    const top = Math.round((bitmap.height * topPercent) / 100);
    const bottom = Math.round((bitmap.height * bottomPercent) / 100);
    const height = Math.max(1, bottom - top);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("浏览器无法准备所选裁剪区域。")
    }
    context.drawImage(
      bitmap,
      0,
      top,
      bitmap.width,
      height,
      0,
      0,
      bitmap.width,
      height,
    );
    context.fillStyle = "#11100f";
    for (const redaction of redactions) {
      const pixels = redactionInPreparedImage(
        redaction,
        bitmap.width,
        bitmap.height,
        topPercent,
        bottomPercent,
      );
      if (!pixels) {
        continue;
      }
      const x = Math.floor(pixels.x);
      const y = Math.floor(pixels.y);
      const right = Math.ceil(pixels.x + pixels.width);
      const maskedBottom = Math.ceil(pixels.y + pixels.height);
      context.fillRect(x, y, right - x, maskedBottom - y);
    }
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => {
          if (result) {
            resolve(result);
          } else {
            reject(new Error("The browser could not encode the selected crop."));
          }
        },
        source.type,
        source.type === "image/png" ? undefined : 0.92,
      );
    });
    return new File([blob], source.name, {
      lastModified: source.lastModified,
      type: blob.type || source.type,
    });
  } finally {
    bitmap.close();
  }
}

const SCREENSHOT_ANALYSIS_SLOW_MS = 8_000;

export function useScreenshotCaptureController({
  onCommitted,
}: {
  onCommitted: (workspace: WorkspaceReviewResponse) => void;
}) {
  const [state, dispatch] = useReducer(
    screenshotCaptureControllerReducer,
    initialScreenshotCaptureState,
  );
  const inputRef = useRef<HTMLInputElement | null>(null);
  const commitRequestIdRef = useRef<string | null>(null);
  const analysisAbortRef = useRef<AbortController | null>(null);
  const analysisRunRef = useRef(0);
  const committedRef = useRef(false);
  const peopleRequestIdRef = useRef(0);
  const wasCommitted = useCallback(() => committedRef.current, []);

  useEffect(() => {
    return () => {
      analysisRunRef.current += 1;
      analysisAbortRef.current?.abort();
      analysisAbortRef.current = null;
    };
  }, []);

  useEffect(() => {
    const query = state.contactName.normalize("NFKC").trim();
    const requestId = ++peopleRequestIdRef.current;
    const controller = new AbortController();
    const timer = window.setTimeout(
      () => {
        dispatch({ type: "people_loading" });
        void findScreenshotCapturePeople(query, controller.signal)
          .then((people) => {
            if (requestId === peopleRequestIdRef.current) {
              dispatch({ type: "people_loaded", people });
            }
          })
          .catch((caught: unknown) => {
            if (
              requestId !== peopleRequestIdRef.current ||
              (caught instanceof DOMException && caught.name === "AbortError")
            ) {
              return;
            }
            dispatch({
              type: "people_failed",
              error:
                caught instanceof Error
                  ? caught.message
                  : "Existing people could not be loaded.",
            });
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
  }, [state.contactName]);

  const matchingPeople = state.people.slice(0, 4);
  const contactQueryIsHandle =
    parseIdentityHandleQuery(state.contactName) !== null;
  const selectedPerson =
    state.people.find((person) => person.id === state.selectedPersonId) ?? null;
  const selectedContext =
    selectedPerson?.contexts.find(
      (context) => context.id === state.selectedContextId,
    ) ?? null;
  const identityDecided =
    selectedPerson !== null ||
    (state.createNewPerson &&
      !state.peopleLoading &&
      !state.peopleLookupFailed &&
      !contactQueryIsHandle);
  const relationshipDecided = state.createNewPerson
    ? Boolean(state.assignmentLabel.trim())
    : Boolean(
        selectedPerson &&
          (selectedContext ||
            (state.createNewContext && state.assignmentLabel.trim())),
      );
  const draft = state.reviewedDraft ?? state.analysis?.draft ?? null;
  const reviewImage = state.analysisPreviewImage ?? state.file;
  const transcriptEdited = Boolean(
    state.analysis &&
      draft &&
      JSON.stringify(draft.messages) !==
        JSON.stringify(state.analysis.draft.messages),
  );

  function chooseFile(nextFile: File | null) {
    analysisRunRef.current += 1;
    analysisAbortRef.current?.abort();
    analysisAbortRef.current = null;
    if (
      nextFile &&
      (!['image/jpeg', 'image/png', 'image/webp'].includes(nextFile.type) ||
        nextFile.size === 0 ||
        nextFile.size > 8 * 1024 * 1024)
    ) {
      dispatch({
        type: "file_rejected",
        error: "请选择一张不超过 8 MB 的非空 JPEG、PNG 或 WebP 图片。",
      });
      if (inputRef.current) {
        inputRef.current.value = "";
      }
      return;
    }
    commitRequestIdRef.current = null;
    dispatch({ type: "file_selected", file: nextFile });
  }

  function cancelAnalysis() {
    analysisRunRef.current += 1;
    analysisAbortRef.current?.abort();
    analysisAbortRef.current = null;
    dispatch({ type: "analysis_cancelled" });
  }

  async function analyze() {
    if (!state.file) {
      dispatch({
        type: "file_rejected",
        error: "开始分析前，请选择一张对话截图。",
      });
      return;
    }
    analysisAbortRef.current?.abort();
    const controller = new AbortController();
    const run = analysisRunRef.current + 1;
    analysisRunRef.current = run;
    analysisAbortRef.current = controller;
    dispatch({ type: "analysis_started" });
    const slowTimer = window.setTimeout(() => {
      if (analysisRunRef.current === run && !controller.signal.aborted) {
        dispatch({ type: "analysis_slow" });
      }
    }, SCREENSHOT_ANALYSIS_SLOW_MS);
    try {
      const preparedFile = await prepareConversationImage(
        state.file,
        state.cropTopPercent,
        state.cropBottomPercent,
        state.redactions,
      );
      if (controller.signal.aborted || analysisRunRef.current !== run) {
        return;
      }
      const analysis = await analyzeScreenshotCapture({
        cropBottomPercent: state.cropBottomPercent,
        cropTopPercent: state.cropTopPercent,
        image: preparedFile,
        redactionCount: state.redactions.length,
        screenshotOwner: state.screenshotOwner,
        signal: controller.signal,
      });
      if (controller.signal.aborted || analysisRunRef.current !== run) {
        return;
      }
      dispatch({
        type: "analysis_succeeded",
        analysis,
        previewImage: preparedFile === state.file ? null : preparedFile,
      });
    } catch (caught: unknown) {
      if (
        controller.signal.aborted ||
        analysisRunRef.current !== run ||
        (caught instanceof DOMException && caught.name === "AbortError")
      ) {
        return;
      }
      dispatch({
        type: "analysis_failed",
        error:
          caught instanceof Error
            ? caught.message
            : "无法分析截图。",
      });
    } finally {
      window.clearTimeout(slowTimer);
      if (analysisRunRef.current === run) {
        analysisAbortRef.current = null;
      }
    }
  }

  function continueToReview() {
    if (
      !state.contactName.trim() ||
      !state.assignmentLabel.trim() ||
      !identityDecided ||
      !relationshipDecided
    ) {
      dispatch({
        type: "commit_failed",
        error:
          "Bind the reviewed source to an existing person or explicitly confirm a new one before continuing.",
        outcomeUnknown: false,
      });
      dispatch({ type: "phase_changed", phase: "binding" });
      return;
    }
    dispatch({ type: "phase_changed", phase: "review" });
  }

  async function commit() {
    if (!state.analysis) {
      return;
    }
    if (
      !state.contactName.trim() ||
      !state.assignmentLabel.trim() ||
      !identityDecided ||
      !relationshipDecided
    ) {
      dispatch({
        type: "commit_failed",
        error:
          "Bind the reviewed source to an existing person or explicitly confirm a new one before committing.",
        outcomeUnknown: false,
      });
      dispatch({ type: "phase_changed", phase: "binding" });
      return;
    }
    const draftToCommit = state.reviewedDraft ?? state.analysis.draft;
    if (draftToCommit.messages.some((message) => !message.text.trim())) {
      dispatch({
        type: "commit_failed",
        error: "提交前，每条已审阅消息都必须包含可见的来源文字。",
        outcomeUnknown: false,
      });
      return;
    }
    dispatch({ type: "commit_started" });
    try {
      commitRequestIdRef.current ??= crypto.randomUUID();
      const workspace = await commitScreenshotCapture({
        analysis: state.analysis,
        assignmentLabel: state.assignmentLabel,
        contactName: state.contactName,
        draft: draftToCommit,
        personId: state.selectedPersonId,
        relationshipContextId: state.selectedContextId,
        requestId: commitRequestIdRef.current,
      });
      committedRef.current = true;
      onCommitted(workspace);
    } catch (caught) {
      const outcomeUnknown =
        caught instanceof ScreenshotCaptureRequestError &&
        caught.outcome === "unknown";
      dispatch({
        type: "commit_failed",
        error:
          caught instanceof Error
            ? caught.message
            : "无法提交已审阅的采集内容。",
        outcomeUnknown,
      });
    }
  }

  function updateReviewedMessage(
    messageId: string,
    change: { speaker?: "candidate" | "recruiter" | "unknown"; text?: string },
  ) {
    if (!state.reviewedDraft) {
      return;
    }
    dispatch({
      type: "review_message_changed",
      draft: {
        ...state.reviewedDraft,
        messages: state.reviewedDraft.messages.map((message) =>
          message.source_message_id === messageId
            ? { ...message, ...change }
            : message,
        ),
        assertions: [],
        disposition: "no_action",
        action: null,
      },
    });
  }

  function adjustLatestRedaction(
    direction: "down" | "left" | "right" | "up",
    resize: boolean,
  ) {
    const latest = state.redactions.at(-1);
    if (!latest) {
      return;
    }
    const step = 0.01;
    const next = { ...latest };
    if (resize) {
      if (direction === "left") {
        next.width = Math.max(0.008, next.width - step);
      } else if (direction === "right") {
        next.width = Math.min(1 - next.x, next.width + step);
      } else if (direction === "up") {
        next.height = Math.max(0.008, next.height - step);
      } else {
        next.height = Math.min(1 - next.y, next.height + step);
      }
    } else if (direction === "left") {
      next.x = Math.max(0, next.x - step);
    } else if (direction === "right") {
      next.x = Math.min(1 - next.width, next.x + step);
    } else if (direction === "up") {
      next.y = Math.max(0, next.y - step);
    } else {
      next.y = Math.min(1 - next.height, next.y + step);
    }
    dispatch({ type: "redaction_adjusted", redaction: next });
  }

  return {
    actions: {
      addRedaction: (redaction: NormalizedImageRedaction) =>
        dispatch({ type: "redaction_added", redaction }),
      adjustLatestRedaction,
      analyze,
      cancelAnalysis,
      chooseFile,
      clearPerson: () => dispatch({ type: "person_cleared" }),
      clearRedactions: () => dispatch({ type: "redactions_cleared" }),
      commit,
      continueToReview,
      createNewContext: () => dispatch({ type: "new_context_selected" }),
      createNewPerson: () => dispatch({ type: "new_person_selected" }),
      goToBinding: () => dispatch({ type: "phase_changed", phase: "binding" }),
      goToSelect: () => dispatch({ type: "phase_changed", phase: "select" }),
      resetReview: () => dispatch({ type: "review_reset" }),
      selectContext: (id: string, label: string) =>
        dispatch({ type: "context_selected", id, label }),
      selectPerson: (person: PersonDirectoryItem) =>
        dispatch({ type: "person_selected", person }),
      setAssignmentLabel: (value: string) =>
        dispatch({ type: "assignment_changed", value }),
      setContactName: (value: string) =>
        dispatch({ type: "contact_changed", value }),
      setCropBottomPercent: (value: number) =>
        dispatch({ type: "crop_bottom_changed", value }),
      setCropTopPercent: (value: number) =>
        dispatch({ type: "crop_top_changed", value }),
      setDragging: (value: boolean) =>
        dispatch({ type: "dragging_changed", value }),
      setScreenshotOwner: (value: ScreenshotOwnerRole) =>
        dispatch({ type: "screenshot_owner_changed", value }),
      setTranscriptEditing: (value: boolean) =>
        dispatch({ type: "transcript_editing_changed", value }),
      toggleRedactionMode: () => dispatch({ type: "redaction_mode_toggled" }),
      undoRedaction: () => dispatch({ type: "redaction_undone" }),
      updateReviewedMessage,
    },
    derived: {
      contactQueryIsHandle,
      draft,
      identityDecided,
      matchingPeople,
      relationshipDecided,
      reviewImage,
      selectedContext,
      selectedPerson,
      transcriptEdited,
    },
    inputRef,
    state,
    wasCommitted,
  };
}
