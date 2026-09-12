# GET-9 isolated browser verification

Status: implemented and independently reviewed; production deployment and
client acceptance remain open. This is not overall GET-9 completion.

## Product and quality evidence

[First product trial](completeness-browser-product-first.json) passes 12 checks
in 50.134 seconds using real Claude SDK, product HTTP, Unix socket, Chromium,
public HTTPS and PostgreSQL. Search discovery is an explicitly controlled
Exa-shaped fixture. The model opens the discovered page and correctly declines
to infer employment from unrelated example.com content. Browser provenance
records Chromium 153.0.8010.12, two HTTP requests and 559 response bytes.

[Independent review](completeness-browser-product-first-quality.json) scores
task completion 4, grounding 4, naturalness 3 and recovery 3. A redundant save
call was denied; the model recovered using current-state guidance. Its final
answer repeats context despite the request for brevity. This single sample
does not establish reliability or a real-search recall rate.

Review found an evaluator P2: checking only the full rendered source ID missed
short aliases. The evaluator now requires an empty profile-field array; an
independent readback confirms the preserved first report meets that stronger
condition. The empty account proves no confirmed-state creation, not
preservation of a pre-existing confirmed state.

## Boundary and recovery evidence

The [sixth boundary trial](completeness-browser-boundaries-sixth.json) passes
seven actual-container cases: JavaScript/resource rendering, clean profile,
cross-origin/private/POST/WebSocket denial, same-origin redirect, cancellation,
late-job final counters and actual public HTTPS. Synthetic broker cases are
identified separately and do not claim HTTP transfer counts.

Earlier first through fifth reports remain unchanged. Failures exposed cleanup
timing, an overly exact whitespace assertion and intercepted-redirect races.
Fresh pages for each host-admitted redirect fixed the error-page navigation
race; verified container disappearance replaced assumptions about CLI closure.

[First recovery trial](completeness-browser-recovery-first.json) terminated
runaway JavaScript, but request flooding produced an invalid success receipt,
then unverified cleanup and closed further admission. The worker now reports
request exhaustion after closing Chromium, with an idempotent terminal path.
[Second recovery trial](completeness-browser-recovery-second.json) passes all
four checks: runaway termination, resource-limit failure and a successful fresh
browser after each failure. The new immutable image is
`sha256:07c8c853bade4bbe61a8167008d00968a074f7926974e5137bb029fdd99ed068`.

Independent code review closed robots alternate-port and uncancelable DNS P1s,
orphan ownership/inspection-race P2s and final-counter P2. The final receipt is
assembled only after abort, verified cleanup and resource-job completion.
The flood repair was independently reviewed with no new P0/P1/P2 finding.

Runtime configuration, scope and resource limits have one home in the
[worker README](../../../apps/agent-host/browser/README.md). No user browser,
cookies, shell or unrestricted network capability is admitted by this work.

## September 12 revalidation

The unchanged image remains available and no labeled browser orphan remains.
The seventh boundary run failed initial cleanup and correctly closed admission.
The second product run completed filing but failed browser execution; it is
retained as a failed acceptance run. A subsequent single-suite eighth run passes
six cases, but the late-resource case reaches its deadline. The third product
run passes all 12 strengthened checks in 64.673 seconds. [Independent third-trial quality](completeness-browser-product-third-quality.json)
scores 3/3/3/3; redundant-save recovery occurred.

At diagnosis, the shared Colima VM reports four CPUs, approximately 6 GB memory
and 44 running containers. Its VM process exceeded 500% host CPU and Docker
inventory calls were delayed. This establishes host contention, not the exact
cause of each timeout. No unrelated container was stopped and no budget or
quality threshold was increased. Host unit tests pass 46/46; docs:check passes.

## Isolated daemon and current revision proof

The ninth boundary trial failed before worker navigation and could not verify
cleanup. Fixed lifecycle diagnostics retain that timing; it does not establish
a pending-reply deadlock as the root cause. All earlier failures remain intact.
The final worker settles pending broker replies before close and distinguishes
close failure from completion; host diagnostic callback rejection cannot escape.
Independent review closes these changes with no new P0/P1/P2.

A dedicated `colima-get9-harness-browser` context (2 CPUs, 2 GB, no host mounts)
keeps the default context and its unrelated containers unchanged. The final image
is `sha256:83b1d94390fd14a5c89cde26bd8ad220062144601f7ec014f7ce76cc65add095`.
[Tenth boundary trial](completeness-browser-boundaries-tenth.json) passes 8/8,
including late-resource cleanup and an asynchronously throwing diagnostic callback.
[Third recovery trial](completeness-browser-recovery-third.json) passes 4/4.
These observations establish specific successful runs, not the exact cause of
previous shared-daemon failures. Runtime limits were not increased.

[Fourth product trial](completeness-browser-product-fourth.json), after merging
main into `be7b2075`, passes all 12 strengthened checks in 42.776 seconds; the
browser lifecycle reaches verified cleanup in 3.659 seconds.
[Independent quality](completeness-browser-product-fourth-quality.json) scores
completion 4, grounding 3 and naturalness 3. Recovery was not exercised. Search
discovery remains controlled; no Exa network or installed-client proof is claimed.
