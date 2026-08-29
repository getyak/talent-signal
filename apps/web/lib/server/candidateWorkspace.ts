import "server-only";

import {
  candidateMomentumFixtures,
  isCandidateMomentumDataset,
  type CandidateMomentumDataset,
  type WorkspaceDataSource,
} from "../candidateMomentum";

const LOCAL_BACKEND_PATH = "/v1/candidate-momentum/cases";
const LOCAL_HOSTNAMES = new Set(["127.0.0.1", "::1", "localhost"]);

function getLocalBackendEndpoint() {
  const configured = process.env.TALENT_SIGNAL_BACKEND_URL?.trim();
  if (!configured) {
    return null;
  }

  try {
    const url = new URL(configured);
    if (
      !LOCAL_HOSTNAMES.has(url.hostname) ||
      (url.protocol !== "http:" && url.protocol !== "https:")
    ) {
      return null;
    }
    return new URL(LOCAL_BACKEND_PATH, url);
  } catch {
    return null;
  }
}

export async function loadCandidateWorkspace(): Promise<{
  dataset: CandidateMomentumDataset;
  source: WorkspaceDataSource;
}> {
  const endpoint = getLocalBackendEndpoint();
  if (!endpoint) {
    return {
      dataset: candidateMomentumFixtures,
      source: {
        kind: "fixture-fallback",
        label: "Frozen sample cases",
        detail:
          "Synthetic fixtures are loaded in this browser session. Nothing is synchronized or written externally.",
      },
    };
  }

  try {
    const response = await fetch(endpoint, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(2_500),
    });
    if (!response.ok) {
      throw new Error("本地后端返回错误。");
    }

    const payload: unknown = await response.json();
    if (!isCandidateMomentumDataset(payload)) {
      throw new Error("本地后端返回了不兼容的测试数据集。");
    }

    return {
      dataset: payload,
      source: {
        kind:
          payload.data_mode === "synchronized"
            ? "synchronized-local"
            : "fixture-local",
        label:
          payload.data_mode === "synchronized"
            ? "Local synchronized backend"
            : "Local fixture backend",
        detail:
          payload.data_mode === "synchronized"
            ? "This state was explicitly labeled synchronized by the configured localhost backend."
            : "已配置的本地主机后端返回了合成测试状态，不代表任何外部系统。",
      },
    };
  } catch {
    return {
      dataset: candidateMomentumFixtures,
      source: {
        kind: "fixture-fallback",
        label: "Local backend unavailable",
        detail:
          "The localhost backend could not be verified, so the frozen synthetic fixtures were loaded instead. Refresh to retry.",
      },
    };
  }
}
