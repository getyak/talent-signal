import copy
import unittest
from worker import search, VERSION

BASELINE = {"schemaVersion": "optimization-candidate.v1", "taskFragmentId": "baseline", "exampleIds": []}


class WorkerTests(unittest.TestCase):
    def init(self, maximum=12):
        return {"type": "init", "version": VERSION, "baseline": copy.deepcopy(BASELINE), "devExampleIds": ["dev-1"], "maximumTrials": maximum}

    def test_coordinate_search_retains_baseline_on_ties(self):
        report = search(self.init(), lambda c, t: {"score": 0.5, "hardGate": True})
        self.assertEqual(report["best"], BASELINE)
        self.assertFalse(report["improved"])
        self.assertEqual(report["stopReason"], "search_exhausted")

    def test_bounded_search_selects_only_safe_improvement(self):
        calls = []
        def evaluate(candidate, trial):
            calls.append(candidate)
            return {"score": 1 if candidate["taskFragmentId"] == "concise" else 0.5, "hardGate": candidate["taskFragmentId"] != "concise"}
        report = search(self.init(2), evaluate)
        self.assertEqual(len(calls), 2)
        self.assertEqual(report["best"], BASELINE)
        self.assertEqual(report["stopReason"], "trial_limit")

    def test_forbidden_scope_mutations_rejected_before_evaluation(self):
        for field in ("rules", "identity", "authorization", "oracle", "rubric", "tools", "release", "holdout"):
            init = self.init()
            init["baseline"][field] = "override"
            with self.assertRaises(ValueError):
                search(init, lambda c, t: self.fail("must not evaluate"))

    def test_no_hidden_partitions_or_invalid_scores(self):
        init = self.init()
        init["holdout"] = ["secret"]
        with self.assertRaises(ValueError):
            search(init, lambda c, t: self.fail("must not evaluate"))
        for score in (float("nan"), -0.1, 1.1, True):
            with self.assertRaises(ValueError):
                search(self.init(), lambda c, t: {"score": score, "hardGate": True})


if __name__ == "__main__":
    unittest.main()
