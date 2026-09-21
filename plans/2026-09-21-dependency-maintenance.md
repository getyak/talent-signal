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
3. **Active:** open the consolidated maintenance PR and pass latest-head
   repository CI/security, then merge and verify main; close replaced PRs with
   links and explicit reasons.
4. **Pending:** deploy the approved dependency revision, read back versions and
   required runtime behavior, then remove only owned temporary artifacts.

## Completion evidence

Require real malformed-DOCX extraction, backend route/contract checks, Web
typechecking, release-policy and documentation checks, independent review and
latest-head repository gates. Preserve the prior resident release for recovery
and verify database migration metadata remains unchanged. Record Vercel quota
failures honestly; the explicit GET-24 exception belongs only to PR218.

Operational receipts are held under the GET-24 implementation-evidence artifact
directory for this task. This plan remains active until the replacement PR and
resident readback actually finish.
