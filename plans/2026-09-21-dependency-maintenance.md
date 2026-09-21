# Reviewed dependency maintenance

## Outcome and scope

Keep the useful changes from the open dependency PRs while removing redundant
or low-value pending upgrades. Preserve the already reviewed Agent SDK and
Opik runtime-proof boundary. Do not invoke Apple signing or release uploads.

The isolated branch starts at main `8106cbbf` after GET-24 merged. It consolidates
Fastlane 2.240.1 from PR221, Fastify 5.12.5 and Mammoth 1.12.3 from PR220.
The rest of the fifteen-package group is deferred rather than described as
already merged or universally unnecessary. PR219 was closed automatically by
Dependabot and replaced by PR226. PR226 was independently reviewed and closed:
its action upgrades are optional for the current Linux/macOS and Ruby 3.3 setup;
the existing pinned CodeQL security scans remain enabled.

## Decisions and evidence

- Fastify fixes GHSA-4mh8-r7rc-xpvc. This application does not enable HTTP/2 or
  response trailers, so this is defensive maintenance, not proof of an exposed
  production exploit.
- Mammoth fixes malformed-document parsing and excessive regex backtracking.
  A deterministic synthetic DOCX reproduces an orphan-field TypeError on the
  old installed parser and passes through the real extraction boundary after
  upgrading. It retains proposed attribution and visible warnings. Parser
  provenance now reads the installed package version rather than a stale literal.
- Fastlane addresses TestFlight success reporting and certificate synchronization.
  Ruby 3.3 frozen bundle installation, Fastlane version and lane parsing, and
  loading spaceship/security/zip passed in an isolated disposable container.
  No lane was executed and no Apple credential was injected.
- The mixed Agent SDK upgrade would require updating runtime provenance and
  continuation fingerprints. The Opik upgrade needs new destination/read/delete
  proof; historical verification artifacts must not be rewritten to fake it.

## Milestones

1. **Complete:** inspect every open PR and independently review the useful scope.
2. **Complete:** focused extraction (3 tests), backend routes/application (24
   tests), Web typechecking, release policy (18 tests), documentation checks, and
   independent review passed with no open findings.
3. **Complete:** PR227 passed required exact-head CI/security and merged;
   superseded PR220 and PR221 were closed with links and reasons.
4. **Complete:** deploy the merged dependency revision and verify actual runtime
   versions, migration preservation, restart recovery and real Time behavior.
   Formal receipts and rollback releases are retained; the owned temporary
   build directory is classified for removal after the documentation closeout.

## Completion evidence

Require real malformed-DOCX extraction, backend route/contract checks, Web
typechecking, release-policy and documentation checks, independent review and
latest-head repository gates. Preserve the prior resident release for recovery
and verify database migration metadata remains unchanged. Record Vercel quota
failures honestly; the explicit GET-24 exception belongs only to PR218.

## Verified delivery (September 21)

PR [#227](https://github.com/getyak/talent-signal/pull/227) merged normally at
`718e25d95b08a070a29492cea83d3a48ebded43c`, with the same tree as independently
reviewed head `0cad2162446a681a1f808270448a3b5043187eb6`. Exact-head CI35554975031
(including iOS release smoke) and Security35554975040 passed. The actual
talent-signal-web Vercel preview passed. The secondary talent-signal Vercel
project remained quota-failed: it is not a required repository gate for this
separate maintenance PR. An independent applicability review confirmed this
against the active strict-base ruleset and documented CI policy. No admin
bypass was used and PR218's exception was not extended.

PR220's retained Fastify/Mammoth changes and PR221's exact Fastlane patch are
included. Both originals were closed after the replacement merged. PR219 was
automatically superseded by Dependabot; PR226's optional action upgrades were
closed after review. Mixed SDK/Opik upgrades remain deferred pending their own
runtime-proof work, rather than described as accepted by this merge.

Clean backend and Web releases were activated from718e25d9. Independent readback
confirmed the running image, Fastify5.12.5, Mammoth1.12.3, the real Web listener's
release directory and served buildID `dsm6EMoVjbgFXvX8rwCiF`, plus served asset
hashes. All79 migration checksums matched and all79 pre-maintenance rows,
including applied timestamps, were unchanged. Loopback API/internal database
boundaries, existing Serve routes and resident launch agents were preserved.

The full deployment passed Opik write/read/delete, voice no-speech, a real
Relationship Ask, Apple keys and HTTPS checks. Following Web restart, a real
synthetic-account probe passed authentication, protected Time, schedule
create/read/replay, activity projection, reviewed ICS, live provider range review
with exact sources and unconfirmed/no-effect authority, completion, stale
revision denial and deletion redaction. Exact account/row cleanup passed.

Operational receipts are retained under the GET-24 implementation-evidence
directory's dependency-maintenance folder. Previous resident releases and the
macOS app backup remain available for recovery. No manual Apple release or
system Calendar import was performed; repository-triggered release automation
is tracked separately from this local delivery proof.
