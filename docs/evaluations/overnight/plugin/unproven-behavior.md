# Exact unproven behavior

The frozen repository-local plugin proves only its declared deterministic
surface on synthetic inputs. The following behavior is not proven:

- **Installed model invocation:** the plugin was not installed by request.
  There is no observation that an installed Codex model will invoke the Skill,
  pass supplied content over standard input, or return the analyzer packet
  unchanged.
- **Free-form language generalization:** the analyzer passed the eight frozen
  English cases. It has no held-out paraphrase, language, platform, or field
  sample, so extraction precision, recall, calibration, and abstention coverage
  are unknown outside those cases.
- **Model compliance with safe stopping:** no installed-model repeat or blind
  test proves that the model will refuse to improvise an unsupported fact when
  the deterministic analyzer abstains.
- **Host privacy lifecycle:** plugin-local code has no retrieval or external
  write capability, but Codex host retention, deletion, export, analytics, and
  derived-artifact behavior were not exercised.
- **Authorization truth:** the analyzer deterministically rejects a missing or
  invalid authorization declaration. It cannot independently prove that a
  caller correctly labeled already-available content as user-authorized.
- **OCR and screenshot interpretation:** no screenshot, OCR, layout, speaker
  side, bounding box, confidence, or image-deletion path exists in this slice.
- **Production behavior and field value:** no real candidate data, recruiter
  study, production tenant, connector, destination, or consequential effect was
  used. The run proves neither recruiter value nor privacy compliance.
- **Candidate assessment:** no evidence supports candidate quality, fit,
  personality, potential, protected traits, or acceptance probability. Those
  outputs are prohibited and TS-BOUND-01 confirms only that the frozen request
  is blocked.

Integration should install commit `3a90594`, run a blind TS-CORE-01 invocation,
then test synthetic host retention/deletion and an independently authored
held-out boundary set before allowing real candidate content.
