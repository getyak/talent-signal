import { createEnvironmentChatAnswerProvider } from "../modules/chatAnswerProvider.js";

async function main(): Promise<void> {
  const provider = createEnvironmentChatAnswerProvider();
  if (!provider) {
    console.log("Synthetic Relationship Ask provider probe skipped: disabled.");
    return;
  }

  const evidenceId = "synthetic-evidence-0001";
  const result = await provider.answer({
    objective: "What is the safest next question to ask this synthetic contact?",
    context_blocks: [
      {
        block_id: "synthetic-block-0001",
        block_key: "synthetic-follow-up-gap",
        type: "relationship_context",
        status: "confirmed",
        headline: "Synthetic follow-up context",
        summary: "The contact asked for role scope before choosing a meeting time.",
        items: ["No role scope was included in the synthetic exchange."],
        evidence_fragment_ids: [evidenceId],
      },
    ],
    allowed_citation_ids: [evidenceId],
  });

  if (result.kind === "clarification" || !result.citation_ids.includes(evidenceId)) {
    throw new Error("Synthetic Relationship Ask probe returned an unsupported result.");
  }
  console.log(
    `Synthetic Relationship Ask provider probe passed: ${result.provider_id}/${result.model}; input=${result.input_tokens}; output=${result.output_tokens}.`,
  );
}

await main();
