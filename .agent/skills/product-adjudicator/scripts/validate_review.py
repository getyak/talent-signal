#!/usr/bin/env python3
"""Validate Talent Signal specialist review and panel-result JSON."""

from __future__ import annotations

import argparse
import copy
import json
import re
import sys
from pathlib import Path
from typing import Any


VERDICTS = {"pass", "pass_with_changes", "fail", "abstain"}
CONFIDENCE = {"direct", "supported_inference", "insufficient"}
SEVERITIES = {"blocker", "high", "medium", "low"}
PLAN_STATUSES = {"selected", "omitted"}
RELEASE_GATES = {"pass", "block", "needs_evidence"}
VETO_STATUSES = {"active", "resolved", "not_applicable"}
SKILL_NAME = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")

REVIEW_FIELDS = {
    "reviewer",
    "lens",
    "verdict",
    "score",
    "confidence",
    "findings",
    "strengths",
    "missing_evidence",
    "vetoes",
    "open_questions",
}
FINDING_FIELDS = {
    "severity",
    "criterion",
    "observation",
    "evidence",
    "user_impact",
    "recommendation",
    "verification",
}
PANEL_FIELDS = {
    "panel_id",
    "artifact",
    "scenario",
    "frozen_evidence",
    "review_plan",
    "reviews",
    "adjudication",
    "next_tests",
}


def _path(prefix: str, key: str) -> str:
    return f"{prefix}.{key}" if prefix else key


def _require_keys(
    value: Any, required: set[str], prefix: str, errors: list[str]
) -> bool:
    if not isinstance(value, dict):
        errors.append(f"{prefix or '$'} must be an object")
        return False
    missing = sorted(required - set(value))
    for key in missing:
        errors.append(f"{_path(prefix, key)} is required")
    return not missing


def _string(value: Any, prefix: str, errors: list[str]) -> None:
    if not isinstance(value, str) or not value.strip():
        errors.append(f"{prefix} must be a non-empty string")


def _string_list(value: Any, prefix: str, errors: list[str]) -> None:
    if not isinstance(value, list):
        errors.append(f"{prefix} must be an array")
        return
    for index, item in enumerate(value):
        _string(item, f"{prefix}[{index}]", errors)


def validate_review(
    value: Any, prefix: str = "", *, allow_extra: bool = False
) -> list[str]:
    errors: list[str] = []
    if not _require_keys(value, REVIEW_FIELDS, prefix, errors):
        return errors

    if not allow_extra:
        for key in sorted(set(value) - REVIEW_FIELDS):
            errors.append(f"{_path(prefix, key)} is not allowed")

    reviewer = value["reviewer"]
    _string(reviewer, _path(prefix, "reviewer"), errors)
    if isinstance(reviewer, str) and reviewer and not SKILL_NAME.fullmatch(reviewer):
        errors.append(f"{_path(prefix, 'reviewer')} must be a kebab-case skill name")

    _string(value["lens"], _path(prefix, "lens"), errors)

    verdict = value["verdict"]
    if verdict not in VERDICTS:
        errors.append(
            f"{_path(prefix, 'verdict')} must be one of {sorted(VERDICTS)}"
        )

    score = value["score"]
    if verdict == "abstain":
        if score is not None:
            errors.append(f"{_path(prefix, 'score')} must be null when abstaining")
    elif isinstance(score, bool) or not isinstance(score, int) or not 0 <= score <= 4:
        errors.append(f"{_path(prefix, 'score')} must be an integer from 0 to 4")

    if value["confidence"] not in CONFIDENCE:
        errors.append(
            f"{_path(prefix, 'confidence')} must be one of {sorted(CONFIDENCE)}"
        )

    findings = value["findings"]
    if not isinstance(findings, list):
        errors.append(f"{_path(prefix, 'findings')} must be an array")
    else:
        for index, finding in enumerate(findings):
            item_path = f"{_path(prefix, 'findings')}[{index}]"
            if not _require_keys(finding, FINDING_FIELDS, item_path, errors):
                continue
            if not allow_extra:
                for key in sorted(set(finding) - FINDING_FIELDS):
                    errors.append(f"{_path(item_path, key)} is not allowed")
            if finding["severity"] not in SEVERITIES:
                errors.append(
                    f"{_path(item_path, 'severity')} must be one of "
                    f"{sorted(SEVERITIES)}"
                )
            for key in FINDING_FIELDS - {"severity"}:
                _string(finding[key], _path(item_path, key), errors)

    for key in ("strengths", "missing_evidence", "vetoes", "open_questions"):
        _string_list(value[key], _path(prefix, key), errors)

    if (
        verdict == "fail"
        and isinstance(findings, list)
        and not findings
        and isinstance(value["vetoes"], list)
        and not value["vetoes"]
    ):
        errors.append(
            f"{prefix or '$'} fail verdict requires at least one finding or veto"
        )

    return errors


def _validate_top_findings(value: Any, prefix: str, errors: list[str]) -> None:
    required = {
        "reviewer",
        "criterion",
        "severity",
        "reason",
        "next_step",
        "verification",
    }
    if not isinstance(value, list):
        errors.append(f"{prefix} must be an array")
        return
    if len(value) > 3:
        errors.append(f"{prefix} may contain at most three findings")
    for index, finding in enumerate(value):
        item_path = f"{prefix}[{index}]"
        if not _require_keys(finding, required, item_path, errors):
            continue
        if finding["severity"] not in SEVERITIES:
            errors.append(
                f"{_path(item_path, 'severity')} must be one of {sorted(SEVERITIES)}"
            )
        for key in required - {"severity"}:
            _string(finding[key], _path(item_path, key), errors)


def _validate_disagreements(value: Any, prefix: str, errors: list[str]) -> None:
    required = {"issue", "positions", "resolution", "resolution_basis"}
    position_fields = {"reviewer", "position", "evidence"}
    if not isinstance(value, list):
        errors.append(f"{prefix} must be an array")
        return
    for index, disagreement in enumerate(value):
        item_path = f"{prefix}[{index}]"
        if not _require_keys(disagreement, required, item_path, errors):
            continue
        _string(disagreement["issue"], _path(item_path, "issue"), errors)
        _string(disagreement["resolution"], _path(item_path, "resolution"), errors)
        _string(
            disagreement["resolution_basis"],
            _path(item_path, "resolution_basis"),
            errors,
        )
        positions = disagreement["positions"]
        if not isinstance(positions, list) or len(positions) < 2:
            errors.append(f"{_path(item_path, 'positions')} needs at least two items")
            continue
        for p_index, position in enumerate(positions):
            p_path = f"{_path(item_path, 'positions')}[{p_index}]"
            if not _require_keys(position, position_fields, p_path, errors):
                continue
            for key in position_fields:
                _string(position[key], _path(p_path, key), errors)


def _validate_veto_resolution(
    value: Any, prefix: str, errors: list[str]
) -> list[tuple[str, str, str]]:
    required = {"reviewer", "veto", "status", "evidence"}
    rows: list[tuple[str, str, str]] = []
    if not isinstance(value, list):
        errors.append(f"{prefix} must be an array")
        return rows
    for index, resolution in enumerate(value):
        item_path = f"{prefix}[{index}]"
        if not _require_keys(resolution, required, item_path, errors):
            continue
        for key in ("reviewer", "veto", "evidence"):
            _string(resolution[key], _path(item_path, key), errors)
        status = resolution["status"]
        if status not in VETO_STATUSES:
            errors.append(
                f"{_path(item_path, 'status')} must be one of {sorted(VETO_STATUSES)}"
            )
        if all(isinstance(resolution[key], str) for key in ("reviewer", "veto")):
            rows.append((resolution["reviewer"], resolution["veto"], status))
    return rows


def validate_panel(value: Any) -> list[str]:
    errors: list[str] = []
    if not _require_keys(value, PANEL_FIELDS, "", errors):
        return errors
    for key in sorted(set(value) - PANEL_FIELDS):
        errors.append(f"{key} is not allowed")

    _string(value["panel_id"], "panel_id", errors)
    _string(value["scenario"], "scenario", errors)
    _string_list(value["frozen_evidence"], "frozen_evidence", errors)

    artifact_fields = {"id", "type", "version"}
    artifact = value["artifact"]
    if _require_keys(artifact, artifact_fields, "artifact", errors):
        for key in artifact_fields:
            _string(artifact[key], f"artifact.{key}", errors)

    plan_reviewers: dict[str, str] = {}
    selected: set[str] = set()
    plan = value["review_plan"]
    if not isinstance(plan, list) or not plan:
        errors.append("review_plan must be a non-empty array")
    else:
        for index, item in enumerate(plan):
            item_path = f"review_plan[{index}]"
            if not _require_keys(
                item, {"reviewer", "status", "reason"}, item_path, errors
            ):
                continue
            reviewer = item["reviewer"]
            _string(reviewer, f"{item_path}.reviewer", errors)
            _string(item["reason"], f"{item_path}.reason", errors)
            status = item["status"]
            if status not in PLAN_STATUSES:
                errors.append(
                    f"{item_path}.status must be one of {sorted(PLAN_STATUSES)}"
                )
            if isinstance(reviewer, str):
                if reviewer in plan_reviewers:
                    errors.append(f"{item_path}.reviewer duplicates {reviewer}")
                plan_reviewers[reviewer] = status
                if status == "selected":
                    selected.add(reviewer)

    review_names: set[str] = set()
    review_vetoes: set[tuple[str, str]] = set()
    reviews = value["reviews"]
    if not isinstance(reviews, list):
        errors.append("reviews must be an array")
    else:
        for index, review in enumerate(reviews):
            item_path = f"reviews[{index}]"
            errors.extend(validate_review(review, item_path))
            if isinstance(review, dict) and isinstance(review.get("reviewer"), str):
                reviewer = review["reviewer"]
                if reviewer in review_names:
                    errors.append(f"{item_path}.reviewer duplicates {reviewer}")
                review_names.add(reviewer)
                if reviewer not in selected:
                    errors.append(f"{item_path}.reviewer was not selected in review_plan")
                vetoes = review.get("vetoes")
                if isinstance(vetoes, list):
                    for veto in vetoes:
                        if isinstance(veto, str):
                            review_vetoes.add((reviewer, veto))

    adjudication_fields = {
        "verdict",
        "release_gate",
        "top_findings",
        "agreements",
        "disagreements",
        "veto_resolution",
        "rationale",
    }
    adjudication = value["adjudication"]
    resolutions: list[tuple[str, str, str]] = []
    if _require_keys(adjudication, adjudication_fields, "adjudication", errors):
        verdict = adjudication["verdict"]
        release_gate = adjudication["release_gate"]
        if verdict not in VERDICTS:
            errors.append(f"adjudication.verdict must be one of {sorted(VERDICTS)}")
        if release_gate not in RELEASE_GATES:
            errors.append(
                "adjudication.release_gate must be one of "
                f"{sorted(RELEASE_GATES)}"
            )
        _validate_top_findings(
            adjudication["top_findings"], "adjudication.top_findings", errors
        )
        _string_list(adjudication["agreements"], "adjudication.agreements", errors)
        _validate_disagreements(
            adjudication["disagreements"], "adjudication.disagreements", errors
        )
        resolutions = _validate_veto_resolution(
            adjudication["veto_resolution"],
            "adjudication.veto_resolution",
            errors,
        )
        _string(adjudication["rationale"], "adjudication.rationale", errors)

        active = {(reviewer, veto) for reviewer, veto, status in resolutions if status == "active"}
        if active and (release_gate != "block" or verdict != "fail"):
            errors.append(
                "active vetoes require adjudication.release_gate=block and verdict=fail"
            )

        missing_reviews = selected - review_names
        if missing_reviews and release_gate == "pass":
            errors.append(
                "release_gate cannot pass with missing selected reviews: "
                + ", ".join(sorted(missing_reviews))
            )

    resolution_pairs = {(reviewer, veto) for reviewer, veto, _ in resolutions}
    for reviewer, veto in sorted(review_vetoes - resolution_pairs):
        errors.append(
            "adjudication.veto_resolution is missing "
            f"reviewer={reviewer!r}, veto={veto!r}"
        )

    next_test_fields = {"owner", "test", "evidence_required", "pass_condition"}
    next_tests = value["next_tests"]
    if not isinstance(next_tests, list):
        errors.append("next_tests must be an array")
    else:
        for index, test in enumerate(next_tests):
            item_path = f"next_tests[{index}]"
            if not _require_keys(test, next_test_fields, item_path, errors):
                continue
            for key in next_test_fields:
                _string(test[key], f"{item_path}.{key}", errors)

    return errors


def detect_kind(value: Any) -> str:
    if isinstance(value, dict) and "panel_id" in value:
        return "panel"
    if isinstance(value, dict) and "reviewer" in value:
        return "review"
    raise ValueError("Cannot detect document kind; expected reviewer or panel_id")


def self_test() -> list[str]:
    review = {
        "reviewer": "test-reviewer",
        "lens": "contract behavior",
        "verdict": "pass",
        "score": 3,
        "confidence": "direct",
        "findings": [],
        "strengths": ["Valid fixture."],
        "missing_evidence": [],
        "vetoes": [],
        "open_questions": [],
    }
    failures: list[str] = []
    if validate_review(review):
        failures.append("valid review fixture was rejected")

    invalid_score = copy.deepcopy(review)
    invalid_score["score"] = 5
    if not validate_review(invalid_score):
        failures.append("out-of-range score was accepted")

    invalid_abstain = copy.deepcopy(review)
    invalid_abstain["verdict"] = "abstain"
    if not validate_review(invalid_abstain):
        failures.append("non-null abstain score was accepted")

    panel = {
        "panel_id": "self-test",
        "artifact": {"id": "fixture", "type": "json", "version": "1"},
        "scenario": "Contract self-test.",
        "frozen_evidence": ["inline fixture"],
        "review_plan": [
            {
                "reviewer": "test-reviewer",
                "status": "selected",
                "reason": "Exercise panel validation.",
            }
        ],
        "reviews": [review],
        "adjudication": {
            "verdict": "pass",
            "release_gate": "pass",
            "top_findings": [],
            "agreements": ["Fixture is structurally valid."],
            "disagreements": [],
            "veto_resolution": [],
            "rationale": "All required fields are valid.",
        },
        "next_tests": [],
    }
    if validate_panel(panel):
        failures.append("valid panel fixture was rejected")

    invalid_panel = copy.deepcopy(panel)
    invalid_panel["reviews"][0]["vetoes"] = ["Test veto"]
    if not validate_panel(invalid_panel):
        failures.append("unresolved specialist veto was accepted")

    return failures


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("path", nargs="?", type=Path, help="JSON review or panel file")
    parser.add_argument(
        "--kind", choices=("auto", "review", "panel"), default="auto"
    )
    parser.add_argument(
        "--self-test", action="store_true", help="run built-in validator tests"
    )
    args = parser.parse_args()

    if args.self_test:
        failures = self_test()
        if failures:
            for failure in failures:
                print(f"ERROR: {failure}", file=sys.stderr)
            return 1
        print("validator self-test: PASS")
        if args.path is None:
            return 0

    if args.path is None:
        parser.error("path is required unless --self-test is used")

    try:
        value = json.loads(args.path.read_text(encoding="utf-8"))
        kind = detect_kind(value) if args.kind == "auto" else args.kind
        errors = validate_panel(value) if kind == "panel" else validate_review(value)
    except (OSError, json.JSONDecodeError, ValueError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 2

    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1

    print(f"{kind} contract: PASS ({args.path})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
