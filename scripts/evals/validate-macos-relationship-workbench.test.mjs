import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { evaluateMacosArtifact } from './validate-macos-relationship-workbench.mjs'

const REQUIREMENTS = JSON.parse(readFileSync(new URL(
  '../../docs/evaluations/2026-08-31-macos-relationship-workbench/requirement-manifest.v1.json',
  import.meta.url,
), 'utf8'))

function digest(content) {
  return createHash('sha256').update(content).digest('hex')
}

function createPassingFixture() {
  const root = mkdtempSync(join(tmpdir(), 'ts-macos-eval-'))
  const artifactIdentity = {
    id: 'TS-MACOS-TEST-BUILD',
    type: 'native-macos-build',
    version: '1.0.0-test',
    build: '42',
    commit: '0123456789abcdef0123456789abcdef01234567',
    sha256: 'a'.repeat(64),
    environment: 'macOS test host; synthetic fixtures',
    target_user: 'Independent recruiter',
    freeze_status: 'frozen',
  }
  const evidence = []
  const evidenceIdByKind = new Map()
  for (const kind of REQUIREMENTS.evidence_policy.allowed_kinds.filter((item) => item !== 'review_packet')) {
    const id = `proof-${kind}`
    const path = `${id}.txt`
    const content = `deterministic ${kind} proof\n`
    writeFileSync(join(root, path), content)
    evidence.push({ id, kind, path, sha256: digest(content), description: content.trim() })
    evidenceIdByKind.set(kind, id)
  }

  const allProofIds = [...evidenceIdByKind.values()]
  const reviews = []
  for (const [index, category] of ['product_experience', 'user_experience', 'technical_experience', 'gate_audit'].entries()) {
    const reviewedRequirementIds = category === 'gate_audit'
      ? REQUIREMENTS.requirements.filter((requirement) => requirement.release_gate).map((requirement) => requirement.id)
      : REQUIREMENTS.requirements.filter((requirement) => requirement.category === category).map((requirement) => requirement.id)
    const reviewerId = `independent-reviewer-${index + 1}`
    const packet = {
      contract_version: 'ts-macos-independent-review.v1',
      artifact: {
        id: artifactIdentity.id,
        version: artifactIdentity.version,
        sha256: artifactIdentity.sha256,
      },
      requirements_manifest: {
        id: REQUIREMENTS.manifest_id,
        version: REQUIREMENTS.version,
      },
      category,
      reviewer_id: reviewerId,
      verdict: 'pass',
      reviewed_requirement_ids: reviewedRequirementIds,
      veto_categories: category === 'gate_audit' ? REQUIREMENTS.veto_categories : [],
      evidence_ids: allProofIds,
    }
    const content = `${JSON.stringify(packet, null, 2)}\n`
    const id = `review-${category}`
    const path = `${id}.json`
    writeFileSync(join(root, path), content)
    evidence.push({ id, kind: 'review_packet', path, sha256: digest(content), description: `${category} packet` })
    evidenceIdByKind.set(`review_packet:${category}`, id)
    reviews.push({ category, reviewer_id: reviewerId, packet_evidence_id: id })
  }

  const evidenceIdsFor = (kinds, category = 'gate_audit') => kinds.map((kind) => (
    kind === 'review_packet'
      ? evidenceIdByKind.get(`review_packet:${category}`)
      : evidenceIdByKind.get(kind)
  ))

  return {
    root,
    artifact: {
      contract_version: 'ts-macos-artifact-evaluation.v1',
      artifact: artifactIdentity,
      requirements_manifest: { id: REQUIREMENTS.manifest_id, version: REQUIREMENTS.version },
      evidence,
      requirement_results: REQUIREMENTS.requirements.map((requirement) => ({
        requirement_id: requirement.id,
        status: 'pass',
        evidence_ids: evidenceIdsFor(requirement.required_evidence_kinds, requirement.category),
      })),
      scenario_results: REQUIREMENTS.scenarios.map((scenario) => ({
        scenario_id: scenario.id,
        status: 'pass',
        evidence_ids: evidenceIdsFor(scenario.required_evidence_kinds),
      })),
      veto_audits: REQUIREMENTS.veto_categories.map((category) => ({
        category,
        status: 'clear',
        reviewer_id: 'independent-reviewer-4',
        evidence_ids: evidenceIdsFor(REQUIREMENTS.veto_audit_contracts[category].required_evidence_kinds),
      })),
      independent_reviews: reviews,
    },
  }
}

function withFixture(run) {
  const fixture = createPassingFixture()
  try {
    return run(fixture)
  } finally {
    rmSync(fixture.root, { recursive: true, force: true })
  }
}

test('passes only when all three categories, scenarios, reviews, and veto gates pass', () => {
  withFixture(({ root, artifact }) => {
    const result = evaluateMacosArtifact({
      requirementManifest: REQUIREMENTS,
      artifactManifest: artifact,
      repositoryRoot: root,
    })
    assert.equal(result.decision, 'release_pass')
    assert.equal(result.release_ready, true)
    assert.deepEqual(
      Object.fromEntries(Object.entries(result.category_scores).map(([category, score]) => [category, score.score])),
      { product_experience: 100, user_experience: 100, technical_experience: 100 },
    )
    assert.equal('overall_score' in result, false)
  })
})

test('does not average a sub-95 category into a release pass', () => {
  withFixture(({ root, artifact }) => {
    const userResult = artifact.requirement_results.find((result) => result.requirement_id === 'MAC-UX-011')
    userResult.status = 'fail'
    userResult.evidence_ids = []
    const result = evaluateMacosArtifact({
      requirementManifest: REQUIREMENTS,
      artifactManifest: artifact,
      repositoryRoot: root,
    })
    assert.equal(result.category_scores.product_experience.score, 100)
    assert.equal(result.category_scores.user_experience.score, 94)
    assert.equal(result.category_scores.technical_experience.score, 100)
    assert.equal(result.release_ready, false)
    assert.match(result.release_blockers.join('\n'), /user_experience score 94 is below 95/)
  })
})

test('an active veto blocks a 100/100/100 artifact', () => {
  withFixture(({ root, artifact }) => {
    artifact.veto_audits.find((audit) => audit.category === 'privacy').status = 'active'
    const result = evaluateMacosArtifact({
      requirementManifest: REQUIREMENTS,
      artifactManifest: artifact,
      repositoryRoot: root,
    })
    assert.deepEqual(
      Object.values(result.category_scores).map((score) => score.score),
      [100, 100, 100],
    )
    assert.equal(result.release_ready, false)
    assert.match(result.release_blockers.join('\n'), /privacy veto audit is active/)
  })
})

test('a declared pass with a missing evidence file remains unproven', () => {
  withFixture(({ root, artifact }) => {
    const screenshot = artifact.evidence.find((item) => item.kind === 'screenshot')
    rmSync(join(root, screenshot.path))
    const result = evaluateMacosArtifact({
      requirementManifest: REQUIREMENTS,
      artifactManifest: artifact,
      repositoryRoot: root,
    })
    const affected = result.requirement_results.filter((item) => item.evidence_ids.includes(screenshot.id))
    assert.ok(affected.length > 0)
    assert.ok(affected.every((item) => item.effective_status === 'unproven'))
    assert.equal(result.release_ready, false)
  })
})

