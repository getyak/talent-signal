import { runPhaseOneCommand } from "./phaseOneCommand.js";

const args = process.argv.slice(2);
try {
  if (args.length !== 3 || args[1] !== "--controller-dir" || !args[2]) throw new Error("PHASE_ONE_COMMAND_INVALID");
  process.stdout.write(`${JSON.stringify(await runPhaseOneCommand([args[0]!], args[2]))}\n`);
} catch (error) {
  const code = error instanceof Error && /^(?:PHASE_ONE_|OPTIMIZATION_|OPTIMIZER_|optimization_budget:)[A-Za-z0-9_:.-]+$/.test(error.message)
    ? error.message : "PHASE_ONE_COMMAND_FAILED";
  process.stderr.write(`${code}\n`);
  process.exitCode = 1;
}
