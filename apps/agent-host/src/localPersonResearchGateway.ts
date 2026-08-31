import {
  AgentCapabilityError,
  type AgentPersonResearchGateway,
  type AgentPersonResearchScope,
} from "@talent-signal/agent";

import { LocalPersonResearchStore } from "./localPersonResearchStore.js";
import {
  TikHubProvider,
  TikHubProviderError,
} from "./tikHubProvider.js";

export class LocalPersonResearchGateway implements AgentPersonResearchGateway {
  constructor(
    private readonly provider: TikHubProvider,
    private readonly store: LocalPersonResearchStore,
  ) {}

  async searchProfiles(
    scope: AgentPersonResearchScope,
    input: Parameters<AgentPersonResearchGateway["searchProfiles"]>[1],
    signal: AbortSignal,
  ) {
    if (scope.providerID !== this.provider.id) {
      throw new AgentCapabilityError(
        "PERSON_PROFILE_PROVIDER_MISMATCH",
        "The configured local provider differs from the immutable person-research scope.",
      );
    }
    try {
      return await this.provider.searchProfiles(input, signal);
    } catch (error) {
      if (error instanceof TikHubProviderError) {
        throw new AgentCapabilityError(error.code, error.message);
      }
      throw error;
    }
  }

  commitPersonResearchArtifact(
    ...args: Parameters<
      AgentPersonResearchGateway["commitPersonResearchArtifact"]
    >
  ) {
    return this.store.commitPersonResearchArtifact(...args);
  }

  commitNoAction(
    ...args: Parameters<AgentPersonResearchGateway["commitNoAction"]>
  ) {
    return this.store.commitNoAction(...args);
  }
}
