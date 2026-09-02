import { randomUUID } from "node:crypto";

import type { AgentRuntimeDependencies } from "./types.js";

export const SYSTEM_AGENT_RUNTIME: Readonly<AgentRuntimeDependencies> =
  Object.freeze({
    nowMs: () => Date.now(),
    randomUUID: () => randomUUID(),
    setTimeout: (callback: () => void, delayMs: number) =>
      setTimeout(callback, delayMs),
    clearTimeout: (handle: unknown) => clearTimeout(handle as NodeJS.Timeout),
  });
