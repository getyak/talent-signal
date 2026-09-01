#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const EXPERIENCE_CATEGORIES = [
  'product_experience',
  'user_experience',
  'technical_experience',
]

const REQUIRED_SCENARIOS = [
  'TS-CORE-01',
  'TS-CORE-02',
  'TS-CORE-03',
  'TS-CORE-06',
  'TS-ID-01',
  'TS-ID-04',
  'TS-ACT-01',
  'TS-ACT-03',
  'TS-ACT-04',
  'TS-BOUND-01',
  'TS-MAC-UX-01',
  'TS-MAC-UX-02',
  'TS-MAC-UX-03',
  'TS-MAC-UX-04',
  'TS-MAC-UX-05',
]

const REQUIRED_VETO_CATEGORIES = [
  'safety',
  'privacy',
  'identity',
  'external_effect',
  'accessibility',
]

const REQUIRED_REVIEWS = [
  'product_experience',
  'user_experience',
  'technical_experience',
  'gate_audit',
]

const VALID_RESULT_STATUSES = new Set(['pass', 'fail', 'unproven'])
const VALID_VETO_STATUSES = new Set(['clear', 'active', 'unproven'])
const VALID_REVIEW_VERDICTS = new Set(['pass', 'fail', 'abstain'])

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function unique(values) {
  return new Set(values).size === values.length
}

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function hasSha256(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function setEquals(left, right) {
  const leftSet = new Set(left)
  const rightSet = new Set(right)
  return leftSet.size === rightSet.size && [...leftSet].every((item) => rightSet.has(item))
}

function missingValues(actual, required) {
  const actualSet = new Set(actual)
  return required.filter((item) => !actualSet.has(item))
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

export function validateRequirementManifest(manifest) {
  const errors = []

  if (!isRecord(manifest)) {
    return ['Requirement manifest must be a JSON object.']
  }

  if (manifest.contract_version !== 'ts-macos-requirements.v1') {
    errors.push('Requirement manifest contract_version must be ts-macos-requirements.v1.')
  }
  if (!isNonEmptyString(manifest.manifest_id)) {
    errors.push('Requirement manifest manifest_id must be non-empty.')
  }
  if (!Number.isInteger(manifest.version) || manifest.version < 1) {
    errors.push('Requirement manifest version must be a positive integer.')
  }
  if (!isNonEmptyString(manifest.prd_path)) {
    errors.push('Requirement manifest prd_path must be non-empty.')
  }

  const thresholds = isRecord(manifest.thresholds) ? manifest.thresholds : {}
  for (const category of EXPERIENCE_CATEGORIES) {
    if (thresholds[category] !== 95) {
      errors.push(`Threshold ${category} must be exactly 95.`)
    }
  }

  if (!setEquals(asArray(manifest.veto_categories), REQUIRED_VETO_CATEGORIES)) {
    errors.push(`veto_categories must contain exactly: ${REQUIRED_VETO_CATEGORIES.join(', ')}.`)
  }

  const allowedEvidenceKinds = asArray(manifest.evidence_policy?.allowed_kinds)
  if (allowedEvidenceKinds.length === 0 || !unique(allowedEvidenceKinds)) {
    errors.push('evidence_policy.allowed_kinds must be a non-empty unique list.')
  }

  const requirements = asArray(manifest.requirements)
  const requirementIds = requirements.map((requirement) => requirement?.id)
  if (requirements.length === 0) {
    errors.push('Requirement manifest must define requirements.')
  }
  if (!unique(requirementIds)) {
    errors.push('Requirement ids must be unique.')
  }

  for (const requirement of requirements) {
    if (!isRecord(requirement)) {
      errors.push('Every requirement must be an object.')
      continue
    }
    if (!isNonEmptyString(requirement.id)) {
      errors.push('Every requirement must have a non-empty id.')
    }
    if (!EXPERIENCE_CATEGORIES.includes(requirement.category)) {
      errors.push(`Requirement ${requirement.id ?? '<missing>'} has an invalid category.`)
    }
    if (!Number.isInteger(requirement.weight) || requirement.weight <= 0) {
      errors.push(`Requirement ${requirement.id ?? '<missing>'} must have a positive integer weight.`)
    }
    if (!['must', 'should'].includes(requirement.priority)) {
      errors.push(`Requirement ${requirement.id ?? '<missing>'} priority must be must or should.`)
    }
    if (!isNonEmptyString(requirement.statement)) {
      errors.push(`Requirement ${requirement.id ?? '<missing>'} must have an atomic statement.`)
    }
    if (asArray(requirement.source_refs).length === 0) {
      errors.push(`Requirement ${requirement.id ?? '<missing>'} must cite at least one PRD source_ref.`)
    }
    if (asArray(requirement.required_evidence_kinds).length === 0) {
      errors.push(`Requirement ${requirement.id ?? '<missing>'} must define required_evidence_kinds.`)
    }
    for (const kind of asArray(requirement.required_evidence_kinds)) {
      if (!allowedEvidenceKinds.includes(kind)) {
        errors.push(`Requirement ${requirement.id ?? '<missing>'} uses unsupported evidence kind ${kind}.`)
      }
    }
  }

  for (const category of EXPERIENCE_CATEGORIES) {
    const total = requirements
      .filter((requirement) => requirement?.category === category)
      .reduce((sum, requirement) => sum + requirement.weight, 0)
    if (total !== 100) {
      errors.push(`Requirement weights for ${category} must total 100; found ${total}.`)
    }
  }

  const scenarios = asArray(manifest.scenarios)
  const scenarioIds = scenarios.map((scenario) => scenario?.id)
  if (!unique(scenarioIds)) {
    errors.push('Scenario ids must be unique.')
  }
  for (const scenarioId of missingValues(scenarioIds, REQUIRED_SCENARIOS)) {
    errors.push(`Required scenario ${scenarioId} is missing.`)
  }
  for (const scenario of scenarios) {
    if (!isRecord(scenario) || !isNonEmptyString(scenario.id)) {
      errors.push('Every scenario must be an object with a non-empty id.')
      continue
    }
    if (scenario.release_gate !== true) {
      errors.push(`Scenario ${scenario.id} must be a release gate.`)
    }
    if (!isNonEmptyString(scenario.expected_behavior)) {
      errors.push(`Scenario ${scenario.id} must define expected_behavior.`)
    }
    if (asArray(scenario.required_evidence_kinds).length === 0) {
      errors.push(`Scenario ${scenario.id} must define required_evidence_kinds.`)
    }
    for (const kind of asArray(scenario.required_evidence_kinds)) {
      if (!allowedEvidenceKinds.includes(kind)) {
        errors.push(`Scenario ${scenario.id} uses unsupported evidence kind ${kind}.`)
      }
    }
  }

  for (const category of REQUIRED_VETO_CATEGORIES) {
    const contract = manifest.veto_audit_contracts?.[category]
    if (!isRecord(contract) || asArray(contract.required_evidence_kinds).length === 0) {
      errors.push(`Veto audit contract ${category} must define required_evidence_kinds.`)
      continue
    }
    for (const kind of contract.required_evidence_kinds) {
      if (!allowedEvidenceKinds.includes(kind)) {
        errors.push(`Veto audit contract ${category} uses unsupported evidence kind ${kind}.`)
      }
    }
  }

  const reviews = asArray(manifest.required_independent_reviews)
  const reviewCategories = reviews.map((review) => review?.category)
  if (!setEquals(reviewCategories, REQUIRED_REVIEWS)) {
    errors.push(`required_independent_reviews must contain exactly: ${REQUIRED_REVIEWS.join(', ')}.`)
  }

  return errors
}

function validateArtifactShape(artifact, requirementManifest) {
  const errors = []
  if (!isRecord(artifact)) {
    return ['Artifact manifest must be a JSON object.']
  }
  if (artifact.contract_version !== 'ts-macos-artifact-evaluation.v1') {
    errors.push('Artifact manifest contract_version must be ts-macos-artifact-evaluation.v1.')
  }

  if (!isRecord(artifact.artifact) || !isNonEmptyString(artifact.artifact.id)) {
    errors.push('Artifact manifest must name artifact.id.')
  }

  const requirementRef = artifact.requirements_manifest
  if (!isRecord(requirementRef)) {
    errors.push('Artifact manifest must include requirements_manifest.')
  } else {
    if (requirementRef.id !== requirementManifest.manifest_id) {
      errors.push('Artifact requirements_manifest.id does not match the requirement manifest.')
    }
    if (requirementRef.version !== requirementManifest.version) {
      errors.push('Artifact requirements_manifest.version does not match the requirement manifest.')
    }
  }

  const requirementResults = asArray(artifact.requirement_results)
  const resultIds = requirementResults.map((result) => result?.requirement_id)
  if (!unique(resultIds)) {
    errors.push('Artifact requirement_results contains duplicate requirement ids.')
  }
  const knownRequirementIds = new Set(requirementManifest.requirements.map((requirement) => requirement.id))
  for (const result of requirementResults) {
    if (!isRecord(result) || !isNonEmptyString(result.requirement_id)) {
      errors.push('Every requirement result must name requirement_id.')
      continue
    }
    if (!VALID_RESULT_STATUSES.has(result.status)) {
      errors.push(`Requirement result ${result.requirement_id} has an invalid status.`)
    }
    if (!knownRequirementIds.has(result.requirement_id)) {
      errors.push(`Requirement result ${result.requirement_id} is not in the requirement manifest.`)
    }
  }

  const scenarioResults = asArray(artifact.scenario_results)
  const scenarioIds = scenarioResults.map((result) => result?.scenario_id)
  if (!unique(scenarioIds)) {
    errors.push('Artifact scenario_results contains duplicate scenario ids.')
  }
  const knownScenarioIds = new Set(requirementManifest.scenarios.map((scenario) => scenario.id))
  for (const result of scenarioResults) {
    if (!isRecord(result) || !isNonEmptyString(result.scenario_id)) {
      errors.push('Every scenario result must name scenario_id.')
      continue
    }
    if (!VALID_RESULT_STATUSES.has(result.status)) {
      errors.push(`Scenario result ${result.scenario_id} has an invalid status.`)
    }
    if (!knownScenarioIds.has(result.scenario_id)) {
      errors.push(`Scenario result ${result.scenario_id} is not in the requirement manifest.`)
    }
  }

  const vetoAudits = asArray(artifact.veto_audits)
  const vetoCategories = vetoAudits.map((audit) => audit?.category)
  if (!unique(vetoCategories)) {
    errors.push('Artifact veto_audits contains duplicate categories.')
  }
  for (const audit of vetoAudits) {
    if (!isRecord(audit) || !REQUIRED_VETO_CATEGORIES.includes(audit.category)) {
      errors.push('Every veto audit must name a contract veto category.')
      continue
    }
    if (!VALID_VETO_STATUSES.has(audit.status)) {
      errors.push(`Veto audit ${audit.category} has an invalid status.`)
    }
  }

  const reviews = asArray(artifact.independent_reviews)
  const reviewCategories = reviews.map((review) => review?.category)
  if (!unique(reviewCategories)) {
    errors.push('Artifact independent_reviews contains duplicate categories.')
  }
  for (const review of reviews) {
    if (!isRecord(review) || !REQUIRED_REVIEWS.includes(review.category)) {
      errors.push('Every independent review must name a required review category.')
      continue
    }
    if (!isNonEmptyString(review.reviewer_id)) {
      errors.push(`Independent review ${review.category} must name reviewer_id.`)
    }
    if (!isNonEmptyString(review.packet_evidence_id)) {
      errors.push(`Independent review ${review.category} must name packet_evidence_id.`)
    }
  }

  return errors
}

function resolveEvidence(root, evidence, allowedKinds) {
  const failures = []

  if (!isRecord(evidence) || !isNonEmptyString(evidence.id)) {
    return { valid: false, failures: ['Evidence must have a non-empty id.'] }
  }
  if (!isNonEmptyString(evidence.kind)) {
    failures.push(`Evidence ${evidence.id} must name a kind.`)
  } else if (!allowedKinds.includes(evidence.kind)) {
    failures.push(`Evidence ${evidence.id} uses unsupported kind ${evidence.kind}.`)
  }
  if (!isNonEmptyString(evidence.path)) {
    failures.push(`Evidence ${evidence.id} must name a repository-relative path.`)
    return { ...evidence, valid: false, failures }
  }
  if (isAbsolute(evidence.path)) {
    failures.push(`Evidence ${evidence.id} path must be repository-relative.`)
    return { ...evidence, valid: false, failures }
  }

  const absolutePath = resolve(root, evidence.path)
  const relativePath = relative(root, absolutePath)
  if (relativePath === '..' || relativePath.startsWith(`..${sep}`)) {
    failures.push(`Evidence ${evidence.id} resolves outside the repository root.`)
    return { ...evidence, valid: false, failures }
  }
  if (!existsSync(absolutePath)) {
    failures.push(`Evidence ${evidence.id} does not exist at ${evidence.path}.`)
    return { ...evidence, absolutePath, valid: false, failures }
  }

  const realPath = realpathSync(absolutePath)
  const realRelativePath = relative(realpathSync(root), realPath)
  if (realRelativePath === '..' || realRelativePath.startsWith(`..${sep}`)) {
    failures.push(`Evidence ${evidence.id} resolves through a link outside the repository root.`)
  }
  if (!statSync(realPath).isFile() || statSync(realPath).size === 0) {
    failures.push(`Evidence ${evidence.id} must resolve to a non-empty file.`)
  }
  if (!hasSha256(evidence.sha256)) {
    failures.push(`Evidence ${evidence.id} must declare a lowercase SHA-256.`)
  } else if (sha256File(realPath) !== evidence.sha256) {
    failures.push(`Evidence ${evidence.id} SHA-256 does not match ${evidence.path}.`)
  }

  return {
    ...evidence,
    absolutePath: realPath,
    valid: failures.length === 0,
    failures,
  }
}

function assessEvidence(evidenceIds, requiredKinds, evidenceById) {
  const failures = []
  const validEvidence = []

  if (asArray(evidenceIds).length === 0) {
    failures.push('No evidence locators were supplied.')
  }

  for (const evidenceId of asArray(evidenceIds)) {
    const evidence = evidenceById.get(evidenceId)
    if (!evidence) {
      failures.push(`Evidence id ${evidenceId} is not declared in the frozen evidence inventory.`)
      continue
    }
    if (!evidence.valid) {
      failures.push(...evidence.failures)
      continue
    }
    validEvidence.push(evidence)
  }

  const validKinds = new Set(validEvidence.map((evidence) => evidence.kind))
  for (const kind of asArray(requiredKinds)) {
    if (!validKinds.has(kind)) {
      failures.push(`Missing valid ${kind} evidence.`)
    }
  }

  return { valid: failures.length === 0, failures, validEvidence }
}

function effectiveResult(declaredStatus, evidenceAssessment) {
  if (declaredStatus === 'fail') return 'fail'
  if (declaredStatus === 'pass' && evidenceAssessment.valid) return 'pass'
  return 'unproven'
}

function validateReviewPacket(review, packetEvidence, artifact, requirementManifest, evidenceById) {
  const failures = []
  if (!packetEvidence || !packetEvidence.valid) {
    failures.push(`Review packet evidence ${review.packet_evidence_id} is missing or invalid.`)
    return { status: 'unproven', failures }
  }
  if (packetEvidence.kind !== 'review_packet') {
    failures.push(`Review packet evidence ${review.packet_evidence_id} must have kind review_packet.`)
    return { status: 'unproven', failures }
  }

  let packet
  try {
    packet = readJson(packetEvidence.absolutePath)
  } catch (error) {
    failures.push(`Review packet ${packetEvidence.path} is not valid JSON: ${error.message}`)
    return { status: 'unproven', failures }
  }

  if (packet.contract_version !== 'ts-macos-independent-review.v1') {
    failures.push('Review packet contract_version must be ts-macos-independent-review.v1.')
  }
  if (packet.category !== review.category) {
    failures.push('Review packet category does not match its manifest entry.')
  }
  if (packet.reviewer_id !== review.reviewer_id) {
    failures.push('Review packet reviewer_id does not match its manifest entry.')
  }
  if (!VALID_REVIEW_VERDICTS.has(packet.verdict)) {
    failures.push('Review packet verdict must be pass, fail, or abstain.')
  }
  if (packet.artifact?.id !== artifact.artifact.id || packet.artifact?.version !== artifact.artifact.version) {
    failures.push('Review packet does not name the frozen artifact id and version.')
  }
  if (packet.artifact?.sha256 !== artifact.artifact.sha256) {
    failures.push('Review packet artifact SHA-256 does not match the frozen artifact.')
  }
  if (
    packet.requirements_manifest?.id !== requirementManifest.manifest_id ||
    packet.requirements_manifest?.version !== requirementManifest.version
  ) {
    failures.push('Review packet does not name the exact requirement manifest.')
  }

  const expectedRequirementIds = review.category === 'gate_audit'
    ? requirementManifest.requirements.filter((requirement) => requirement.release_gate === true).map((requirement) => requirement.id)
    : requirementManifest.requirements.filter((requirement) => requirement.category === review.category).map((requirement) => requirement.id)
  const reviewedRequirementIds = asArray(packet.reviewed_requirement_ids)
  for (const requirementId of missingValues(reviewedRequirementIds, expectedRequirementIds)) {
    failures.push(`Review packet does not cover requirement ${requirementId}.`)
  }

  for (const evidenceId of asArray(packet.evidence_ids)) {
    if (!evidenceById.get(evidenceId)?.valid) {
      failures.push(`Review packet cites missing or invalid frozen evidence ${evidenceId}.`)
    }
  }
  if (asArray(packet.evidence_ids).length === 0) {
    failures.push('Review packet must cite frozen evidence ids.')
  }

  if (review.category === 'gate_audit') {
    const auditedCategories = asArray(packet.veto_categories)
    for (const vetoCategory of missingValues(auditedCategories, REQUIRED_VETO_CATEGORIES)) {
      failures.push(`Gate audit packet does not cover veto category ${vetoCategory}.`)
    }
  }

  const status = failures.length === 0 && packet.verdict === 'pass'
    ? 'pass'
    : packet.verdict === 'fail'
      ? 'fail'
      : 'unproven'
  return { status, verdict: packet.verdict, failures }
}

export function evaluateMacosArtifact({ requirementManifest, artifactManifest, repositoryRoot }) {
  const requirementErrors = validateRequirementManifest(requirementManifest)
  const artifactErrors = requirementErrors.length === 0
    ? validateArtifactShape(artifactManifest, requirementManifest)
    : []
  const contractErrors = [...requirementErrors, ...artifactErrors]

  if (contractErrors.length > 0) {
    return {
      contract_version: 'ts-macos-validation-result.v1',
      decision: 'invalid_contract',
      release_ready: false,
      contract_errors: contractErrors,
      category_scores: {},
      release_blockers: ['The evaluation contract is invalid.'],
    }
  }

  const root = realpathSync(resolve(repositoryRoot))
  const declaredEvidence = asArray(artifactManifest.evidence)
  const evidenceIds = declaredEvidence.map((evidence) => evidence?.id)
  const evidenceInventoryErrors = unique(evidenceIds) ? [] : ['Evidence ids must be unique.']
  const evidence = declaredEvidence.map((item) => resolveEvidence(
    root,
    item,
    requirementManifest.evidence_policy.allowed_kinds,
  ))
  const evidenceById = new Map(evidence.map((item) => [item.id, item]))
  const resultByRequirementId = new Map(
    asArray(artifactManifest.requirement_results).map((result) => [result.requirement_id, result]),
  )
  const scenarioResultById = new Map(
    asArray(artifactManifest.scenario_results).map((result) => [result.scenario_id, result]),
  )

  const requirementResults = requirementManifest.requirements.map((requirement) => {
    const declared = resultByRequirementId.get(requirement.id)
    const declaredStatus = declared?.status ?? 'unproven'
    const evidenceAssessment = assessEvidence(
      declared?.evidence_ids,
      requirement.required_evidence_kinds,
      evidenceById,
    )
    const status = effectiveResult(declaredStatus, evidenceAssessment)
    return {
      requirement_id: requirement.id,
      category: requirement.category,
      weight: requirement.weight,
      release_gate: requirement.release_gate === true,
      declared_status: declaredStatus,
      effective_status: status,
      evidence_ids: asArray(declared?.evidence_ids),
      failures: status === 'pass' ? [] : evidenceAssessment.failures,
    }
  })

  const categoryScores = Object.fromEntries(EXPERIENCE_CATEGORIES.map((category) => {
    const score = requirementResults
      .filter((result) => result.category === category && result.effective_status === 'pass')
      .reduce((sum, result) => sum + result.weight, 0)
    return [category, {
      score,
      threshold: requirementManifest.thresholds[category],
      pass: score >= requirementManifest.thresholds[category],
    }]
  }))

  const scenarioResults = requirementManifest.scenarios.map((scenario) => {
    const declared = scenarioResultById.get(scenario.id)
    const declaredStatus = declared?.status ?? 'unproven'
    const evidenceAssessment = assessEvidence(
      declared?.evidence_ids,
      scenario.required_evidence_kinds,
      evidenceById,
    )
    const status = effectiveResult(declaredStatus, evidenceAssessment)
    return {
      scenario_id: scenario.id,
      declared_status: declaredStatus,
      effective_status: status,
      evidence_ids: asArray(declared?.evidence_ids),
      failures: status === 'pass' ? [] : evidenceAssessment.failures,
    }
  })

  const auditByCategory = new Map(
    asArray(artifactManifest.veto_audits).map((audit) => [audit.category, audit]),
  )
  const vetoAudits = REQUIRED_VETO_CATEGORIES.map((category) => {
    const contract = requirementManifest.veto_audit_contracts?.[category]
    const audit = auditByCategory.get(category)
    const evidenceAssessment = assessEvidence(
      audit?.evidence_ids,
      contract?.required_evidence_kinds ?? [],
      evidenceById,
    )
    let status = audit?.status ?? 'unproven'
    if (status === 'clear' && !evidenceAssessment.valid) status = 'unproven'
    return {
      category,
      declared_status: audit?.status ?? 'unproven',
      effective_status: status,
      reviewer_id: audit?.reviewer_id ?? null,
      evidence_ids: asArray(audit?.evidence_ids),
      failures: status === 'clear' ? [] : evidenceAssessment.failures,
    }
  })

  const reviewByCategory = new Map(
    asArray(artifactManifest.independent_reviews).map((review) => [review.category, review]),
  )
  const independentReviews = REQUIRED_REVIEWS.map((category) => {
    const review = reviewByCategory.get(category)
    if (!review) {
      return { category, reviewer_id: null, status: 'unproven', failures: ['Independent review is missing.'] }
    }
    return {
      category,
      reviewer_id: review.reviewer_id,
      ...validateReviewPacket(
        review,
        evidenceById.get(review.packet_evidence_id),
        artifactManifest,
        requirementManifest,
        evidenceById,
      ),
    }
  })

  const experienceReviewerIds = independentReviews
    .map((review) => review.reviewer_id)
    .filter(Boolean)
  if (!unique(experienceReviewerIds)) {
    for (const review of independentReviews) {
      review.status = 'unproven'
      review.failures.push('All review categories must use distinct independent reviewer ids.')
    }
  }

  const gateReviewerId = independentReviews.find((review) => review.category === 'gate_audit')?.reviewer_id
  for (const audit of vetoAudits) {
    if (audit.effective_status === 'clear' && (!gateReviewerId || audit.reviewer_id !== gateReviewerId)) {
      audit.effective_status = 'unproven'
      audit.failures.push('Clear veto audits must be owned by the frozen gate-audit reviewer.')
    }
  }

  const frozen = artifactManifest.artifact.freeze_status === 'frozen' &&
    isNonEmptyString(artifactManifest.artifact.version) &&
    isNonEmptyString(artifactManifest.artifact.build) &&
    isNonEmptyString(artifactManifest.artifact.commit) &&
    hasSha256(artifactManifest.artifact.sha256) &&
    isNonEmptyString(artifactManifest.artifact.environment) &&
    isNonEmptyString(artifactManifest.artifact.target_user)

  const releaseBlockers = []
  if (!frozen) releaseBlockers.push('Artifact identity is not completely frozen.')
  releaseBlockers.push(...evidenceInventoryErrors)
  for (const [category, score] of Object.entries(categoryScores)) {
    if (!score.pass) releaseBlockers.push(`${category} score ${score.score} is below ${score.threshold}.`)
  }
  for (const result of requirementResults.filter((item) => item.release_gate && item.effective_status !== 'pass')) {
    releaseBlockers.push(`Release-gate requirement ${result.requirement_id} is ${result.effective_status}.`)
  }
  for (const result of scenarioResults.filter((item) => item.effective_status !== 'pass')) {
    releaseBlockers.push(`Scenario ${result.scenario_id} is ${result.effective_status}.`)
  }
  for (const audit of vetoAudits.filter((item) => item.effective_status !== 'clear')) {
    releaseBlockers.push(`${audit.category} veto audit is ${audit.effective_status}.`)
  }
  for (const review of independentReviews.filter((item) => item.status !== 'pass')) {
    releaseBlockers.push(`${review.category} independent review is ${review.status}.`)
  }

  return {
    contract_version: 'ts-macos-validation-result.v1',
    artifact: {
      id: artifactManifest.artifact.id,
      version: artifactManifest.artifact.version ?? null,
      sha256: artifactManifest.artifact.sha256 ?? null,
      frozen,
    },
    requirement_manifest: {
      id: requirementManifest.manifest_id,
      version: requirementManifest.version,
    },
    decision: releaseBlockers.length === 0 ? 'release_pass' : 'release_blocked',
    release_ready: releaseBlockers.length === 0,
    contract_errors: [],
    category_scores: categoryScores,
    requirement_results: requirementResults,
    scenario_results: scenarioResults,
    veto_audits: vetoAudits,
    independent_reviews: independentReviews,
    evidence_inventory: evidence.map((item) => ({
      id: item.id,
      kind: item.kind,
      path: item.path,
      valid: item.valid,
      failures: item.failures,
    })),
    release_blockers: releaseBlockers,
  }
}

function parseArguments(argv) {
  const options = {}
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--requirements') options.requirements = argv[++index]
    else if (argument === '--artifact') options.artifact = argv[++index]
    else if (argument === '--root') options.root = argv[++index]
    else if (argument === '--output') options.output = argv[++index]
    else if (argument === '--help' || argument === '-h') options.help = true
    else throw new Error(`Unknown argument: ${argument}`)
  }
  return options
}

function usage() {
  return [
    'Usage:',
    '  node scripts/evals/validate-macos-relationship-workbench.mjs \\',
    '    --requirements <requirement-manifest.json> \\',
    '    --artifact <artifact-manifest.json> [--root <repository>] [--output <result.json>]',
    '',
    'Exit codes: 0 release pass, 1 invalid contract or CLI error, 2 release blocked/unproven.',
  ].join('\n')
}

function runCli() {
  try {
    const options = parseArguments(process.argv.slice(2))
    if (options.help) {
      process.stdout.write(`${usage()}\n`)
      return 0
    }
    if (!options.requirements || !options.artifact) {
      throw new Error('Both --requirements and --artifact are required.')
    }
    const repositoryRoot = resolve(options.root ?? process.cwd())
    const report = evaluateMacosArtifact({
      requirementManifest: readJson(resolve(repositoryRoot, options.requirements)),
      artifactManifest: readJson(resolve(repositoryRoot, options.artifact)),
      repositoryRoot,
    })
    const serialized = `${JSON.stringify(report, null, 2)}\n`
    if (options.output) writeFileSync(resolve(repositoryRoot, options.output), serialized)
    process.stdout.write(serialized)
    if (report.decision === 'invalid_contract') return 1
    return report.release_ready ? 0 : 2
  } catch (error) {
    process.stderr.write(`${error.message}\n\n${usage()}\n`)
    return 1
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) process.exitCode = runCli()
