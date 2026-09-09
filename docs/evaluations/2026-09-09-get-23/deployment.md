# GET-23 deployment acceptance

- Shared TestFlight backend now runs `cd402c9897e89cb334656dba184084a3470c9c9c` from the isolated release integration, using image `talent-signal-get23-backend:cd402c98`. The integration preserves deployed account-management commit `90763636` from draft PR #169 and merged GET-25 loading improvements.
- Readback confirmed `058_account_management`, `058_product_run_monitor`, and unchanged `059_lab_account_cleanup` with their exact checksums. Readiness reports `058_product_run_monitor`.
- Deployment script completed successfully: Apple authentication, real voice provider and `zhipu-chat-completions/glm-5.3` Relationship Ask probes passed; API and research service are healthy behind the existing tailnet endpoint.
- Browser acceptance against the deployed backend used a newly created GET-23 Acceptance account and explicitly synthetic source. Three actual GLM-5.3 calls are visible together as helpful 1 / unhelpful 1 / unrated 1. The negative rating includes a note identifying it as a workflow test, not a model-quality verdict. The monitor read back the exact answer, GLM model and nested execution spans, and both versions of the negative feedback.
- Live local Web entry: http://localhost:3346/workspace/monitor. The public Vercel site still has its pre-existing unopened workspace login configuration; this change does not claim public account access is enabled.
- Latest PR CI has passed backend, Web, Eval/control-plane, repository/docs and security checks. iOS release smoke is still running; PR merge and TestFlight completion remain pending.

## Evidence

- [Real-provider monitor screenshot](web-live-provider-monitor.jpg)
- [Owned acceptance account run readback](live-run-readback.json)

The screenshot and run IDs use deliberately synthetic acceptance data. The actual model calls and feedback persistence ran against the deployed TestFlight backend. Prior native iOS click evidence remains in [the implementation plan](plan.md).

## Native cross-platform acceptance

A dedicated iOS Simulator signed into the same real backend acceptance account using the normal email/password screen. It read the Web-created synthetic person and made native Relationship Ask requests. The monitor recorded iOS as the source platform before any feedback. Native helpful, changed-to-unhelpful, and optional-note saves produced three preserved versions; reopening the native form and reading the Web monitor returned the exact saved note. A separate completed native answer was left unrated. The final six-run readback includes three Web and three iOS runs, including an earlier native run whose source-readback recovery stopped before showing its answer.

- [Native saved-note readback](ios-live-provider-note.jpg)
- [Same-page cross-platform history](web-live-cross-platform.jpg)

Existing source-flow limitation observed during acceptance: direct Web notes can be marked reviewed without an explicit review receipt; native Ask demanded that receipt. The normal evidence-review API completed the synthetic fixture review. Retrying the old invalidated request then returned `IDEMPOTENCY_STATE_UNAVAILABLE`; a fresh question succeeded. This source-review recovery behavior is not changed by GET-23 and must not be mistaken for a successful original retry. No real candidate source or user account was altered.

## Live feedback-to-evaluation replay

The monitor saved native source run `542893c3-1e5c-76b4-a17e-d2b015614fee` as regression `bff7dbeb-0e58-4e8b-a4af-ed64c10c0093`, then opened that exact frozen case in the existing Lab. Job `6a20900f-7b17-4d92-9475-7f4851938843` completed two real GLM-5.3 requests using baseline and concise prompt configurations. Both passed execution/contract checks; semantic checks remain unknown and the job remains `needs_review`. No human comparison was fabricated.

Agent observation, not a human verdict: the baseline answer asks for both the time and meeting method, while the concise answer asks only for the time. The latter omits one explicit expected item. This illustrates an inspectable prompt difference, not proof of a general model improvement.

- [Exact replay results and provider request IDs](live-lab-replay.json)
- [Actual A/B comparison](live-lab-comparison.jpg)
