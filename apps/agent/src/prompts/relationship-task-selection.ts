// Source-controlled release selection. Stage an independently approved bundle,
// rebuild the application, then verify the loaded task configuration digest.
// Runtime environment variables and Opik prompt labels cannot change this value.
export const RELATIONSHIP_TASK_SELECTION = {
  schemaVersion: "relationship-task-selection.v1",
  candidate: { schemaVersion: "optimization-candidate.v1", taskFragmentId: "baseline", exampleIds: [] },
  examples: [],
} as const;
