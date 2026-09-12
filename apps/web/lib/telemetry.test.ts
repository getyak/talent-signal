import { afterEach, expect, it, vi } from "vitest";

import { WORKSPACE_SESSION_EXPIRED_EVENT } from "@/components/workspace-session-request";
import { appendWebTrace, beginWebTrace, completeWebTrace } from "./telemetry";

afterEach(() => vi.unstubAllGlobals());

it("keeps private trace content and subsequent writes in the rendered workspace", async () => {
  const browser = Object.assign(new EventTarget(), {
    location: { href: "https://example.test/workspace/ask", origin: "https://example.test" },
    sessionStorage: { getItem: () => null, setItem: () => undefined },
  });
  vi.stubGlobal("window", browser);
  vi.stubGlobal("document", {
    querySelector: () => ({ dataset: { workspaceScope: "rendered-test-account" } }),
  });
  const expired = vi.fn();
  browser.addEventListener(WORKSPACE_SESSION_EXPIRED_EVENT, expired);
  let effectiveAccount = "rendered-test-account";
  const writes: Array<{ account: string; body: Record<string, unknown> }> = [];
  const request = vi.fn<typeof fetch>(async (_input, init) => {
    const headers = new Headers(init?.headers);
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get("x-talent-signal-workspace")).toBe("rendered-test-account");
    if (headers.get("x-talent-signal-workspace") !== effectiveAccount) {
      return Response.json({ code: "backend_session_expired" }, { status: 401 });
    }
    const body = JSON.parse(String(init?.body));
    writes.push({ account: effectiveAccount, body });
    return Response.json({ trace_id: body.trace_id, artifact_ids: [] }, { status: 201 });
  });
  vi.stubGlobal("fetch", request);
  const input = {
    name: "synthetic private interaction",
    route: "/workspace/ask",
    text: "Synthetic candidate evidence",
    files: [new File(["Synthetic attachment"], "synthetic.txt", { type: "text/plain" })],
    dataClassification: "private_relationship" as const,
    authorizationScope: "user_authorized_agent_interaction",
  };
  const trace = await beginWebTrace(input);
  expect(writes).toHaveLength(1);
  expect(writes[0].body.content_parts).toHaveLength(2);

  // Another tab replaces the effective cookie; this rendered tab stays bound
  // to its original account for create, append and completion alike.
  effectiveAccount = "owner-account";
  await expect(beginWebTrace(input)).rejects.toThrow("智能助理请求未发送");
  await expect(appendWebTrace(trace, { events: [], spans: [] })).rejects.toThrow("追踪事件批次");
  await expect(completeWebTrace(trace, { status: "ok" })).rejects.toThrow("追踪终止回执");
  expect(request).toHaveBeenCalledTimes(4);
  expect(writes).toHaveLength(1);
  expect(writes[0].account).toBe("rendered-test-account");
  expect(expired).toHaveBeenCalledTimes(3);
});
