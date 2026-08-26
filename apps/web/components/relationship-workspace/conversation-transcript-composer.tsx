"use client";

import { ChatCircleDots, Sparkle, Warning } from "@phosphor-icons/react";
import { useRef, useState } from "react";

import {
  CONVERSATION_SPEAKERS,
  parseConversationTranscript,
  type ConversationSpeaker,
  type ConversationTranscriptMessage,
} from "@/lib/conversation-transcript";

export function ConversationTranscriptComposer({
  title,
  value,
  messages,
  attributionReviewed,
  onTitleChange,
  onValueChange,
  onMessagesChange,
  onAttributionReviewedChange,
}: {
  title: string;
  value: string;
  messages: ConversationTranscriptMessage[];
  attributionReviewed: boolean;
  onTitleChange: (value: string) => void;
  onValueChange: (value: string) => void;
  onMessagesChange: (messages: ConversationTranscriptMessage[]) => void;
  onAttributionReviewedChange: (reviewed: boolean) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [unlabeledSpeaker, setUnlabeledSpeaker] =
    useState<ConversationSpeaker>("unknown");
  const [fileName, setFileName] = useState("");
  const [analysisError, setAnalysisError] = useState("");
  const [analysisSummary, setAnalysisSummary] = useState<{
    labeled: number;
    unknown: number;
  } | null>(null);

  function invalidateAnalysis() {
    onMessagesChange([]);
    onAttributionReviewedChange(false);
    setAnalysisSummary(null);
    setAnalysisError("");
  }

  function analyzeTranscript() {
    try {
      const analysis = parseConversationTranscript(value, unlabeledSpeaker);
      onMessagesChange(analysis.messages);
      onAttributionReviewedChange(false);
      setAnalysisSummary({
        labeled: analysis.explicitly_labeled_count,
        unknown: analysis.unknown_count,
      });
      setAnalysisError("");
    } catch (caught) {
      onMessagesChange([]);
      onAttributionReviewedChange(false);
      setAnalysisSummary(null);
      setAnalysisError(
        caught instanceof Error
          ? caught.message
          : "The transcript could not be analyzed.",
      );
    }
  }

  async function readTextFile(nextFile: File | null) {
    if (!nextFile) {
      return;
    }
    if (nextFile.size <= 0 || nextFile.size > 256 * 1024) {
      setAnalysisError("Choose one non-empty TXT or Markdown file up to 256 KB.");
      return;
    }
    try {
      const text = await nextFile.text();
      setFileName(nextFile.name);
      onTitleChange(title.trim() ? title : nextFile.name);
      onValueChange(text);
      onMessagesChange([]);
      onAttributionReviewedChange(false);
      setAnalysisSummary(null);
      setAnalysisError("");
    } catch {
      setAnalysisError("The selected text file could not be read in the browser.");
    }
  }

  function updateSpeaker(sequence: number, speaker: ConversationSpeaker) {
    onMessagesChange(
      messages.map((message) =>
        message.sequence === sequence ? { ...message, speaker } : message,
      ),
    );
    onAttributionReviewedChange(false);
  }

  return (
    <div className="context-transcript-import">
      <div className="context-transcript-import__source">
        <label>
          <span>Conversation label</span>
          <input
            maxLength={240}
            onChange={(event) => onTitleChange(event.target.value)}
            placeholder="e.g. Aug 9 follow-up transcript"
            value={title}
          />
        </label>
        <input
          accept=".txt,.md,text/plain,text/markdown"
          className="sr-only"
          onChange={(event) => void readTextFile(event.target.files?.[0] ?? null)}
          ref={fileInputRef}
          type="file"
        />
        <button
          className="context-resource-file context-resource-file--transcript"
          onClick={() => fileInputRef.current?.click()}
          type="button"
        >
          <ChatCircleDots aria-hidden="true" size={20} />
          <span>
            <strong>{fileName || "Choose TXT or Markdown"}</strong>
            <small>Read locally, then review the exact text below.</small>
          </span>
        </button>
        <label>
          <span>Conversation text</span>
          <textarea
            maxLength={40_000}
            onChange={(event) => {
              onValueChange(event.target.value);
              invalidateAnalysis();
            }}
            placeholder={
              "Candidate: Availability: 15 September\nRecruiter: I’ll confirm the interview window."
            }
            rows={6}
            value={value}
          />
        </label>
      </div>

      <div className="context-transcript-import__analysis">
        <fieldset>
          <legend>Unlabeled lines belong to</legend>
          <div>
            {CONVERSATION_SPEAKERS.map((speaker) => (
              <button
                aria-pressed={unlabeledSpeaker === speaker}
                key={speaker}
                onClick={() => {
                  setUnlabeledSpeaker(speaker);
                  invalidateAnalysis();
                }}
                type="button"
              >
                {speaker === "unknown"
                  ? "Not sure"
                  : speaker === "candidate"
                    ? "Candidate"
                    : "Recruiter"}
              </button>
            ))}
          </div>
          <small>
            Choose Candidate only for a candidate-only export. Talent Signal
            never guesses a speaker from wording or message order.
          </small>
        </fieldset>
        <button
          className="context-secondary-button"
          disabled={!value.trim()}
          onClick={analyzeTranscript}
          type="button"
        >
          <Sparkle aria-hidden="true" size={17} weight="fill" />
          Analyze speaker labels
        </button>
      </div>

      {analysisError ? (
        <p className="context-resource-composer__error" role="alert">
          <Warning aria-hidden="true" size={16} />
          {analysisError}
        </p>
      ) : null}

      {messages.length > 0 ? (
        <section
          aria-labelledby="transcript-review-title"
          className="context-transcript-import__review"
        >
          <header>
            <div>
              <p className="eyebrow">SPEAKER REVIEW</p>
              <h3 id="transcript-review-title">Review every message owner.</h3>
            </div>
            <span>
              {messages.length} messages · {analysisSummary?.labeled ?? 0} labeled
              {analysisSummary?.unknown
                ? ` · ${analysisSummary.unknown} unknown`
                : ""}
            </span>
          </header>
          <div className="context-transcript-import__messages">
            {messages.map((message) => (
              <div data-speaker={message.speaker} key={message.sequence}>
                <select
                  aria-label={`Speaker for transcript message ${message.sequence + 1}`}
                  onChange={(event) =>
                    updateSpeaker(
                      message.sequence,
                      event.target.value as ConversationSpeaker,
                    )
                  }
                  value={message.speaker}
                >
                  <option value="candidate">Candidate</option>
                  <option value="recruiter">Recruiter</option>
                  <option value="unknown">Not sure</option>
                </select>
                <p>{message.text}</p>
              </div>
            ))}
          </div>
          <label className="context-resource-checkbox context-transcript-import__confirm">
            <input
              checked={attributionReviewed}
              onChange={(event) =>
                onAttributionReviewedChange(event.target.checked)
              }
              type="checkbox"
            />
            <span>
              I reviewed the speaker labels above
              <small>
                Unknown messages remain context only and cannot create candidate
                facts. Every fact still requires separate review.
              </small>
            </span>
          </label>
        </section>
      ) : null}
    </div>
  );
}
