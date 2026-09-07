/** Offline transport fixtures exercise the production serializer/parser only.
 * Public input markers select responses; no oracle, human review or calibration
 * data enters this transport, and its receipts remain deterministic_fake.
 */
export function createPhaseOneFixtureFetcher(): typeof fetch {
  return async (_url, init) => {
    const payload = JSON.parse(String(init?.body)) as { model: string; messages: Array<{ role: string; content: string }> };
    const context = JSON.parse(payload.messages.find(item => item.role === "user")!.content) as {
      objective: string; allowed_citation_ids: string[]; context_blocks: Array<{ summary: string }>;
    };
    const behavior = /^\[fixture:([a-z_]+)\]/.exec(context.objective)?.[1];
    if (behavior === "provider_failure") return new Response(JSON.stringify({ error: { code: "synthetic_provider_unavailable" } }), { status: 503 });
    let answer = { kind: "clarification", title: "Clarify the evidence", body: "Which source and reference time should guide this answer?", citation_ids: [] as string[] };
    if (behavior === "ambiguous_identity") answer = { kind: "clarification", title: "Choose the contact",
      body: "Which of the two contacts named Alex is intended? Their statements belong to different people; do not merge them.", citation_ids: [] };
    if (behavior === "historical_conflict") answer = { kind: "answer", title: "Preserve the timeline",
      body: `Earlier availability is historical; the later withdrawal supersedes it. Do not schedule or contact based on the old statement. ${context.context_blocks.map(item => item.summary).join(" ")}`,
      citation_ids: context.allowed_citation_ids };
    if (behavior === "clearly_answerable") answer = { kind: "answer", title: "Confirmed interview time",
      body: context.context_blocks[0]!.summary, citation_ids: context.allowed_citation_ids };
    return new Response(JSON.stringify({ id: "phase-one-offline", model: payload.model,
      choices: [{ message: { content: JSON.stringify(answer) } }], usage: { prompt_tokens: 10, completion_tokens: 12 } }), { status: 200 });
  };
}
