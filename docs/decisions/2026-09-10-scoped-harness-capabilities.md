# Scoped general capabilities in the shared Harness

Status: proposed for the GET-9 completeness follow-up; not implemented or
accepted as delivered capability.

## Context

The shared SDK loop already supplies product tools, Skills and source-aware
continuation. The original GET-9 request also asks for useful general file,
code and browser capabilities. Host shell access would expose the credentialed
SDK process and is not an appropriate product capability grant.

## Proposed decision

Give the SDK callable capability groups backed by host-issued Run resources.
The host owns resource IDs, hashes, source references, scope, allowed operations
and expiration. Reads, computation return and derived-file persistence recheck
source authority. Derived artifacts inherit every input source and the shortest
expiration; model output cannot choose a host path or grant its own authority.

The first file/computation slice supports TXT, CSV and JSON processing with
JavaScript inside a fresh QuickJS WebAssembly runtime. A fixed trusted launcher
runs in a separate Node child process with no inherited credentials or Node
options. Model code enters QuickJS only, never Node eval/vm or Shell. No host
filesystem, network, process or module-loading bridge is registered.

QuickJS memory, stack and instruction interruption limits complement parent
hard timeout/kill, bounded input/output and bounded concurrency. The timeout
covers startup, code, Promise jobs, serialization and cleanup. This is WebAssembly
capability isolation plus process lifecycle isolation, not an independent OS
permission boundary or full Node/Python/Shell support.

Browser capability requires a real isolated browser and a private profile with
no user cookies. Only current Run public-source IDs may be navigated; every
request, redirect, frame and other network channel must remain within the
existing public-network policy. Text fetch is not browser execution evidence.

## Acceptance and reconsideration

Require actual scoped chat requests to reach the file/computation/browser
backends, followed by product artifact/source readback. Exercise infinite code,
memory/stack exhaustion, unresolved promises, oversized/circular outputs, host
access attempts, cross-Run residue, cancellation and source revocation. Do not
count schemas, interfaces or mock execution as product delivery.

Reconsider a dedicated OS-isolated service if native libraries, additional
languages, outbound network or arbitrary package installation are required.
Reconsider browser admission if complete request-level public-network mediation
cannot be demonstrated. Keep these capabilities unadmitted until their own
verification and independent review pass.

References: [QuickJS/WASM isolation and exposed APIs](https://github.com/justjake/quickjs-emscripten#exposing-apis),
[runtime limits](https://github.com/justjake/quickjs-emscripten/blob/main/doc/quickjs-emscripten/classes/QuickJSRuntime.md).
Package resolution on 2026-09-10 selected candidate `quickjs-emscripten` 0.32.0;
no dependency has been added yet.
