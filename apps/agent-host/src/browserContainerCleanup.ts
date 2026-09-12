import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { promisify } from "node:util";
const run = promisify(execFile);
const owner = createHash("sha256").update(`${hostname()}:${process.getuid?.() ?? "unknown"}`).digest("hex");
const instance = randomUUID();
const purpose = "talent-signal.public-browser.v1";
export const browserContainerLabels = ["--label", `ts.browser.purpose=${purpose}`,
  "--label", `ts.browser.owner=${owner}`, "--label", `ts.browser.pid=${process.pid}`,
  "--label", `ts.browser.instance=${instance}`];

export async function removeBrowserContainer(name: string, env: NodeJS.ProcessEnv): Promise<void> {
  const end = Date.now() + 10_000;
  try { await run("docker", ["rm", "--force", name], { env, timeout: 8_000, maxBuffer: 4_000 }); return; }
  catch (error) {
    if (error && typeof error === "object" && "stderr" in error && String(error.stderr).includes("No such container")) return;
  }
  // Docker --rm can already be removing an exited worker. Verify disappearance
  // instead of treating "removal in progress" as either success or permanent failure.
  while (Date.now() < end) {
    try { await run("docker", ["inspect", "--format", "{{.State.Status}}", name], { env, timeout: 1_000, maxBuffer: 4_000 }); }
    catch (error) {
      if (error && typeof error === "object" && "stderr" in error && /No such (?:object|container)/u.test(String(error.stderr))) return;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error("BROWSER_CLEANUP_UNVERIFIED");
}

let startup: Promise<void> | undefined;
export function sweepAbandonedBrowserContainers(env: NodeJS.ProcessEnv): Promise<void> {
  return startup ??= (async () => {
    const { stdout } = await run("docker", ["ps", "--all", "--quiet", "--no-trunc",
      "--filter", `label=ts.browser.purpose=${purpose}`, "--filter", `label=ts.browser.owner=${owner}`],
    { env, timeout: 10_000, maxBuffer: 4_000 });
    const ids = stdout.trim().split(/\s+/u).filter(Boolean);
    if (ids.length > 32 || ids.some(id => !/^[a-f0-9]{64}$/u.test(id))) throw new Error("BROWSER_ORPHAN_INVENTORY_INVALID");
    for (const id of ids) {
      let encoded: string;
      try {
        ({ stdout: encoded } = await run("docker", ["inspect", "--format", "{{json .Config.Labels}}", id],
          { env, timeout: 2_000, maxBuffer: 8_000 }));
      } catch (error) {
        if (error && typeof error === "object" && "stderr" in error && /No such (?:object|container)/u.test(String(error.stderr))) continue;
        throw error;
      }
      const labels = JSON.parse(encoded);
      if (labels["ts.browser.owner"] !== owner || labels["ts.browser.purpose"] !== purpose
        || !/^[1-9][0-9]*$/u.test(labels["ts.browser.pid"] ?? "")
        || typeof labels["ts.browser.instance"] !== "string") continue;
      const pid = Number(labels["ts.browser.pid"]);
      let abandoned = pid === process.pid && labels["ts.browser.instance"] !== instance;
      if (pid !== process.pid) {
        try { process.kill(pid, 0); }
        catch (error) { abandoned = Boolean(error && typeof error === "object" && "code" in error && error.code === "ESRCH"); }
      }
      if (abandoned) await removeBrowserContainer(id, env);
    }
  })();
}
