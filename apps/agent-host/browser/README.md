# Isolated public browser worker

This is a trusted Playwright driver for the shared Harness's
`browse_contact_source` tool. Production admission remains pending GET-9 review,
real product verification and deployment. A successful image build is not admission.

Build this directory with Docker, inspect the resulting immutable local image ID,
and set `TALENT_SIGNAL_BROWSER_IMAGE=sha256:<image-id>` in the **agent-host**
service environment. The backend uses its existing private research Unix socket.
Mutable tags are refused at execution; runtime cannot pull an image. The image
pins Playwright1.63.0 and the multi-platform upstream image digest. It contains no
SDK, API secrets or product data.

Each call creates a new non-persistent Chromium context in a fresh `pwuser`
container: no host mounts, network none, read-only root, all capabilities dropped,
no-new-privileges, two CPUs,768MiB memory,256PIDs,128MiB shared memory and256MiB
temporary storage. Chromium's separate renderer sandbox is disabled; the Docker
container is the OS boundary. Do not run `worker.mjs` directly on a credentialed host.

The host resolves only task-discovered public HTTPS sources. The browser receives
only a public URL and brokered public response bodies. Every broker request uses
the same origin, pinned public DNS, robots checks and anonymous GET. Cookies,
request bodies and browser headers never reach the network. WebSockets, private
addresses, foreign origins, child-frame navigation, forms and downloads are not
admitted. Public pages and their scripts remain untrusted evidence.

Limits per call:40 browser resource requests,6 concurrent broker operations,
80 total HTTP requests including robots/redirects,8MB consumed response-body
budget,1MB per resource,200kB per robots file,16k characters of rendered text.
The byte budget rejects the chunk that crosses its threshold and stops further
dispatch; it is not an exact bound on TCP/header bytes already in flight. The
host has a30-second execution deadline and the worker25seconds; startup orphan
inspection and verified cleanup occur outside those deadlines. DNS and resource
waiting respond to cancellation. DOM rendering waits at most two additional
seconds for idle; this is a bounded snapshot, not proof every dynamic resource loaded.

Top-level same-origin HTTP redirects re-enter as fresh browser pages, with up to
three hops. This avoids an intercepted redirect becoming an unmediated browser
request or an error-page navigation race. Subresource redirects are refused and
counted as blocked. The rendered source records initial/final URLs, discovery
source, browser version, time, content hash and both resource/HTTP counters.
Blocked resources can leave a page incomplete. No browser action grants contact
identity, confirmed facts or execution authority.

Normal disposal uses automatic removal plus a verified explicit cleanup path.
Containers carry purpose, host/user owner, PID and process-instance labels.
Startup removes only containers belonging to an abandoned local owner process;
it preserves foreign owners and live instances. An unverified cleanup fails
further admission closed in that service process. Docker daemon errors are not
treated as verified absence.

Run `scripts/evals/evaluate-isolated-browser.mjs IMAGE_ID OUTPUT.json` after
building agent-host. It distinguishes synthetic broker tests from a live public
HTTPS page. `evaluate-browser-product.mjs DATABASE_URL IMAGE_ID OUTPUT.json`
adds real SDK, product HTTP, Unix socket and PostgreSQL; its search discovery is
controlled and is not an Exa network test.
`evaluate-browser-recovery.mjs IMAGE_ID OUTPUT.json` exercises runaway page
JavaScript, request exhaustion and fresh-run admission after verified cleanup.
Request exhaustion closes Chromium before reporting a terminal failure; it
must never be returned as a truncated success with inconsistent counters.

Sources: [Playwright Docker guidance](https://playwright.dev/docs/docker),
[browser contexts and network routing](https://playwright.dev/docs/api/class-browsercontext),
[service-worker interception limits](https://playwright.dev/docs/service-workers).
