# GET-9 explicit SDK transport review

Date: 2026-09-10. Reviewer: independent design_review agent.
Scope: the current uncommitted explicit-proxy and contact-tool-description delta.
The reviewer changed no product code, invoked no model and controlled no Simulator.

## Decision and implementation boundary

**No new confirmed P0/P1 was found in this delta.** This does not establish
native reliability, deployment of the new revision or full GET-9 acceptance.

`claudeHarnessConfiguration.ts` reads only the server-owned
`TALENT_SIGNAL_CLAUDE_HTTPS_PROXY`, validates its trimmed value and freezes the
canonical URL with the rest of the deployment configuration. HTTP/HTTPS schemes
are accepted; nonempty credentials, non-root path, query, fragment and remaining
control/space characters are rejected with a fixed error code. The product
request and model cannot select this transport.

`claudeHarness.ts` adds only that value as the SDK subprocess's `HTTPS_PROXY`.
It does not introduce ambient proxy inheritance, `HTTP_PROXY`, `NO_PROXY`,
`ALL_PROXY`, TLS overrides or host CA/credential variables. Existing endpoint
admission and dedicated Hao credential selection remain intact. The selected
proxy is still a transport trust boundary; a loopback address does not establish
where its service forwards traffic.

`harnessContinuationFingerprint` includes the transport digest, so changing the
proxy or moving between proxy/direct modes changes SDK continuation identity.
The configuration receipt reports only the mode and omits the proxy address.
Existing source authority, cancellation, budgets and failure handling are unchanged.
No stop hook was added to production.

The contact-tool descriptions now specify both IDs for a unique relationship
read and explain the handoff to the scoped assistant. Runtime current-message
search grounding, unique-read checks, proposal fingerprints and human confirmation
remain unchanged. A description does not itself grant collection or write authority.

## Independent checks

The reviewer ran the following narrow checks against the current source:

- Agent: `claudeHarness.test.ts`, `claudeHarnessContinuation.test.ts` and
  `claudeChatProvider.test.ts`: 23/23 passed.
- Backend: `workspaceConversationAgent.test.ts`: 28/28 passed.

The tests cover explicit versus ambient configuration, invalid proxy values,
subprocess environment selection, receipt redaction, fingerprint change and
existing contact lookup/proposal boundaries. They use controlled seams and do
not prove actual network routing or deployment behavior.

## Actual proxy experiment evidence

The reviewer inspected all nested tool results in
[the first proxy experiment](contact-proxy-experiment-first.json). It injected
the existing host HTTPS proxy into an otherwise unchanged synthetic SDK probe;
it preceded the new contact-tool description and is not acceptance evidence for
that later instruction change.

| Trial | SDK duration | Actual product result |
| --- | --- | --- |
| 1 | 12.193 s | Search, exact read and correct scoped handoff. |
| 2 | 8.995 s | Search only; no read, returned candidates/clarification. |
| 3 | 16.750 s | Search, then two invalid reads missing the context ID; the second also supplied `reason`. Both were rejected; no successful handoff. |

All three SDK runs completed with no recorded API retry, but the product
completion gate passed only **1/3**. Trial 3 attempted recovery but did not
correct its invalid input. This batch supports a narrower observation of smooth
transport under the proxy; it does not identify IPv6 as the cause of prior
failures, prove stable model behavior or satisfy native acceptance. Earlier
failures and the separately bounded stop-hook experiment remain intact.

At review time, the stated deployed revision was still `421c02d6`, predating this
explicit-proxy implementation. Deployment verification and native revalidation of
the new code remain the parent's outstanding work.
