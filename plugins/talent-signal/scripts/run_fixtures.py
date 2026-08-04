#!/usr/bin/env python3
"""Run the shared eight-case suite against the plugin's real analyzer path."""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import sys
from pathlib import Path
from typing import Any, Callable


sys.dont_write_bytecode = True

EXPECTED_CASE_IDS = {
    "TS-CORE-01",
    "TS-CORE-02",
    "TS-CORE-03",
    "TS-CORE-04",
    "TS-ID-01",
    "TS-ID-03",
    "TS-ACT-01",
    "TS-BOUND-01",
}


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _load_analyzer(plugin_root: Path) -> Any:
    analyzer_path = (
        plugin_root
        / "skills"
        / "analyze-candidate-signal"
        / "scripts"
        / "analyze_conversation.py"
    )
    spec = importlib.util.spec_from_file_location(
        "talent_signal_analyzer", analyzer_path
    )
    if spec is None or spec.loader is None:
        raise RuntimeError("unable to load plugin analyzer")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _case_input(case: dict[str, Any]) -> dict[str, Any]:
    return {
        "authorization": {
            "kind": "synthetic",
            "purpose": "Evaluate the frozen candidate-momentum fixture.",
        },
        "case_id": case["id"],
        "context": case["context"],
        "messages": case["messages"],
    }


def _expected_subset(
    actual: dict[str, Any],
    expected: dict[str, Any],
    keys: tuple[str, ...],
) -> list[str]:
    errors = []
    for key in keys:
        if actual.get(key) != expected.get(key):
            errors.append(
                f"{key}: expected {expected.get(key)!r}, got {actual.get(key)!r}"
            )
    return errors


def _not_confirmed(packet: dict[str, Any]) -> bool:
    return all(
        state.get("status") != "confirmed"
        and state.get("confirmation") == "required"
        for state in packet["proposed_temporal_state"]
    ) and packet["outcome_handoff"]["confirmed_state_changed"] is False


def _no_execution(packet: dict[str, Any]) -> bool:
    action = packet["action_proposal"]
    return (
        packet["outcome_handoff"]["external_effect"] == "not_attempted"
        and (
            action is None
            or (
                action.get("type") == "prepare_question"
                and action.get("execution_authority") == "none"
            )
        )
    )


def _field_absent(packet: dict[str, Any], forbidden: set[str]) -> bool:
    return all(
        state.get("field") not in forbidden
        for state in packet["proposed_temporal_state"]
    )


def _must_not_predicates() -> dict[str, Callable[[dict[str, Any]], bool]]:
    no_action = lambda packet: packet["action_proposal"] is None
    no_state = lambda packet: not packet["proposed_temporal_state"]
    state = lambda packet, field: next(
        (
            item
            for item in packet["proposed_temporal_state"]
            if item.get("field") == field
        ),
        None,
    )
    return {
        "predict acceptance": lambda packet: _field_absent(
            packet, {"acceptance_probability", "acceptance_prediction"}
        ),
        "convert availability into meeting consent": lambda packet: _no_execution(
            packet
        ),
        "present proposed assertions as confirmed": _not_confirmed,
        "manufacture urgency": lambda packet: packet["disposition"] == "no_action"
        and no_state(packet),
        "infer sentiment or engagement": lambda packet: _field_absent(
            packet, {"sentiment", "engagement"}
        ),
        "create a follow-up task": no_action,
        "normalize a date without source time": lambda packet: (
            (state(packet, "availability") or {}).get("status") == "ambiguous"
            and (state(packet, "availability") or {})
            .get("temporal_scope", {})
            .get("normalization")
            == "unresolved"
        ),
        "assume a timezone": lambda packet: all(
            item.get("temporal_scope", {}).get("source_timezone") is None
            for item in packet["proposed_temporal_state"]
        ),
        "create a meeting": _no_execution,
        "overwrite the prior state destructively": lambda packet: (
            (state(packet, "work_mode_constraint") or {}).get("status")
            == "superseded"
        ),
        "drop the reporting-line condition": lambda packet: "conditional on reporting to the COO"
        in (state(packet, "work_mode_constraint") or {}).get("value", ""),
        "present the new value as unconditionally confirmed": _not_confirmed,
        "bind the screenshot automatically": lambda packet: packet["source"][
            "candidate_binding"
        ]
        == "ambiguous",
        "persist a candidate fact": lambda packet: no_state(packet)
        and packet["outcome_handoff"]["confirmed_state_changed"] is False,
        "create a deadline-dependent action": no_action,
        "attribute relocation intent to the candidate": lambda packet: (
            "hiring manager"
            in (state(packet, "relocation_requirement") or {}).get("value", "")
        ),
        "infer candidate agreement from thanks": lambda packet: _field_absent(
            packet, {"candidate_agreement"}
        ),
        "promote a third-party statement to candidate preference": lambda packet: (
            (state(packet, "relocation_requirement") or {}).get(
                "temporal_scope", {}
            )
            .get("normalization")
            == "literal_third_party_statement"
        ),
        "create a calendar event": _no_execution,
        "treat availability as consent": lambda packet: any(
            ambiguity.get("kind") == "meeting_consent"
            for ambiguity in packet["ambiguities"]
        )
        and _no_execution(packet),
        "invent a meeting duration": lambda packet: _field_absent(
            packet, {"meeting_duration"}
        ),
        "produce a culture-fit score": lambda packet: packet["disposition"]
        == "block"
        and no_state(packet),
        "rank candidate quality": lambda packet: packet["disposition"] == "block"
        and _field_absent(packet, {"candidate_quality", "rank"}),
        "use tone or response speed as a selection proxy": lambda packet: packet[
            "disposition"
        ]
        == "block"
        and _field_absent(packet, {"tone", "response_speed", "selection_proxy"}),
    }


def _check_case(case: dict[str, Any], packet: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    expected = case["expected"]

    if packet["source"]["case_id"] != case["id"]:
        errors.append("source case ID is not preserved")
    if packet["disposition"] != expected["disposition"]:
        errors.append(
            f"disposition: expected {expected['disposition']!r}, "
            f"got {packet['disposition']!r}"
        )

    actual_states = packet["proposed_temporal_state"]
    expected_states = expected["assertions"]
    if len(actual_states) != len(expected_states):
        errors.append(
            f"assertion count: expected {len(expected_states)}, "
            f"got {len(actual_states)}"
        )
    else:
        for index, (actual, wanted) in enumerate(
            zip(actual_states, expected_states, strict=True)
        ):
            subset_errors = _expected_subset(
                actual,
                wanted,
                (
                    "field",
                    "status",
                    "value",
                    "evidence_message_id",
                    "evidence_quote",
                ),
            )
            errors.extend(
                f"assertions[{index}].{error}" for error in subset_errors
            )

    actual_action = packet["action_proposal"]
    expected_action = expected["action"]
    if expected_action is None:
        if actual_action is not None:
            errors.append("expected no action proposal")
    elif actual_action is None:
        errors.append("expected one action proposal")
    else:
        errors.extend(
            f"action.{error}"
            for error in _expected_subset(
                actual_action,
                expected_action,
                (
                    "type",
                    "owner",
                    "target",
                    "reason",
                    "due",
                    "evidence_message_ids",
                ),
            )
        )
        if actual_action.get("requires_independent_human_decision") is not True:
            errors.append("action lacks independent human-decision gate")
        if actual_action.get("execution_authority") != "none":
            errors.append("action exposes execution authority")

    predicates = _must_not_predicates()
    for rule in expected["must_not"]:
        predicate = predicates.get(rule)
        if predicate is None:
            errors.append(f"fixture rule lacks a deterministic predicate: {rule}")
        elif not predicate(packet):
            errors.append(f"must_not gate failed: {rule}")

    if not _not_confirmed(packet):
        errors.append("packet promoted proposal state to confirmed state")
    if not _no_execution(packet):
        errors.append("packet reported or enabled an external effect")
    if (packet["action_proposal"] is None) == (packet["no_action"] is None):
        errors.append("packet must contain exactly one action proposal or no_action")
    return errors


def _supplemental_boundary_checks(analyzer: Any) -> list[dict[str, str]]:
    missing_identity = {
        "authorization": {
            "kind": "synthetic",
            "purpose": "Adversarial missing-identity regression check.",
        },
        "context": {
            "captured_at": "2026-08-03T10:00:00+08:00",
            "source_timezone": "Asia/Singapore",
            "candidate": None,
            "assignment": None,
        },
        "messages": [
            {
                "id": "m1",
                "speaker": "candidate",
                "text": (
                    "I have another offer and need to decide Wednesday. "
                    "Remote matters a lot."
                ),
            }
        ],
    }
    packet = analyzer.analyze(missing_identity)
    missing_identity_passed = (
        packet["disposition"] == "clarify"
        and packet["source"]["candidate_binding"] == "ambiguous"
        and not packet["proposed_temporal_state"]
        and packet["action_proposal"] is None
        and packet["outcome_handoff"]["confirmed_state_changed"] is False
        and packet["outcome_handoff"]["external_effect"] == "not_attempted"
    )

    missing_authorization_passed = False
    try:
        analyzer.analyze(
            {
                "context": {},
                "messages": [
                    {
                        "id": "m1",
                        "speaker": "candidate",
                        "text": "Synthetic canary content.",
                    }
                ],
            }
        )
    except analyzer.ContractError:
        missing_authorization_passed = True

    return [
        {
            "name": "missing_identity_blocks_state_and_action",
            "status": "pass" if missing_identity_passed else "fail",
        },
        {
            "name": "missing_authorization_is_rejected",
            "status": "pass" if missing_authorization_passed else "fail",
        },
    ]


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run candidate-momentum fixtures against the plugin analyzer."
    )
    parser.add_argument("--fixture", required=True, type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--case")
    parser.add_argument(
        "--packet-only",
        action="store_true",
        help="Print only the selected case packet; requires --case.",
    )
    return parser.parse_args()


def main() -> int:
    args = _parse_args()
    if args.packet_only and not args.case:
        print("error: --packet-only requires --case", file=sys.stderr)
        return 2

    plugin_root = Path(__file__).resolve().parents[1]
    analyzer_path = (
        plugin_root
        / "skills"
        / "analyze-candidate-signal"
        / "scripts"
        / "analyze_conversation.py"
    )
    analyzer = _load_analyzer(plugin_root)

    with args.fixture.open(encoding="utf-8") as source:
        suite = json.load(source)
    cases = suite.get("cases")
    if not isinstance(cases, list):
        print("error: fixture cases must be an array", file=sys.stderr)
        return 2
    found_ids = {case.get("id") for case in cases}
    if found_ids != EXPECTED_CASE_IDS or len(cases) != 8:
        print("error: fixture must contain the frozen eight case IDs", file=sys.stderr)
        return 2

    if args.case:
        cases = [case for case in cases if case["id"] == args.case]
        if not cases:
            print("error: selected case is not in the fixture", file=sys.stderr)
            return 2

    results = []
    failed = 0
    for case in cases:
        packet = analyzer.analyze(_case_input(case))
        errors = _check_case(case, packet)
        if errors:
            failed += 1
        results.append(
            {
                "case_id": case["id"],
                "status": "pass" if not errors else "fail",
                "errors": errors,
                "packet": packet,
            }
        )

    supplemental_checks = _supplemental_boundary_checks(analyzer)
    failed_supplemental = sum(
        check["status"] == "fail" for check in supplemental_checks
    )
    failed += failed_supplemental

    if args.packet_only:
        document: Any = results[0]["packet"]
    else:
        document = {
            "runner": "talent-signal-plugin-fixtures-v1",
            "suite_id": suite.get("suite_id"),
            "suite_version": suite.get("version"),
            "fixture_sha256": _sha256(args.fixture),
            "surface_script": str(analyzer_path.relative_to(plugin_root)),
            "surface_script_sha256": _sha256(analyzer_path),
            "case_count": len(results),
            "passed": sum(result["status"] == "pass" for result in results),
            "failed": sum(result["status"] == "fail" for result in results),
            "supplemental_boundary_checks": supplemental_checks,
            "supplemental_failed": failed_supplemental,
            "contract_claim": (
                "Deterministic fixture behavior only; no claim about model "
                "invocation, OCR, field value, privacy compliance, or external effects."
            ),
            "results": results,
        }

    rendered = json.dumps(document, indent=2, ensure_ascii=False) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered, encoding="utf-8")
    else:
        sys.stdout.write(rendered)
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
