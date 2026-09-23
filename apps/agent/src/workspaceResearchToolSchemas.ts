import {z} from "zod";
import {ContactResearchChannelSchema} from "./contactResearchSchemas.js";

// SDK schemas stay in the Agent package; the backend independently validates
// these arguments before dispatching to Agent Host.
export const WorkspacePublicSubjectSearchSchema=z.strictObject({
  subject_id:z.string().min(1).max(200),
  channels:z.array(ContactResearchChannelSchema).min(1).max(4).optional(),
});
export const WorkspacePublicSourceFetchSchema=z.strictObject({
  source_ids:z.array(z.string().regex(/^[a-f0-9]{64}$/u)).min(1).max(5),
});
