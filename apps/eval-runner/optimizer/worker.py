"""Bounded deterministic coordinate search. No SDK, network, files, or model calls.

The parent owns corpus access and all evaluations. This worker receives only
allowlisted candidate fields and approved dev demonstration identifiers.
"""
import copy
import json
import math
import sys

VERSION = "bounded-coordinate-search.v1"
MAX_LINE = 65536


def read_message():
    line = sys.stdin.buffer.readline(MAX_LINE + 1)
    if not line or len(line) > MAX_LINE:
        raise ValueError("invalid_protocol_input")
    return json.loads(line)


def emit(value):
    print(json.dumps(value, separators=(",", ":")), flush=True)


def validate_candidate(candidate, allowed):
    if not isinstance(candidate, dict) or set(candidate) != {"schemaVersion", "taskFragmentId", "exampleIds"}:
        raise ValueError("forbidden_mutation")
    if candidate["schemaVersion"] != "optimization-candidate.v1" or candidate["taskFragmentId"] not in ("baseline", "concise", "evidence_first"):
        raise ValueError("forbidden_mutation")
    ids = candidate["exampleIds"]
    if not isinstance(ids, list) or len(ids) > 2 or any(not isinstance(item, str) for item in ids) or len(set(ids)) != len(ids) or any(item not in allowed for item in ids):
        raise ValueError("forbidden_example")


def search(init, evaluate):
    if not isinstance(init, dict) or set(init) != {"type", "version", "baseline", "devExampleIds", "maximumTrials"} or init["type"] != "init" or init["version"] != VERSION:
        raise ValueError("invalid_initialization")
    allowed = init["devExampleIds"]
    if not isinstance(allowed, list) or len(allowed) > 16 or any(not isinstance(item, str) for item in allowed) or len(set(allowed)) != len(allowed):
        raise ValueError("invalid_dev_examples")
    maximum = init["maximumTrials"]
    if type(maximum) is not int or not 1 <= maximum <= 32:
        raise ValueError("invalid_trial_limit")
    validate_candidate(init["baseline"], allowed)
    baseline = copy.deepcopy(init["baseline"])
    best = copy.deepcopy(baseline)
    best_score = None
    baseline_score = None
    seen = set()
    trials = 0

    def assess(candidate):
        nonlocal trials, best, best_score, baseline_score
        validate_candidate(candidate, allowed)
        key = json.dumps(candidate, sort_keys=True)
        if key in seen:
            return
        seen.add(key)
        response = evaluate(copy.deepcopy(candidate), trials)
        if not isinstance(response, dict) or set(response) != {"score", "hardGate"} or type(response["hardGate"]) is not bool or type(response["score"]) not in (float, int) or not math.isfinite(response["score"]) or not 0 <= response["score"] <= 1:
            raise ValueError("invalid_evaluation")
        score = response["score"] if response["hardGate"] else -1
        if trials == 0:
            baseline_score = score
            best_score = score
        elif score > best_score:
            best_score = score
            best = copy.deepcopy(candidate)
        trials += 1

    assess(baseline)
    # One pass of coordinate search: task guidance, then individual approved dev
    # demonstrations. Ties retain the current incumbent; baseline remains valid.
    mutations = [("taskFragmentId", value) for value in ("baseline", "concise", "evidence_first")]
    mutations += [("exampleIds", value) for value in [[]] + [[item] for item in allowed]]
    exhausted = False
    for field, value in mutations:
        candidate = copy.deepcopy(best)
        candidate[field] = copy.deepcopy(value)
        if json.dumps(candidate, sort_keys=True) in seen:
            continue
        if trials >= maximum:
            exhausted = True
            break
        assess(candidate)
    return {"type": "completed", "version": VERSION, "best": best, "trials": trials,
            "improved": best_score > baseline_score,
            "stopReason": "trial_limit" if exhausted else "search_exhausted"}


def main():
    if sys.version_info < (3, 11):
        raise ValueError("python_3_11_required")
    init = read_message()

    def evaluate(candidate, trial):
        emit({"type": "evaluate", "trial": trial, "candidate": candidate})
        response = read_message()
        if not isinstance(response, dict) or set(response) != {"type", "trial", "result"} or response["type"] != "evaluation" or response["trial"] != trial:
            raise ValueError("invalid_evaluation_response")
        return response["result"]

    emit(search(init, evaluate))


if __name__ == "__main__":
    try:
        main()
    except (ValueError, KeyError, TypeError, OverflowError):
        emit({"type": "failed", "reason": "worker_protocol_invalid"})
        sys.exit(2)
