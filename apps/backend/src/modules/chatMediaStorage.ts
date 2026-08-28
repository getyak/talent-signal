import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";

import type { BackendConfig } from "../config.js";

export interface StoredChatMedia {
  body: Uint8Array;
  contentType: string;
}

export interface ChatMediaStorage {
  readonly provider: "local" | "s3";
  delete(objectKey: string): Promise<void>;
  get(objectKey: string, contentType: string): Promise<StoredChatMedia>;
  put(objectKey: string, body: Uint8Array, contentType: string): Promise<void>;
}

function safeLocalPath(directory: string, objectKey: string): string {
  const root = resolve(directory);
  const target = resolve(root, objectKey);
  if (target !== root && !target.startsWith(`${root}${sep}`)) {
    throw new Error("Chat media object key escaped its configured directory.");
  }
  return target;
}

export class LocalChatMediaStorage implements ChatMediaStorage {
  readonly provider = "local" as const;

  constructor(private readonly directory: string) {}

  async put(
    objectKey: string,
    body: Uint8Array,
    _contentType: string,
  ): Promise<void> {
    const target = safeLocalPath(this.directory, objectKey);
    await mkdir(dirname(target), { recursive: true, mode: 0o700 });
    await writeFile(target, body, { mode: 0o600 });
  }

  async get(objectKey: string, contentType: string): Promise<StoredChatMedia> {
    return {
      body: await readFile(safeLocalPath(this.directory, objectKey)),
      contentType,
    };
  }

  async delete(objectKey: string): Promise<void> {
    try {
      await unlink(safeLocalPath(this.directory, objectKey));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}

export class S3ChatMediaStorage implements ChatMediaStorage {
  readonly provider = "s3" as const;
  private readonly client: S3Client;

  constructor(
    private readonly bucket: string,
    options: {
      endpoint?: string;
      forcePathStyle: boolean;
      region: string;
    },
  ) {
    this.client = new S3Client(options);
  }

  async put(
    objectKey: string,
    body: Uint8Array,
    contentType: string,
  ): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
        Body: body,
        ContentLength: body.byteLength,
        ContentType: contentType,
        ServerSideEncryption: "AES256",
      }),
    );
  }

  async get(objectKey: string, contentType: string): Promise<StoredChatMedia> {
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: objectKey }),
    );
    if (!result.Body) throw new Error("Chat media object body is unavailable.");
    return {
      body: await result.Body.transformToByteArray(),
      contentType: result.ContentType ?? contentType,
    };
  }

  async delete(objectKey: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: objectKey }),
    );
  }
}

export function createChatMediaStorage(
  config: BackendConfig,
): ChatMediaStorage {
  const storage = config.chatMediaStorage ?? {
    provider: "local" as const,
    directory: `${process.cwd()}/.data/chat-media`,
  };
  return storage.provider === "s3"
    ? new S3ChatMediaStorage(storage.bucket, storage)
    : new LocalChatMediaStorage(storage.directory);
}
