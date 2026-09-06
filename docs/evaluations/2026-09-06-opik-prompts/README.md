# Opik prompt management integration

> Historical implementation evidence. The owner has superseded live prompt
> retrieval with [bundled source releases](../../operations/opik-prompts.md).

## Delivered outcome

Ten server prompts are managed in the local Opik 2.2.45 Prompt Library under
`talent-signal-prompts`. The application resolves the version assigned to
`production`; normal edits do not require a code deployment. General dialogue
guidance now follows the user's current intent rather than leading with a
recruiting-specific role. See [operations](../../operations/opik-prompts.md).

The previous source-only management decision is superseded. Prompts in the
Agent package are bootstrap and cold-start fallbacks. The runtime adapter uses
the verified Opik REST contract without adding an observability SDK or exporting
model inputs. Existing tool, schema, authorization and evidence boundaries remain.

## Direct evidence

- [Library receipt](library.json): ten initial versions published and read back.
- [Actual UI](library.png): all ten prompts appear in the owner's Prompt Library.
- [Publish and rollback](publish-rollback.json): a new version was created through
  the Opik editor; the published version remained v1 until explicitly promoted.
  The actual application adapter called GLM-5.3 and returned the synthetic marker
  from v2. Production was then restored to v1 and read back without that marker.
- [Deployment receipt](deployment.json): live API and Agent Host resolve Opik
  versions over the dedicated internal network. The TestFlight deployment script
  completed its health, remote model, voice and authentication probes.

The unpublished `assistant/conversation` v2 is retained as verification history.
It is not the production version. No private conversations or screenshots were
used in this proof, and no application model key was copied into Opik.

## Verification

| Check | Result |
| --- | --- |
| Agent package | 67 tests passed, including registry publication, cache, timeout, recovery and incompatible-version cases |
| Backend adapters and Lab | 58 tests passed, including exact managed prompt dispatch and frozen trial revisions |
| Pursuit execution | 13 tests passed |
| Web extraction | 15 tests passed, including cancellation before and during provider dispatch |
| Disposable PostgreSQL contact integration | 7 tests passed with real Opik prompt retrieval |
| Build/type checks | Agent, backend and Agent Host builds; backend and Web type checks passed |
| Changed Web files | ESLint passed |
| Wiki | 8 tests passed |
| Documentation | Canonical documentation, wiki consistency and architecture diagrams passed |

The initial database run overlapped the Docker image build and four cases exceeded
the default five-second test timeout. The unchanged assertions were rerun with a
30-second harness limit and all seven completed in under one second of test time.
No product execution budget was increased.

The broader Infisical source inventory check reports twelve pre-existing names
outside its manifest: ten evaluation-only database/token names plus `GOOGLE_SECRET`
and `NEXTAUTH_SECRET`. The new registry settings are declared. Five other Infisical
manifest/launcher checks pass; no unrelated inventory entries were added or hidden.

## Deployment and scope

Docker Hub's base-image metadata request failed with EOF. The lockfile and all
seven existing runtime dependency declarations matched the deployed image, so
the source was rebuilt over that immutable image using the local Docker engine.
The original TestFlight deployment script then completed with image reuse.
Rollback image: `talent-signal-backend-local:pre-opik-20260906`.

Opik has durable named volumes, pinned image digests, restart policies and a
loopback UI. Only its frontend proxy shares a dedicated network with the two
application services. A stopped registry leaves application fallback available.
Static configuration is the only data sent by the prompt reader; exact version
IDs and hashes are retained without logging model input or template text.

Contact tasks persist the selected transcription/filing prompts, including across
resume. Pursuit tasks preserve their prompt in the semantic snapshot. Lab batches
and single experiments use frozen versions. Normal model answers record their
actual prompt revision, and the unscoped Agent returns a prompt reference for its
audit record.

Native offline Foundation Models prompts still ship with the iOS binary. Web
server source is integrated and its next Infisical-backed process start receives
the registry settings; the live deployment verified here is the TestFlight API
and Agent Host. Opik's Python evaluation/optimization workers and Playground model
connections are outside this prompt-library installation.

Temporary database state was task-owned and removed after verification. Detailed
command logs and the isolated source-build context are local `/tmp/ts-opik-*`
artifacts; the persistent Opik volumes and rollback image are intentional.
