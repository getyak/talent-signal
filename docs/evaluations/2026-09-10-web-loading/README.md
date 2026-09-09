# GET-25 Web loading evidence

## Result

The authenticated workspace no longer waits for the Lab control plane before
sending product HTML. Capture editing and Lab dialogs load on demand; the shared
Lab provider remains mounted across workspace navigation. Phosphor client and
SSR imports are explicitly optimized. Decoded backend claims are memoized only
within a React server request, with expiry still checked at client use time.

## Reproduce

From the repository root, run:

```sh
AUTH_SECRET=get25-synthetic-performance-secret pnpm build
node apps/web/scripts/measure-loading.mjs --assert
```

The probe starts production Next and a synthetic backend on ephemeral loopback
ports, creates synthetic signed cookies, and closes both servers. It sends no
candidate data and requires no production credentials. Missing-build startup
failure was also exercised and exits nonzero without leaving the probe running.

## Observations

Baseline is remote-main commit `56292d3c`; both runs use Next.js 16.3.4 and the
same production HTTP probe with an artificial 2,000 ms Lab delay.

| Metric | Baseline | Optimized |
| --- | ---: | ---: |
| Cold process request TTFB | 2,725 ms | 486 ms |
| Warm request TTFB, two samples | 2,035 / 2,046 ms | 12 / 12 ms |
| Warm complete HTML | 2,038 / 2,053 ms | 17 / 18 ms |
| Initial script bytes | 725,929 | 659,534 |
| Initial script gzip bytes | 224,310 | 204,770 |
| Initial script files | 12 | 11 |
| Product SSR Lab reads | 1 | 0 |

Raw results: [baseline](baseline.json), [optimized](optimized.json).
The gzip reduction is 8.7%. These are local, synthetic HTTP observations on a
busy developer machine, not browser LCP/INP, field telemetry, network transfer
guarantees, or a universal speedup. Compilation timing is not compared because
the second build benefits from build caches. Browser automation was unavailable,
so hydrated dialog interaction and keyboard focus have no browser proof here.

## Cache and correctness checks

- A changed backend person label appears on the next request; the old label is
  absent. A second account sees only its own synthetic label.
- Unauthenticated requests redirect to login. Expired credentials disclose no
  person record and expose the existing login recovery path.
- Private HTML retains `private, no-cache, no-store, max-age=0, must-revalidate`.
  Fingerprinted Next assets retain `public, max-age=31536000, immutable`.
- No persistent evidence cache, cached API response, global backend client/token,
  or service worker was added. No new approval or external-write path exists.
- Web tests: 61 files passed, 1 file skipped; 361 tests passed, 1 skipped. The
  four new focused loading/identity tests also passed separately. Lint, production
  build/type validation, and documentation checks passed.
- Independent review found no P0/P1. Its P2 startup-cleanup finding was fixed by
  subscribing to process exit before startup and verified with a missing build.

## Source rationale

[React cache](https://react.dev/reference/react/cache#caveats) defines request
scope, rather than a persistent authorization cache.
[Next lazy loading](https://nextjs.org/docs/app/guides/lazy-loading#nextdynamic)
supports conditional client component imports. The installed
[optimized-import reference](https://nextjs.org/docs/app/api-reference/config/next-config-js/optimizePackageImports)
does not include Phosphor in the default package list.

## Delivery boundary

The original checkout and concurrent tasks were preserved. Detailed GET-25
Linear readback and browser verification were unavailable during implementation;
the issue must not be marked complete without checking any additional acceptance
criteria and confirming the merged delivery.
