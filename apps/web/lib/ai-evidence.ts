import {
  evidenceKinds,
  type Evidence,
  type EvidenceKind,
  type EvidenceModality,
  type EvidenceSpeaker,
} from "./signals";

const modalities: EvidenceModality[] = [
  "commitment",
  "constraint",
  "explicit-fact",
  "preference",
];
const speakers: EvidenceSpeaker[] = ["candidate", "recruiter", "unknown"];
const evidenceKindSet = new Set<string>(evidenceKinds);
const modalitySet = new Set<string>(modalities);
const speakerSet = new Set<string>(speakers);

export const modelEvidenceSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    evidence: {
      type: "array",
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          kind: {
            type: "string",
            enum: evidenceKinds,
            description:
              "The single operational candidate-momentum field supported by the excerpt.",
          },
          label: {
            type: "string",
            maxLength: 80,
            description: "A short neutral label for review.",
          },
          excerpt: {
            type: "string",
            maxLength: 500,
            description:
              "An exact, contiguous quote copied from the conversation.",
          },
          modality: {
            type: "string",
            enum: modalities,
          },
          speaker: {
            type: "string",
            enum: speakers,
          },
          ambiguities: {
            type: "array",
            maxItems: 3,
            items: {
              type: "string",
              maxLength: 160,
            },
          },
        },
        required: [
          "kind",
          "label",
          "excerpt",
          "modality",
          "speaker",
          "ambiguities",
        ],
      },
    },
  },
  required: ["evidence"],
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBoundedString(
  value: unknown,
  maxLength: number,
): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= maxLength
  );
}

export function parseModelEvidence(
  content: string,
  conversation: string,
): Evidence[] {
  let decoded: unknown;

  try {
    decoded = JSON.parse(content);
  } catch {
    throw new Error("The model returned invalid JSON.");
  }

  if (!isRecord(decoded) || !Array.isArray(decoded.evidence)) {
    throw new Error("The model response did not contain evidence.");
  }

  const seenKinds = new Set<EvidenceKind>();
  const evidence: Evidence[] = [];

  for (const candidate of decoded.evidence.slice(0, 8)) {
    if (!isRecord(candidate)) {
      continue;
    }

    const { kind, label, excerpt, modality, speaker, ambiguities } = candidate;
    if (
      typeof kind !== "string" ||
      !evidenceKindSet.has(kind) ||
      seenKinds.has(kind as EvidenceKind) ||
      !isBoundedString(label, 80) ||
      !isBoundedString(excerpt, 500) ||
      !conversation.includes(excerpt) ||
      typeof modality !== "string" ||
      !modalitySet.has(modality) ||
      typeof speaker !== "string" ||
      !speakerSet.has(speaker) ||
      !Array.isArray(ambiguities) ||
      ambiguities.length > 3 ||
      !ambiguities.every((item) => isBoundedString(item, 160))
    ) {
      continue;
    }

    const typedKind = kind as EvidenceKind;
    seenKinds.add(typedKind);
    evidence.push({
      id: typedKind,
      label: label.trim(),
      excerpt,
      modality: modality as EvidenceModality,
      speaker: speaker as EvidenceSpeaker,
      ambiguities: ambiguities.map((item) => item.trim()),
    });
  }

  return evidence;
}
