import type {
  OpikAnnotationQueue,
  OpikAnnotationQueueTransport,
  OpikAnnotationTrace,
  OpikCategoricalFeedbackDefinition,
} from "./bootstrapAnnotationQueue.js";

interface Page<T> {
  content?: T[];
}

export interface RestOpikAnnotationTransportOptions {
  apiUrl: string;
  apiKey?: string;
  workspaceName?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export class RestOpikAnnotationTransport implements OpikAnnotationQueueTransport {
  private readonly apiUrl: string;
  private readonly headers: Record<string, string>;

  constructor(options: RestOpikAnnotationTransportOptions) {
    const url = new URL(options.apiUrl);
    if (!new Set(["http:", "https:"]).has(url.protocol)) {
      throw new Error("OPIK_ANNOTATION_URL_INVALID: expected HTTP or HTTPS");
    }
    this.apiUrl = url.toString().replace(/\/$/, "");
    this.headers = {
      Accept: "application/json",
      ...(options.apiKey ? { Authorization: options.apiKey } : {}),
      ...(options.workspaceName ? { "Comet-Workspace": options.workspaceName } : {}),
    };
  }

  private async request(path: string, init?: RequestInit): Promise<unknown> {
    const response = await fetch(`${this.apiUrl}${path}`, {
      ...init,
      headers: {
        ...this.headers,
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
      },
      signal: AbortSignal.timeout(10_000),
    });
    const body = await response.text();
    if (!response.ok) {
      throw new Error(`OPIK_ANNOTATION_HTTP_${response.status}: ${body.slice(0, 500)}`);
    }
    return body.length === 0 ? undefined : (JSON.parse(body) as unknown);
  }

  async listFeedbackDefinitions(): Promise<OpikCategoricalFeedbackDefinition[]> {
    const page = (await this.request(
      "/v1/private/feedback-definitions?size=1000&page=1",
    )) as Page<OpikCategoricalFeedbackDefinition>;
    return (page.content ?? []).filter((item) => item.type === "categorical");
  }

  async createFeedbackDefinition(definition: OpikCategoricalFeedbackDefinition): Promise<void> {
    await this.request("/v1/private/feedback-definitions", {
      method: "POST",
      body: JSON.stringify(definition),
    });
  }

  async listAnnotationQueues(projectId: string): Promise<OpikAnnotationQueue[]> {
    const query = new URLSearchParams({ project_id: projectId, size: "1000", page: "1" });
    const page = (await this.request(
      `/v1/private/annotation-queues?${query.toString()}`,
    )) as Page<OpikAnnotationQueue>;
    return (page.content ?? []).filter((item) => item.project_id === projectId);
  }

  async createAnnotationQueue(
    queue: Omit<OpikAnnotationQueue, "id" | "items_count">,
  ): Promise<void> {
    await this.request("/v1/private/annotation-queues", {
      method: "POST",
      body: JSON.stringify(queue),
    });
  }

  async getTrace(traceId: string): Promise<OpikAnnotationTrace> {
    const value = await this.request(`/v1/private/traces/${encodeURIComponent(traceId)}`);
    if (!isRecord(value) || typeof value.id !== "string") {
      throw new Error(`OPIK_ANNOTATION_TRACE_READBACK_INVALID: ${traceId}`);
    }
    return value as unknown as OpikAnnotationTrace;
  }

  async listAnnotationQueueItemIds(projectId: string, queueId: string): Promise<string[]> {
    const query = new URLSearchParams({
      project_id: projectId,
      annotation_queue_id: queueId,
      size: "15000",
      page: "1",
      truncate: "true",
      strip_attachments: "true",
    });
    const page = (await this.request(`/v1/private/traces/?${query.toString()}`)) as Page<{
      id?: string;
    }>;
    return (page.content ?? []).flatMap((item) => (typeof item.id === "string" ? [item.id] : []));
  }

  async addAnnotationQueueItems(queueId: string, traceIds: string[]): Promise<void> {
    await this.request(
      `/v1/private/annotation-queues/${encodeURIComponent(queueId)}/items/add`,
      { method: "POST", body: JSON.stringify({ ids: traceIds }) },
    );
  }
}
