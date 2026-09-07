# Evaluation integration contracts

- [Independent phase one controller](phase-one-controller.md): executable
  fixture, frozen study, budgeted semantic evaluation, source lifecycle,
  signed CI/release evidence, rehearsal and authenticated runtime readback.
- [`runtime-observation.v1.schema.json`](runtime-observation.v1.schema.json):
  private observation envelope shared across runtime/export boundaries.
- [`create-phase-one-fixture.mjs`](create-phase-one-fixture.mjs): creates a new
  protected synthetic controller directory with local signing keys. It does
  not authorize paid calls or release.
