import { request as httpRequest } from "node:http";
import { isAbsolute } from "node:path";
import { ContactResearchToolRequestSchema, ContactResearchToolResponseSchema, type ContactResearchToolResponse } from "@talent-signal/agent";

export interface ContactResearchClient {
  execute(input: unknown, signal: AbortSignal): Promise<ContactResearchToolResponse>;
}

export class LocalContactResearchClient implements ContactResearchClient {
  constructor(private readonly socketPath: string) {
    if (!isAbsolute(socketPath)) throw new Error("CONTACT_RESEARCH_SOCKET_INVALID");
  }
  async execute(input: unknown, signal: AbortSignal) {
    const parsed = ContactResearchToolRequestSchema.parse(input);
    const payload = Buffer.from(JSON.stringify(parsed));
    const body = await new Promise<string>((accept, reject) => {
      const req = httpRequest({ socketPath: this.socketPath, path: "/v1/contact-research/tools",
        method: "POST", signal, timeout: 35_000,
        headers: { "content-type": "application/json", "content-length": payload.byteLength } }, (response) => {
        let size = 0;
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > 1_000_000) response.destroy(new Error("CONTACT_RESEARCH_RESPONSE_TOO_LARGE"));
          else chunks.push(chunk);
        });
        response.on("error", reject);
        response.on("end", () => {
          if (response.statusCode !== 200) reject(new Error(`CONTACT_RESEARCH_HTTP_${response.statusCode}`));
          else accept(Buffer.concat(chunks).toString("utf8"));
        });
      });
      req.on("error", reject);
      req.on("timeout", () => req.destroy(new Error("CONTACT_RESEARCH_TIMEOUT")));
      req.end(payload);
    });
    const result = ContactResearchToolResponseSchema.parse(JSON.parse(body));
    if (result.task_id !== parsed.task_id || result.call_id !== parsed.call_id) throw new Error("CONTACT_RESEARCH_IDENTITY_MISMATCH");
    return result;
  }
}
