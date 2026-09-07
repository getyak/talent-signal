import { runPhaseOneDatasetLifecycleCommand, type PhaseOneDatasetRequest } from "./phaseOneDatasetLifecycle.js";

try {
  const args = process.argv.slice(2);
  if (args.length !== 3 || args[1] !== "--controller-dir" || !args[2]) throw new Error("PHASE_ONE_DATASET_COMMAND_INVALID");
  let body = "";
  if (args[0] !== "inspect") for await (const chunk of process.stdin) {
    body += String(chunk); if (Buffer.byteLength(body) > 5_000_000) throw new Error("PHASE_ONE_DATASET_REQUEST_TOO_LARGE");
  }
  const request = body ? JSON.parse(body) as PhaseOneDatasetRequest : undefined;
  process.stdout.write(`${JSON.stringify(await runPhaseOneDatasetLifecycleCommand(args[0]!, args[2], request))}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error && /^(?:PHASE_ONE_|OPTIMIZATION_)[A-Z0-9_]+$/.test(error.message) ? error.message : "PHASE_ONE_DATASET_COMMAND_FAILED"}\n`);
  process.exitCode = 1;
}
