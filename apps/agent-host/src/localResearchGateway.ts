import {
  AgentCapabilityError,
  type AgentFetchedWebPage,
  type AgentPublicResearchGateway,
  type AgentPublicResearchScope,
  type AgentWebSearchResult,
} from "@talent-signal/agent";

import { LocalResearchStore } from "./localResearchStore.js";
import {
  AgentSafeWebFetchError,
  fetchDiscoveredPublicPage,
} from "./safeWebFetch.js";
import {
  AgentWebSearchProviderError,
  type AgentWebSearchProvider,
} from "./webSearchProviders.js";

export interface LocalResearchGatewayOptions {
  fetchPage?: typeof fetchDiscoveredPublicPage;
}

export class LocalResearchGateway implements AgentPublicResearchGateway {
  private readonly fetchPage: typeof fetchDiscoveredPublicPage;

  constructor(
    private readonly provider: AgentWebSearchProvider,
    private readonly store: LocalResearchStore,
    options: LocalResearchGatewayOptions = {},
  ) {
    this.fetchPage = options.fetchPage ?? fetchDiscoveredPublicPage;
  }

  async searchWeb(
    scope: AgentPublicResearchScope,
    input: { query: string; maximumResults: number; recencyDays: number | null },
    signal: AbortSignal,
  ) {
    if (scope.providerID !== this.provider.id) {
      throw new AgentCapabilityError(
        "WEB_SEARCH_PROVIDER_MISMATCH",
        "The configured local provider differs from the immutable run scope.",
      );
    }
    try {
      return await this.provider.search(scope, input, signal);
    } catch (error) {
      if (error instanceof AgentWebSearchProviderError) {
        throw new AgentCapabilityError(error.code, error.message);
      }
      throw error;
    }
  }

  async fetchWeb(
    scope: AgentPublicResearchScope,
    result: AgentWebSearchResult,
    signal: AbortSignal,
  ): Promise<Omit<AgentFetchedWebPage, "resultID">> {
    try {
      return await this.fetchPage(scope, result, signal);
    } catch (error) {
      if (error instanceof AgentSafeWebFetchError) {
        throw new AgentCapabilityError(error.code, error.message);
      }
      throw error;
    }
  }

  commitResearchArtifact(
    ...args: Parameters<AgentPublicResearchGateway["commitResearchArtifact"]>
  ) {
    return this.store.commitResearchArtifact(...args);
  }

  commitNoAction(...args: Parameters<AgentPublicResearchGateway["commitNoAction"]>) {
    return this.store.commitNoAction(...args);
  }
}
