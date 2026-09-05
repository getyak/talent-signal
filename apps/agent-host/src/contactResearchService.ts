import { createHash } from "node:crypto";
import {
  CONTACT_RESEARCH_CONTRACT, ContactResearchToolRequestSchema, ContactResearchToolResponseSchema,
  type ContactPublicSource, type ContactResearchToolResponse,
} from "@talent-signal/agent";
import { ExaProvider, type ExaSource } from "./exaProvider.js";
import { TikHubProvider } from "./tikHubProvider.js";

export interface ContactResearchDependencies {
  exa?: Pick<ExaProvider, "searchProfiles" | "searchWeb" | "fetchContent">;
  tikhub?: Pick<TikHubProvider, "searchProfiles">;
}

function sourceID(provider: string, url: string): string {
  return createHash("sha256").update(`${provider}:${url}`).digest("hex");
}

function fromExa(source: ExaSource, channel: ContactPublicSource["channel"], stage: ContactPublicSource["stage"]): ContactPublicSource {
  return {
    source_id: sourceID("exa", source.url), url: source.url, title: source.title,
    text: source.text, channel, provider_id: "exa", provider_request_id: source.providerRequestID,
    content_hash: source.contentHash, retrieved_at: source.retrievedAt, stage,
  };
}

function normalize(value: string) { return value.normalize("NFKC").toLowerCase().trim(); }

export async function runContactResearchTool(
  raw: unknown,
  environment: NodeJS.ProcessEnv = process.env,
  dependencies: ContactResearchDependencies = {},
): Promise<ContactResearchToolResponse> {
  const request = ContactResearchToolRequestSchema.parse(raw);
  const signal = AbortSignal.timeout(30_000);
  const exa = () => dependencies.exa ?? new ExaProvider({ apiKey: environment.EXA_API_KEY ?? "" });
  let sources: ContactPublicSource[];
  const input = request.input;
  if (input.operation === "fetch") {
    if (input.source.source_id !== sourceID(input.source.provider_id, input.source.url)) {
      throw new Error("CONTACT_RESEARCH_SOURCE_ID_MISMATCH");
    }
    const page = await exa().fetchContent(input.source.url, signal);
    sources = [fromExa(page, input.source.channel, "fetched")];
  } else {
    const query = normalize(input.query);
    if (!request.anchors.some((anchor) => query.includes(normalize(anchor)))) {
      throw new Error("CONTACT_RESEARCH_QUERY_OUT_OF_SCOPE");
    }
    // Contact research admits public career context, not sensitive or private lookup.
    if (/\b(?:email|phone|home address|background check|religion|ethnicity|medical|sexual orientation)\b|邮箱|手机号|家庭住址|背调|宗教|民族|病史|性取向/iu.test(query) ||
        /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu.test(query)) {
      throw new Error("CONTACT_RESEARCH_PRIVATE_LOOKUP_PROHIBITED");
    }
    if (input.channel === "linkedin" || input.channel === "web") {
      const observations = input.channel === "linkedin"
        ? await exa().searchProfiles(input.query, input.maximum_results, signal)
        : await exa().searchWeb(input.query, input.maximum_results, signal);
      sources = observations.map((source) => fromExa(source, input.channel, "discovered"));
    } else {
      const tikhub = dependencies.tikhub ?? new TikHubProvider({
        apiKey: environment.TIKHUB_API_KEY ?? "",
        ...(environment.TIKHUB_BASE_URL ? { baseUrl: environment.TIKHUB_BASE_URL } : {}),
      });
      const observations = await tikhub.searchProfiles({
        platform: input.channel, query: input.query, maximumResults: input.maximum_results,
      }, signal);
      sources = observations.map((source) => ({
        source_id: sourceID("tikhub", source.profileUrl), url: source.profileUrl,
        title: source.displayName, text: [source.displayName, source.handle, source.biography].filter(Boolean).join("\n").slice(0, 16_000),
        channel: input.channel, provider_id: "tikhub", provider_request_id: source.providerRequestID,
        content_hash: source.contentHash, retrieved_at: source.retrievedAt, stage: "profile_observation",
      }));
    }
  }
  return ContactResearchToolResponseSchema.parse({
    contract_version: CONTACT_RESEARCH_CONTRACT, task_id: request.task_id,
    call_id: request.call_id, sources, external_effects: [],
  });
}
