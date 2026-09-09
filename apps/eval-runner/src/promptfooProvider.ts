import { createHash } from "node:crypto";
import { TalentSignalClient, TalentSignalHttpError, type LabJob, type LabJobRequest } from "@talent-signal/contracts";

/** Promptfoo JS provider; delegates every execution to the existing Lab runner.
 * https://www.promptfoo.dev/docs/providers/custom-api/
 * Two provider entries (configurationIndex 0/1) share a persisted comparison job.
 */
export default class TalentSignalPromptfooProvider {
  private readonly client: TalentSignalClient;
  constructor(private readonly options: { id?: string; config: { backendURL: string; runKey: string;
    configurationIndex: 0 | 1; configurations: LabJobRequest["configurations"]; timeoutMs?: number } }) {
    if (!options.config.runKey.trim()) throw new Error("Set a unique runKey for each intended experiment; reuse it only for retries.");
    const token = process.env.TALENT_SIGNAL_EVAL_TOKEN;
    if (!token) throw new Error("TALENT_SIGNAL_EVAL_TOKEN is required.");
    const url = new URL(options.config.backendURL);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost","127.0.0.1","[::1]"].includes(url.hostname)))
      throw new Error("Use the configured Talent Signal backend URL.");
    this.client = new TalentSignalClient(url.origin,token);
  }
  id() { return this.options.id ?? `talent-signal-lab-${this.options.config.configurationIndex}`; }
  async callApi(prompt: string) {
    try {
      const reference = JSON.parse(prompt) as { id:string; content_hash:string };
      const regression = await this.client.getLabRegression(reference.id);
      if (regression.regression.content_hash !== reference.content_hash) throw new Error("The original regression changed.");
      const catalog = await this.client.getLabJobCatalog();
      const hash = createHash("sha256").update(JSON.stringify([this.options.config.runKey,reference,this.options.config.configurations])).digest("hex");
      const id = `${hash.slice(0,8)}-${hash.slice(8,12)}-4${hash.slice(13,16)}-a${hash.slice(17,20)}-${hash.slice(20,32)}`;
      const config = this.options.config;
      const deadline=Date.now()+Math.min(config.timeoutMs ?? 300_000,600_000);
      let job: LabJob | undefined;
      while (!job) {
        try { job=(await this.client.getLabJob(id)).job; }
        catch(error) {
          if (!(error instanceof TalentSignalHttpError) || error.status!==404) throw error;
          try { job=(await this.client.startLabJob({ id,catalog_revision:catalog.catalog_revision,
            task:regression.regression.snapshot.task ?? "relationship_text",case_ids:[regression.regression.snapshot.case.id],
            configurations:config.configurations,repetitions:1,call_limit:2,regression_source:reference })).job; }
          catch(error) {
            if (!(error instanceof TalentSignalHttpError) || error.code!=="LAB_EXPERIMENT_BUSY") throw error;
            if(Date.now()>=deadline) throw new Error("Another Lab experiment is still running. Retry with the same runKey.");
            await new Promise(resolve=>setTimeout(resolve,1000));
          }
        }
      }
      while (["queued","running","cancelling"].includes(job.status)) {
        if (Date.now()>=deadline) return {error:`Lab job ${id} is still pending; retry with the same runKey.`,metadata:{job_id:id}};
        await new Promise(resolve=>setTimeout(resolve,1000));
        job=(await this.client.getLabJob(id)).job;
      }
      const attempt=job.attempts.find(item=>item.configuration_index===config.configurationIndex);
      if (!attempt || attempt.status!=="completed" || attempt.error_code || !attempt.answer)
        return {error:attempt?.error_code ?? `Lab execution ${attempt?.status ?? job.status}`,metadata:{job_id:id}};
      return {output:attempt.answer,metadata:{job_id:id,attempt_id:attempt.id,regression_id:reference.id,
        input_hash:regression.regression.snapshot.case.input_hash,output_version:regression.regression.snapshot.case.revision,
        actual_model:attempt.actual_model,actual_prompt_revision:attempt.actual_prompt_revision,
        checks:attempt.checks,quality:job.quality,feedback_is_gold:false},
        ...(attempt.input_tokens!==null && attempt.output_tokens!==null ? {tokenUsage:{prompt:attempt.input_tokens,
          completion:attempt.output_tokens,total:attempt.input_tokens+attempt.output_tokens}} : {})};
    } catch(error) { return {error:error instanceof Error?error.message:"Lab execution unavailable"}; }
  }
}
