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
