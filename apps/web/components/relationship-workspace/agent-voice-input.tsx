"use client";

import {
  CircleNotch,
  Microphone,
  Stop,
  X,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";

import { relationshipIntegrationFetch } from "@/components/workspace-session-request";
import { encodeVoiceWav } from "@/lib/agent-voice-wav";

type VoicePhase =
  | "idle"
  | "disclosure"
  | "requesting"
  | "recording"
  | "transcribing"
  | "failed";

type VoiceResource = {
  context: AudioContext;
  gain: GainNode;
  processor: ScriptProcessorNode;
  source: MediaStreamAudioSourceNode;
  stream: MediaStream;
};

const DISCLOSURE_KEY = "talent-signal:voice-disclosure:v1";
const MAX_RECORDING_SECONDS = 60;

function voiceErrorMessage(error: unknown) {
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return "Microphone access is off. Allow it in browser settings, then try again.";
  }
  if (error instanceof DOMException && error.name === "NotFoundError") {
    return "No microphone is available on this device.";
  }
  return error instanceof Error
    ? error.message
    : "Voice input could not create an editable draft.";
}

export function AgentVoiceInput({
  disabled = false,
  onTranscript,
}: {
  disabled?: boolean;
  onTranscript: (transcript: string) => void;
}) {
  const [phase, setPhase] = useState<VoicePhase>("idle");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [error, setError] = useState("");
  const resourcesRef = useRef<VoiceResource | null>(null);
  const chunksRef = useRef<Float32Array[]>([]);
  const sampleRateRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestAbortRef = useRef<AbortController | null>(null);

  const clearTimers = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    intervalRef.current = null;
    timeoutRef.current = null;
  }, []);

  const releaseAudio = useCallback(() => {
    clearTimers();
    const resources = resourcesRef.current;
    resourcesRef.current = null;
    if (!resources) return;
    resources.processor.onaudioprocess = null;
    resources.source.disconnect();
    resources.processor.disconnect();
    resources.gain.disconnect();
    for (const track of resources.stream.getTracks()) track.stop();
    void resources.context.close();
  }, [clearTimers]);

  function reset() {
    requestAbortRef.current?.abort();
    requestAbortRef.current = null;
    releaseAudio();
    chunksRef.current = [];
    sampleRateRef.current = 0;
    setElapsedSeconds(0);
    setError("");
    setPhase("idle");
  }

  async function transcribeRecording() {
    const chunks = chunksRef.current;
    const sampleRate = sampleRateRef.current;
    releaseAudio();
    if (chunks.reduce((total, chunk) => total + chunk.length, 0) < sampleRate / 4) {
      setError("No voice was recorded. Try one short phrase.");
      setPhase("failed");
      return;
    }
    setPhase("transcribing");
    const controller = new AbortController();
    requestAbortRef.current?.abort();
    requestAbortRef.current = controller;
    try {
      const wav = encodeVoiceWav(chunks, sampleRate);
      const requestId = crypto.randomUUID();
      const form = new FormData();
      form.set("request_id", requestId);
      form.set(
        "file",
        new File([wav], "relationship-voice.wav", { type: "audio/wav" }),
      );
      const result = await relationshipIntegrationFetch(
        "/api/local-integration/voice-transcriptions",
        { method: "POST", body: form, signal: controller.signal },
      );
      const payload = (await result.json()) as {
        client_request_id?: string;
        message?: string;
        provider?: string;
        status?: string;
        temporary_audio_stored_by_talent_signal?: boolean;
        transcript?: string;
      };
      if (
        !result.ok ||
        payload.client_request_id !== requestId ||
        payload.provider !== "doubao" ||
        payload.status !== "draft" ||
        payload.temporary_audio_stored_by_talent_signal !== false ||
        !payload.transcript?.trim()
      ) {
        throw new Error(
          payload.message ?? "Voice transcription did not return an editable draft.",
        );
      }
      onTranscript(payload.transcript.trim());
      reset();
    } catch (caught) {
      if (controller.signal.aborted) return;
      chunksRef.current = [];
      sampleRateRef.current = 0;
      setError(voiceErrorMessage(caught));
      setPhase("failed");
    } finally {
      if (requestAbortRef.current === controller) {
        requestAbortRef.current = null;
      }
    }
  }

  async function startRecording() {
    setError("");
    setPhase("requesting");
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Voice input is not supported in this browser.");
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          autoGainControl: true,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      if (document.visibilityState !== "visible") {
        for (const track of stream.getTracks()) track.stop();
        throw new Error("Keep this tab visible while recording voice input.");
      }
      const context = new AudioContext();
      const source = context.createMediaStreamSource(stream);
      const processor = context.createScriptProcessor(4096, 1, 1);
      const gain = context.createGain();
      gain.gain.value = 0;
      chunksRef.current = [];
      sampleRateRef.current = context.sampleRate;
      processor.onaudioprocess = (event) => {
        chunksRef.current.push(
          new Float32Array(event.inputBuffer.getChannelData(0)),
        );
      };
      source.connect(processor);
      processor.connect(gain);
      gain.connect(context.destination);
      resourcesRef.current = { context, gain, processor, source, stream };
      try {
        sessionStorage.setItem(DISCLOSURE_KEY, "accepted");
      } catch {
        // Storage availability must not decide whether an approved recording works.
      }
      setElapsedSeconds(0);
      setPhase("recording");
      const startedAt = Date.now();
      intervalRef.current = setInterval(() => {
        setElapsedSeconds(
          Math.min(
            MAX_RECORDING_SECONDS,
            Math.floor((Date.now() - startedAt) / 1_000),
          ),
        );
      }, 250);
      timeoutRef.current = setTimeout(() => {
        void transcribeRecording();
      }, MAX_RECORDING_SECONDS * 1_000);
    } catch (caught) {
      releaseAudio();
      setError(voiceErrorMessage(caught));
      setPhase("failed");
    }
  }

  function openVoice() {
    if (phase === "recording") {
      void transcribeRecording();
      return;
    }
    if (phase !== "idle") return;
    let disclosureAccepted = false;
    try {
      disclosureAccepted =
        sessionStorage.getItem(DISCLOSURE_KEY) === "accepted";
    } catch {
      disclosureAccepted = false;
    }
    if (disclosureAccepted) {
      void startRecording();
    } else {
      setPhase("disclosure");
    }
  }

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible" || !resourcesRef.current) return;
      releaseAudio();
      chunksRef.current = [];
      setError("Voice stopped when this tab left the foreground. Nothing was sent.");
      setPhase("failed");
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      requestAbortRef.current?.abort();
      requestAbortRef.current = null;
      releaseAudio();
    };
  }, [releaseAudio]);

  const busy = phase === "requesting" || phase === "transcribing";
  const buttonLabel =
    phase === "recording"
      ? "Stop and transcribe"
      : busy
        ? "Preparing voice input"
        : "Start voice input";

  return (
    <div className="context-chat__voice" data-phase={phase}>
      <button
        aria-label={buttonLabel}
        aria-pressed={phase === "recording"}
        className="context-chat__voice-button"
        disabled={disabled || busy}
        onClick={openVoice}
        type="button"
      >
        {busy ? (
          <CircleNotch aria-hidden="true" className="spin" size={18} />
        ) : phase === "recording" ? (
          <Stop aria-hidden="true" size={17} weight="fill" />
        ) : (
          <Microphone aria-hidden="true" size={18} weight="duotone" />
        )}
      </button>

      {phase !== "idle" ? (
        <div
          aria-live="polite"
          className="context-chat__voice-status"
          role={phase === "disclosure" ? "dialog" : "status"}
        >
          {phase === "disclosure" ? (
            <>
              <div>
                <strong>Turn voice into an editable draft?</strong>
                <p>
                  Your temporary audio is sent to Doubao for transcription and
                  is not stored by Talent Signal. Nothing reaches the Agent until
                  you press Send.
                </p>
              </div>
              <div className="context-chat__voice-actions">
                <button onClick={reset} type="button">Not now</button>
                <button onClick={() => void startRecording()} type="button">
                  Start recording
                </button>
              </div>
            </>
          ) : phase === "recording" ? (
            <>
              <div>
                <strong>Listening · {elapsedSeconds}s</strong>
                <p>Foreground only · {MAX_RECORDING_SECONDS} seconds max</p>
              </div>
              <button aria-label="Cancel voice input" onClick={reset} type="button">
                <X aria-hidden="true" size={16} />
              </button>
            </>
          ) : phase === "requesting" ? (
            <div>
              <strong>Waiting for microphone permission…</strong>
              <p>No audio is sent before recording stops.</p>
            </div>
          ) : phase === "transcribing" ? (
            <>
              <div>
                <strong>Creating an editable transcript…</strong>
                <p>The current message draft stays unchanged until this finishes.</p>
              </div>
              <button
                aria-label="Cancel voice transcription"
                onClick={reset}
                type="button"
              >
                <X aria-hidden="true" size={16} />
              </button>
            </>
          ) : (
            <>
              <div>
                <strong>Voice draft not created</strong>
                <p>{error}</p>
              </div>
              <button aria-label="Dismiss voice error" onClick={reset} type="button">
                <X aria-hidden="true" size={16} />
              </button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
