# Bundled prompt delivery verification

## Result

Formal prompts are now ten independent TypeScript source files, compiled with
the application and captured as immutable local snapshots. The exact prompt
texts are unchanged from the preceding release. There is no remote registry
reader, cache expiration, timeout or environment-selected runtime mode.

Opik mirrors the source under a `repository` label. It supports draft editing
and explicit import, while application behavior changes through a build and
release. [Operations](../../operations/opik-prompts.md) is the authoritative
workflow; [ADR 0013](../../decisions/0013-bundle-prompts-with-code.md) records why.

## Evidence

- [Version receipt](bundled-versions.json): all ten mirrored versions match exact
  source hashes. A second sync reused the same version IDs. Git dirty state is
  explicitly recorded; these are not presented as committed changes.
- [Actual draft import](bundled-import.json): imported the earlier synthetic v2
  into its source file, verified the compiled runtime remained unchanged, then
  restored v1 with byte-identical source. Repeating the import made no change.
- The loader test imports and resolves every prompt with network calls replaced
  by a throwing function and an unreachable legacy registry configured. No
  network call occurs. Changing the old URL afterward cannot change snapshots.

The CLI preserves arbitrary literal text, including backticks, interpolation
syntax, Unicode and CRLF. The initial CRLF test exposed JavaScript template
literal newline normalization; encoding carriage returns fixed the exact-content
round trip. It rejects incompatible templates and concurrent source edits.

The first mirror attempt identified a missing `repository` environment. Sync
now creates it before version binding. The failed attempt's version is retained
as normal version history; no formal source or application behavior changed.
Existing environment labels on reused versions are preserved.

## Focused checks

| Check | Result |
| --- | --- |
| Agent | 57 tests passed, including offline snapshot loading |
| Backend and Lab | 71 tests passed across six suites |
| Web extraction | 12 tests passed across three suites; Web type check passed |
| Prompt tooling | 5 tests passed for import fidelity, concurrent edits, compatibility, version mirroring and failures |
| Compilation | Agent, backend and Agent Host builds passed |
| Wiki | 8 tests passed |

Documentation and architecture checks passed. No model or conversation content
is sent to Opik by prompt tooling.
Existing task snapshots are retained rather than rewritten. Appended output
protocols, tool authorization and source/evidence validation are unchanged.

## Deployment

The normal build encountered Docker Hub metadata EOF. All seven dependency
manifests and the lockfile matched the running image. A source-only context was
prepared over that verified image. Compilation inside Docker was OOM-killed
(exit 137), so the backend and Agent Host were rebuilt successfully on the Mac
and their compiled artifacts packaged into the unchanged dependency image.
Sources were verified against the frozen build context. This preserves the rollback tag
`talent-signal-backend-local:pre-bundled-prompts-20260906`.

The API and Agent Host no longer receive Opik configuration or join its network.
The old runtime environment selector was removed from dev/staging Infisical;
management URL/project settings remain available to explicit developer commands.
Native offline prompts remain bundled with iOS. No new iOS build is required for
this backend behavior change. Web source shares the same local loader; the live
service deployment verified here covers TestFlight API and Agent Host.

The original TestFlight deployment script completed successfully with image
reuse. Its actual model, silent voice, Apple authentication and HTTPS probes
passed. [Deployment receipt](bundled-deployment.json) verifies 335 source/compiled
files, the API and Agent Host image identity, and absence of Opik environment
settings or network membership. An isolated container with networking disabled
loaded all ten prompts and made zero fetch calls despite a legacy registry URL.
The running API's readiness endpoint reports ready.

The obsolete shared Docker network and the task-owned failed build container
were removed. During frontend network cleanup, Opik's pre-existing unhealthy
backend reported ClickHouse connection-pool timeouts and blocked dependency startup; restarting the Opik
backend restored health. All seven long-running Opik services are healthy, and
the actual `pnpm prompts:status` and no-op import wrapper commands passed after
recovery. The persisted library and version IDs were preserved.
