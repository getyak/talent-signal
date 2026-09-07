import { readFileSync } from "node:fs";
import { FileOptimizationBudgetLedger } from "./budget.ts";

// Keep executable code fixed: paths, clock values, and ledger requests arrive
// only as JSON data, including when a test supplies code-like characters.
const input = JSON.parse(readFileSync(0, "utf8"));
const ledger = new FileOptimizationBudgetLedger({ path: input.ledgerPath, clock: () => new Date(input.now) });
try {
  switch (input.action) {
    case "register_candidate":
    case "reserve":
      try {
        if (input.action === "register_candidate") {
          ledger.registerCandidate(input.request);
          console.log("admitted");
        } else {
          ledger.reserve(input.request);
          console.log("reserved");
        }
      } catch (error) {
        if (typeof error?.code !== "string") throw error;
        console.log(error.code);
      }
      break;
    case "acquire_controller_and_crash":
      ledger.acquireRunController(input.runId, input.ownerId);
      process.kill(process.pid, "SIGKILL");
      break;
    case "issue_and_crash":
      ledger.reserve(input.request);
      ledger.issue(input.request);
      process.kill(process.pid, "SIGKILL");
      break;
    default:
      throw new Error("unknown_budget_worker_action");
  }
} finally {
  ledger.close();
}
