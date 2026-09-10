import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { KnowledgeSnapshotSchema } from "../../packages/contracts/dist/index.js";
import { loadSnapshot } from "../../apps/backend/dist/modules/wiki.js";

const require = createRequire(new URL("../../apps/backend/package.json", import.meta.url));
const stringify = createRequire(require.resolve("fastify"))("fast-json-stringify")(KnowledgeSnapshotSchema);

const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export async function profileMemoryEvidence(pool, accountID, captureID) {
  return (await pool.query(`SELECT f.id, f.account_id, f.capture_id, f.resource_id, f.text_content,
    f.content_hash, f.status, f.deleted_at, f.review_status, f.attributed_actor, f.attribution_status,
    c.subject_id, c.assignment_id, c.identity_status, c.status AS capture_status, c.deleted_at AS capture_deleted_at,
    r.processing_state AS resource_state, r.deleted_at AS resource_deleted_at
    FROM evidence_fragments f JOIN captures c ON c.account_id=f.account_id AND c.id=f.capture_id
    JOIN source_resources r ON r.account_id=f.account_id AND r.id=f.resource_id
    WHERE f.account_id=$1 AND f.capture_id=$2 ORDER BY f.id`, [accountID, captureID])).rows;
}

/** Checks the actual current HTTP Memory and its unchanged original source. */
export async function verifyProfileMemory({ pool, client, accountID, contact, memory }) {
  const evidence = await profileMemoryEvidence(pool, accountID, memory.captureID);
  const original = await loadSnapshot(pool, accountID, contact.person_id, contact.relationship_context_id, memory.snapshotID);
  // A later profile may legitimately supersede the old snapshot. Only this
  // lifecycle field is normalized; all original blocks/dependencies must hash.
  const originalContentHash = hash(JSON.parse(stringify({ ...original, status: "published" })));
  const compiled = await client.compileKnowledge(contact.person_id, contact.relationship_context_id,
    { idempotency_key: randomUUID(), objective: "Read the current sourced commitment after reviewed profile reuse." });
  const current = await client.getKnowledge(contact.person_id, contact.relationship_context_id);
  const source = evidence.find(f => f.text_content === "我答应周五给陈夏发原型。");
  const blocks = current.blocks.filter(block => JSON.stringify(block.content).includes("我答应周五给陈夏发原型。"));
  const checks = {
    originalSnapshotContentPreserved: originalContentHash === memory.snapshotHash,
    originalEvidenceIdentityPreserved: source?.capture_id === memory.captureID &&
      original.blocks.some(block => block.dependencies.some(d => d.type === "evidence_fragment" && d.id === source?.id)),
    ...(memory.evidence ? { originalEvidenceUnchanged: hash(evidence) === hash(memory.evidence) } : {}),
    evidenceActiveAndScoped: Boolean(source && source.status === "active" && !source.deleted_at && source.review_status === "reviewed" &&
      source.attributed_actor === "recruiter" && source.attribution_status === "confirmed" && source.capture_status === "active" &&
      !source.capture_deleted_at && source.resource_state !== "deleted" && !source.resource_deleted_at && source.identity_status === "bound" &&
      source.subject_id === contact.person_id && source.assignment_id === contact.relationship_context_id),
    currentMemoryReadback: current.id === compiled.id && current.status === "published" && blocks.length > 0,
    currentMemoryOriginalDependency: blocks.some(block => block.dependencies.some(d => d.type === "evidence_fragment" && d.id === source?.id)),
  };
  return { checks, evidence, originalSnapshotStatus: original.status, originalContentHash,
    currentSnapshot: current, beforeEvidenceAvailable: Boolean(memory.evidence) };
}
