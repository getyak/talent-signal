# Web login failure and recovery

## Outcome and boundary

Restore the existing local account backend and make failed Web login recoverable.
Preserve authentication, account isolation, safe callbacks, and all unrelated
workspace changes. No database reset, seeding, credential changes, or automatic
credential retries. Real user password/OAuth success requires user credentials
and remains outside the synthetic verification performed here.

## Runtime evidence

On 2026-09-20, Web served authentication providers while API port 4317 refused
connections. Docker was inaccessible. Colima listed Running, but status could
not retrieve a runtime and SSH reset connections. Lima logged VZErrorDomain
Code=3, stating the virtual machine was no longer live. The cause of the VM
termination itself is unknown.

Restarting the existing Colima instance restored the existing containers. API
and PostgreSQL became healthy; loopback and private Tailscale readiness both
reported ready with migration 071_agent_session_list_snapshots. The installed
backend keeper then exited successfully. No volumes or deployment revisions
were changed during restoration. This is recovery evidence, not a guarantee
that the underlying virtualization failure cannot recur.

## Implementation

- Add optional AbortSignal parameters to the two shared password-auth client
  methods and retain the common HTTP/error contract. Web bounds these calls to
  five seconds and aborts the fetch on timeout.
- Distinguish invalid credentials, unavailable service, rate limits, validation,
  duplicate registration, and an unconfirmed registration result. Unknown
  failures never claim that credentials are wrong. An unconfirmed registration
  directs the user to sign in rather than submit another registration.
- Preserve entered non-secret fields after action reset. Passwords remain in
  component memory only and are never echoed in action responses or persisted.
- Disable repeated submission and mode switching while pending; show the correct
  login/registration pending label. Offer explicit retry, accessible errors, and
  password visibility controls.
- Preserve callback validation and all existing session authority boundaries.

## Validation and remaining work

Pi implemented the initial slice in an isolated worktree; its runner rejected
only the plan path because the contract said docs/plans while this repository
uses plans. The parent retained the valid repository path and owns final checks.

Independent review identified the uncertain-registration recovery issue (P2),
which the parent fixed. No P0/P1 findings were reported on the initial slice.
Parent also replaced duplicate Web fetch code with optional shared-client signals.

Observed in the browser: existing service rejects a synthetic nonexistent account;
updated form retains email and password on failure; a stalled synthetic proxy
produces a five-second service error; pending disables mode tabs and submission;
recovering that proxy allows direct retry without refilling. Production backend
was not stopped for outage testing. React form reset behavior is documented at
https://react.dev/reference/react-dom/components/form.

Final source validation: Web typecheck passed; 657 tests passed and one skipped;
documentation checks and architecture checks passed. Independent re-review closed
the registration finding and found no new P0/P1/P2 findings. Browser verification
also confirmed that an unconfirmed registration offers sign-in and carries the
registration email into that form. Credentials used were synthetic.

Production activation uses scripts/deploy/web-local.sh and the existing rollback-
capable installer; the active-release.json receipt and live provider/login readback
are the authority for the installed revision, separate from source validation.
Real-account password/OAuth completion has not been claimed.
