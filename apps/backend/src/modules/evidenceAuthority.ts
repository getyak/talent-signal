import type { Pursuit } from "@talent-signal/contracts";

export type EvidenceAuthority =
  Pursuit["roles"][number]["evidence_state"];

export function evidenceAuthority(
  basisKind: "evidence_supported" | "user_authored",
  evidenceRefs: string[],
  availableEvidenceRefs: string[],
): EvidenceAuthority {
  const referenceCount = new Set(evidenceRefs).size;
  const availableReferenceCount = new Set(availableEvidenceRefs).size;
  const unavailableReferenceCount = Math.max(
    0,
    referenceCount - availableReferenceCount,
  );
  const availability: EvidenceAuthority["availability"] =
    basisKind === "user_authored" && referenceCount === 0
      ? "not_required"
      : referenceCount > 0 && unavailableReferenceCount === 0
        ? "available"
        : availableReferenceCount > 0
          ? "partial"
          : "unavailable";

  return {
    availability,
    reference_count: referenceCount,
    available_reference_count: availableReferenceCount,
    unavailable_reference_count: unavailableReferenceCount,
  };
}
