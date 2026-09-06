# Web Lab batch and regression review

## Outcome

The authenticated Web Lab now operates the same durable relationship-text
batch and regression control plane as iOS. A reviewer can freeze synthetic
cases, compare exactly two admitted model/prompt configurations, set repeats
and the provider-call ceiling, leave the page while the server owns execution,
recover the same job, inspect every attempt, stop unissued calls, save a typed
human review, preserve a failed attempt as an immutable regression, and rerun
that frozen case.

The UI keeps structural checks, semantic uncertainty, human preference and
release evidence separate. It always exposes zero business writes and unknown
cost rather than estimating either. A saved regression is labeled `未接入 CI`
and its detail says that saving does not mean the release gate ran.

## Real browser and backend proof

A disposable PostgreSQL 18 database was migrated through 045 and seeded only
with repository synthetic identities. The real Fastify job worker and Web API
routes ran behind a Next.js development server. The provider adapter used the
owned deterministic fetch fixture; 11 fixture requests and zero external model
requests were made.

Four browser-created jobs cover the lifecycle:

| Job | State | Observable evidence |
| --- | --- | --- |
| `d915a641` | completed | Three cases, six completed attempts, actual model/prompt revisions, tokens and checks; persisted `tie` review |
| `a1717312` | partial | One completed attempt and one controlled provider failure; the hard failure remains visible beside the successful output; persisted preference for B and `provider_failure` |
| `5da7645b` | completed | Frozen regression rerun with two completed attempts |
| `bfb4f948` | cancelled | One started/completed attempt and one cancelled-before-dispatch attempt; the UI truthfully reports 1/2 issued |

The failed attempt became regression `e44722f4`, content hash
`8fe6dd09676f975bba76385f036330d999ded8b7596ec68070c45af63064be44`.
The readback retains its synthetic case, configurations, failure category,
source execution, expected behavior, backend/instrument revisions and one
rerun. [Browser proof](browser-proof.json) records the bounded results.

Desktop evidence shows the [hard failure beside its comparison](hard-failure-desktop.jpg),
the [cancelled job with retained work](cancelled-batch-desktop.jpg), and the
[saved regression with one rerun](regression-detail-desktop.jpg). Mobile Chrome
at 390 × 844 and DPR 2 shows the [batch setup](mobile-batch.jpg) and
[regression detail](mobile-regression.jpg) with no horizontal overflow.

## Corrections found through the real surface

The first browser run exposed three defects that isolated unit checks did not:

- the one-based backend repetition was displayed as run 2; the shared contract
  now requires a minimum of 1 and the Web label uses the stored number;
- cancelled-before-dispatch attempts were counted as issued calls; progress now
  derives issued count from `started_at`;
- a finished regression rerun left the open detail at zero until another click;
  terminal job polling now reloads the selected regression.

The first 390-pixel render also showed the floating Lab capsule across the page
title. At mobile widths it is now a compact `LAB` control integrated between
the workspace mark and account controls in the sticky header.

## Validation and boundaries

- Web: 53 test files passed, 1 skipped; 318 tests passed, 1 skipped.
- Web TypeScript and ESLint passed.
- The configured production build compiled, typechecked and generated all 32
  pages, including all new Lab routes. The build used the same synthetic
  build-only `AUTH_SECRET` convention as CI.
- Backend TypeScript covers the deterministic proof control; existing durable
  job/regression services, account isolation and CI provenance remain the
  server authorities.
- Screens contain repository synthetic cases. They establish product behavior
  and layout, not model quality or candidate outcome improvement.
- No candidate data, external provider request, product-system write,
  deployment, TestFlight action or hosted CI execution occurred.

The owned Next.js server, Fastify server, headless Chrome process, disposable
database and their listening ports were removed after evidence capture.
