#!/usr/bin/env python3
"""Create a bounded, proposal-only packet from supplied conversation JSON."""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timedelta
from typing import Any


SCHEMA_VERSION = "talent-signal.proposal.v1"
DISPOSITIONS = {"propose_action", "no_action", "clarify", "block"}
STATE_STATUSES = {"proposed", "ambiguous", "superseded"}
AUTHORIZATION_KINDS = {"synthetic", "user_authorized"}
WEEKDAYS = {
    "monday": 0,
    "tuesday": 1,
    "wednesday": 2,
    "thursday": 3,
    "friday": 4,
    "saturday": 5,
    "sunday": 6,
}
PROHIBITED_ASSESSMENT_TERMS = (
    "culture-fit",
    "culture fit",
    "fit percentage",
    "candidate quality",
    "personality score",
    "potential score",
    "acceptance probability",
)


class ContractError(ValueError):
    """Raised when input or output violates the bounded contract."""


def _non_empty_string(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ContractError(f"{label} must be a non-empty string")
    return value


def validate_input(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise ContractError("input must be a JSON object")

    authorization = payload.get("authorization")
    if not isinstance(authorization, dict):
        raise ContractError("authorization must be an object")
    kind = authorization.get("kind")
    if kind not in AUTHORIZATION_KINDS:
        raise ContractError(
            "authorization.kind must be synthetic or user_authorized"
        )
    _non_empty_string(authorization.get("purpose"), "authorization.purpose")

    context = payload.get("context")
    if not isinstance(context, dict):
        raise ContractError("context must be an object")

    messages = payload.get("messages")
    if not isinstance(messages, list) or not messages:
        raise ContractError("messages must be a non-empty array")

    seen_ids: set[str] = set()
    for index, message in enumerate(messages):
        if not isinstance(message, dict):
            raise ContractError(f"messages[{index}] must be an object")
        message_id = _non_empty_string(message.get("id"), f"messages[{index}].id")
        if message_id in seen_ids:
            raise ContractError("message IDs must be unique")
        seen_ids.add(message_id)
        _non_empty_string(message.get("speaker"), f"messages[{index}].speaker")
        _non_empty_string(message.get("text"), f"messages[{index}].text")

    case_id = payload.get("case_id")
    if case_id is not None:
        _non_empty_string(case_id, "case_id")
    return payload


def _next_weekday(captured_at: Any, weekday_name: str) -> str | None:
    if not isinstance(captured_at, str):
        return None
    target = WEEKDAYS.get(weekday_name.lower())
    if target is None:
        return None
    try:
        captured = datetime.fromisoformat(captured_at)
    except ValueError:
        return None
    delta = (target - captured.weekday()) % 7
    return (captured.date() + timedelta(days=delta)).isoformat()


def _state(
    *,
    field: str,
    status: str,
    value: str,
    message: dict[str, Any],
    quote: str,
    context: dict[str, Any],
    normalization: str,
) -> dict[str, Any]:
    return {
        "field": field,
        "status": status,
        "value": value,
        "evidence_message_id": message["id"],
        "evidence_quote": quote,
        "temporal_scope": {
            "as_of": context.get("captured_at"),
            "source_timezone": context.get("source_timezone"),
            "normalization": normalization,
        },
        "confirmation": "required",
    }


def _ambiguity(
    *,
    kind: str,
    description: str,
    message_ids: list[str],
    blocks: list[str],
) -> dict[str, Any]:
    return {
        "kind": kind,
        "description": description,
        "evidence_message_ids": message_ids,
        "blocks": blocks,
    }


def _action(
    *,
    target: str,
    reason: str,
    due: str,
    message_ids: list[str],
    effect_preview: str,
) -> dict[str, Any]:
    return {
        "type": "prepare_question",
        "owner": "recruiter",
        "target": target,
        "reason": reason,
        "due": due,
        "evidence_message_ids": message_ids,
        "effect_preview": effect_preview,
        "requires_independent_human_decision": True,
        "execution_authority": "none",
    }


def _evidence(
    messages_by_id: dict[str, dict[str, Any]],
    states: list[dict[str, Any]],
    action: dict[str, Any] | None,
) -> list[dict[str, str]]:
    spans: list[dict[str, str]] = []
    seen: set[tuple[str, str]] = set()

    for state in states:
        message_id = state["evidence_message_id"]
        quote = state["evidence_quote"]
        key = (message_id, quote)
        if key in seen:
            continue
        message = messages_by_id[message_id]
        spans.append(
            {
                "message_id": message_id,
                "speaker": message["speaker"],
                "quote": quote,
            }
        )
        seen.add(key)

    if action:
        for message_id in action["evidence_message_ids"]:
            if any(span["message_id"] == message_id for span in spans):
                continue
            message = messages_by_id[message_id]
            spans.append(
                {
                    "message_id": message_id,
                    "speaker": message["speaker"],
                    "quote": message["text"],
                }
            )
    return spans


def _source(payload: dict[str, Any]) -> dict[str, Any]:
    context = payload["context"]
    candidate = context.get("candidate")
    assignment = context.get("assignment")
    ambiguous_identity = not candidate or not assignment
    return {
        "authorization": payload["authorization"]["kind"],
        "purpose": payload["authorization"]["purpose"],
        "case_id": payload.get("case_id"),
        "captured_at": context.get("captured_at"),
        "source_timezone": context.get("source_timezone"),
        "candidate_scope": candidate,
        "assignment_scope": assignment,
        "candidate_binding": (
            "ambiguous" if ambiguous_identity else "scoped_for_review"
        ),
    }


def _blocked_packet(
    payload: dict[str, Any],
    reason: str,
) -> dict[str, Any]:
    return {
        "schema_version": SCHEMA_VERSION,
        "source": _source(payload),
        "disposition": "block",
        "evidence": [],
        "proposed_temporal_state": [],
        "ambiguities": [],
        "action_proposal": None,
        "no_action": {
            "reason": reason,
            "evidence_message_ids": [],
        },
        "outcome_handoff": {
            "status": "blocked",
            "summary": reason,
            "confirmed_state_changed": False,
            "external_effect": "not_attempted",
            "requires_human_decision": False,
        },
    }


def analyze(payload: Any) -> dict[str, Any]:
    payload = validate_input(payload)
    context = payload["context"]
    messages: list[dict[str, Any]] = payload["messages"]
    messages_by_id = {message["id"]: message for message in messages}

    requested_output = str(context.get("requested_output", "")).lower()
    if any(term in requested_output for term in PROHIBITED_ASSESSMENT_TERMS):
        packet = _blocked_packet(
            payload,
            "Candidate assessment, culture-fit scoring, and behavioral proxies "
            "are outside this plugin's evidence-to-action boundary.",
        )
        validate_packet(packet, messages)
        return packet

    candidate = context.get("candidate")
    assignment = context.get("assignment")
    if not candidate or not assignment:
        message_ids = [message["id"] for message in messages]
        packet = {
            "schema_version": SCHEMA_VERSION,
            "source": _source(payload),
            "disposition": "clarify",
            "evidence": [],
            "proposed_temporal_state": [],
            "ambiguities": [
                _ambiguity(
                    kind="candidate_identity",
                    description=(
                        "Candidate and assignment context is missing or "
                        "ambiguous in the supplied source."
                    ),
                    message_ids=message_ids,
                    blocks=["state_confirmation", "action_execution"],
                )
            ],
            "action_proposal": None,
            "no_action": {
                "reason": "Resolve candidate and assignment identity before proposing state or action.",
                "evidence_message_ids": message_ids,
            },
            "outcome_handoff": {
                "status": "needs_clarification",
                "summary": "Candidate identity remains unresolved; nothing was bound or changed.",
                "confirmed_state_changed": False,
                "external_effect": "not_attempted",
                "requires_human_decision": True,
            },
        }
        validate_packet(packet, messages)
        return packet

    states: list[dict[str, Any]] = []
    ambiguities: list[dict[str, Any]] = []
    signal_flags: set[str] = set()

    for message in messages:
        text = message["text"]
        lower = text.lower()

        if (
            message["speaker"].lower() == "recruiter"
            and "forwarded from the hiring manager" in lower
            and "relocat" in lower
        ):
            states.append(
                _state(
                    field="relocation_requirement",
                    status="proposed",
                    value="hiring manager says relocation would be required",
                    message=message,
                    quote="Forwarded from the hiring manager",
                    context=context,
                    normalization="literal_third_party_statement",
                )
            )
            signal_flags.add("third_party_relocation")

        conditional_work_mode = re.search(
            r"(three office days if the role reports to the COO)",
            text,
            flags=re.IGNORECASE,
        )
        if conditional_work_mode:
            quote = conditional_work_mode.group(1)
            states.append(
                _state(
                    field="work_mode_constraint",
                    status="superseded",
                    value="three office days, conditional on reporting to the COO",
                    message=message,
                    quote=quote,
                    context=context,
                    normalization="conditional_supersession",
                )
            )
            ambiguities.append(
                _ambiguity(
                    kind="unresolved_condition",
                    description=(
                        "The proposed work-mode change depends on a reporting "
                        "line that is not established in the supplied source."
                    ),
                    message_ids=[message["id"]],
                    blocks=["state_confirmation"],
                )
            )
            signal_flags.add("conditional_work_mode")

        competing_offer = re.search(
            r"(I have another offer)", text, flags=re.IGNORECASE
        )
        if competing_offer:
            states.append(
                _state(
                    field="competing_process",
                    status="proposed",
                    value="another offer",
                    message=message,
                    quote=competing_offer.group(1),
                    context=context,
                    normalization="literal",
                )
            )
            signal_flags.add("competing_offer")

        deadline_match = re.search(
            r"(need to decide (Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday))",
            text,
            flags=re.IGNORECASE,
        )
        if deadline_match:
            quote = deadline_match.group(1)
            weekday = deadline_match.group(2)
            normalized = None
            if context.get("source_timezone"):
                normalized = _next_weekday(context.get("captured_at"), weekday)
            if normalized:
                states.append(
                    _state(
                        field="decision_deadline",
                        status="proposed",
                        value=normalized,
                        message=message,
                        quote=quote,
                        context=context,
                        normalization="anchored_to_capture_context",
                    )
                )
                signal_flags.add("decision_deadline")
            else:
                states.append(
                    _state(
                        field="decision_deadline",
                        status="ambiguous",
                        value=weekday,
                        message=message,
                        quote=quote,
                        context=context,
                        normalization="unresolved",
                    )
                )
                ambiguities.append(
                    _ambiguity(
                        kind="deadline_time_context",
                        description=(
                            "The relative deadline cannot be normalized without "
                            "valid capture time and source timezone."
                        ),
                        message_ids=[message["id"]],
                        blocks=["state_confirmation", "action_execution"],
                    )
                )
                signal_flags.add("ambiguous_time")

        ambiguous_availability = re.search(
            r"(Next Friday around 3)", text, flags=re.IGNORECASE
        )
        if ambiguous_availability:
            quote = ambiguous_availability.group(1)
            status = "ambiguous" if not context.get("source_timezone") else "proposed"
            states.append(
                _state(
                    field="availability",
                    status=status,
                    value=quote[0].lower() + quote[1:],
                    message=message,
                    quote=quote,
                    context=context,
                    normalization=(
                        "unresolved" if status == "ambiguous" else "literal"
                    ),
                )
            )
            if status == "ambiguous":
                ambiguities.append(
                    _ambiguity(
                        kind="availability_date_timezone",
                        description=(
                            "The message does not establish an exact date or "
                            "timezone for the relative availability."
                        ),
                        message_ids=[message["id"]],
                        blocks=["state_confirmation", "action_execution"],
                    )
                )
                signal_flags.add("ambiguous_time")
            else:
                signal_flags.add("availability")

        speak_availability = re.search(
            r"(I can speak Tuesday afternoon)", text, flags=re.IGNORECASE
        )
        open_availability = re.search(
            r"(Tuesday afternoon is open)", text, flags=re.IGNORECASE
        )
        availability_match = speak_availability or open_availability
        if availability_match:
            quote = availability_match.group(1)
            states.append(
                _state(
                    field="availability",
                    status="proposed",
                    value="Tuesday afternoon",
                    message=message,
                    quote=quote,
                    context=context,
                    normalization="literal_unconfirmed_availability",
                )
            )
            signal_flags.add("availability")
            if open_availability and not speak_availability:
                ambiguities.append(
                    _ambiguity(
                        kind="meeting_consent",
                        description=(
                            "Availability does not establish consent to a "
                            "specific meeting, date, timezone, or duration."
                        ),
                        message_ids=[message["id"]],
                        blocks=["action_execution"],
                    )
                )

        remote_preference = re.search(
            r"(remote matters a lot)", text, flags=re.IGNORECASE
        )
        if remote_preference:
            quote = remote_preference.group(1)
            states.append(
                _state(
                    field="work_mode_preference",
                    status="proposed",
                    value="remote matters a lot",
                    message=message,
                    quote=quote,
                    context=context,
                    normalization="literal_preference",
                )
            )
            signal_flags.add("remote_preference")

    action: dict[str, Any] | None = None
    if "conditional_work_mode" in signal_flags:
        message_id = next(
            state["evidence_message_id"]
            for state in states
            if state["field"] == "work_mode_constraint"
        )
        action = _action(
            target="role reporting line",
            reason=(
                "Resolve the condition before treating the work-mode constraint as changed."
            ),
            due="before advancing the process",
            message_ids=[message_id],
            effect_preview=(
                "Prepare one recruiter-owned question about whether the role "
                "reports to the COO; do not contact anyone or change state."
            ),
        )
    elif {
        "decision_deadline",
        "remote_preference",
    }.issubset(signal_flags):
        evidence_ids = sorted(
            {
                state["evidence_message_id"]
                for state in states
                if state["field"]
                in {
                    "competing_process",
                    "decision_deadline",
                    "work_mode_preference",
                }
            }
        )
        action = _action(
            target="client remote-work policy",
            reason="Resolve the work-mode dependency before the decision deadline.",
            due="within one business day",
            message_ids=evidence_ids,
            effect_preview=(
                "Prepare one recruiter-owned question about the client's "
                "remote-work policy; do not send it or change any system."
            ),
        )
    elif (
        "availability" in signal_flags
        and "ambiguous_time" not in signal_flags
        and len(states) == 1
    ):
        message_id = states[0]["evidence_message_id"]
        action = _action(
            target="candidate meeting confirmation",
            reason=(
                "Ask for an exact date and timezone before preparing a calendar change."
            ),
            due="before scheduling",
            message_ids=[message_id],
            effect_preview=(
                "Prepare one recruiter-owned clarification question for the "
                "candidate; do not send it or create a calendar event."
            ),
        )

    if "ambiguous_time" in signal_flags:
        disposition = "clarify"
    elif action:
        disposition = "propose_action"
    else:
        disposition = "no_action"

    no_action = None
    if action is None:
        if disposition == "clarify":
            reason = "Resolve the listed time and timezone ambiguity before state confirmation or action."
        elif "third_party_relocation" in signal_flags:
            reason = (
                "The source records a hiring-manager statement but no candidate "
                "preference, agreement, or safe action."
            )
        else:
            reason = "No decision-relevant change or recruiter action is supported by the supplied evidence."
        no_action = {
            "reason": reason,
            "evidence_message_ids": sorted(
                {state["evidence_message_id"] for state in states}
            ),
        }

    if disposition == "propose_action":
        handoff_status = "proposal_only"
        summary = "One recruiter-owned question artifact is proposed for independent review."
    elif disposition == "clarify":
        handoff_status = "needs_clarification"
        summary = "Ambiguity is preserved; no state was confirmed and no action was attempted."
    else:
        handoff_status = "no_action"
        summary = "No recruiter action is proposed from the supplied evidence."

    packet = {
        "schema_version": SCHEMA_VERSION,
        "source": _source(payload),
        "disposition": disposition,
        "evidence": _evidence(messages_by_id, states, action),
        "proposed_temporal_state": states,
        "ambiguities": ambiguities,
        "action_proposal": action,
        "no_action": no_action,
        "outcome_handoff": {
            "status": handoff_status,
            "summary": summary,
            "confirmed_state_changed": False,
            "external_effect": "not_attempted",
            "requires_human_decision": disposition
            in {"propose_action", "clarify"},
        },
    }
    validate_packet(packet, messages)
    return packet


def validate_packet(packet: Any, messages: list[dict[str, Any]]) -> None:
    if not isinstance(packet, dict):
        raise ContractError("output packet must be an object")
    if packet.get("schema_version") != SCHEMA_VERSION:
        raise ContractError("unexpected output schema version")
    if packet.get("disposition") not in DISPOSITIONS:
        raise ContractError("invalid disposition")

    message_map = {message["id"]: message for message in messages}
    states = packet.get("proposed_temporal_state")
    if not isinstance(states, list):
        raise ContractError("proposed_temporal_state must be an array")
    for state in states:
        if state.get("status") not in STATE_STATUSES:
            raise ContractError("state status must remain proposal-only")
        if state.get("confirmation") != "required":
            raise ContractError("every state proposal must require confirmation")
        message_id = state.get("evidence_message_id")
        quote = state.get("evidence_quote")
        if message_id not in message_map:
            raise ContractError("state cites an unknown message ID")
        if not isinstance(quote, str) or quote not in message_map[message_id]["text"]:
            raise ContractError("state evidence quote is not an exact source substring")

    evidence = packet.get("evidence")
    if not isinstance(evidence, list):
        raise ContractError("evidence must be an array")
    for span in evidence:
        message_id = span.get("message_id")
        quote = span.get("quote")
        if message_id not in message_map:
            raise ContractError("evidence cites an unknown message ID")
        if span.get("speaker") != message_map[message_id]["speaker"]:
            raise ContractError("evidence speaker does not match source")
        if not isinstance(quote, str) or quote not in message_map[message_id]["text"]:
            raise ContractError("evidence quote is not an exact source substring")

    action = packet.get("action_proposal")
    no_action = packet.get("no_action")
    if (action is None) == (no_action is None):
        raise ContractError("exactly one of action_proposal or no_action is required")
    if action is not None:
        if action.get("type") != "prepare_question":
            raise ContractError("only prepare_question proposals are allowed")
        if action.get("owner") != "recruiter":
            raise ContractError("action owner must remain the recruiter")
        if action.get("execution_authority") != "none":
            raise ContractError("the plugin has no execution authority")
        if action.get("requires_independent_human_decision") is not True:
            raise ContractError("action proposals require an independent human decision")
        action_ids = action.get("evidence_message_ids")
        if not isinstance(action_ids, list) or not action_ids:
            raise ContractError("action proposal requires evidence message IDs")
        if any(message_id not in message_map for message_id in action_ids):
            raise ContractError("action cites an unknown message ID")

    handoff = packet.get("outcome_handoff")
    if not isinstance(handoff, dict):
        raise ContractError("outcome_handoff must be an object")
    if handoff.get("confirmed_state_changed") is not False:
        raise ContractError("plugin output cannot confirm or change state")
    if handoff.get("external_effect") != "not_attempted":
        raise ContractError("plugin output cannot report an external effect")


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Analyze supplied conversation JSON without external writes."
    )
    parser.add_argument(
        "--stdin",
        action="store_true",
        help="Read one JSON object from standard input.",
    )
    return parser.parse_args()


def main() -> int:
    args = _parse_args()
    if not args.stdin:
        print("error: --stdin is required", file=sys.stderr)
        return 2
    try:
        payload = json.load(sys.stdin)
        packet = analyze(payload)
    except (json.JSONDecodeError, ContractError) as error:
        print(f"input validation failed: {error}", file=sys.stderr)
        return 2
    json.dump(packet, sys.stdout, indent=2, ensure_ascii=False)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
