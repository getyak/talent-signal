import { createHash } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type { ScreenshotContactTaskRequest } from "@talent-signal/agent";
import { inTransaction } from "../database/pool.js";
import { ApiError } from "../lib/apiError.js";
import type { ChatMediaStorage } from "./chatMediaStorage.js";
import type { AuthContext } from "./auth.js";

export type ContactImage = ScreenshotContactTaskRequest["image"];
export type ContactImageManifest = Omit<ContactImage, "data_base64">;
interface Asset extends ContactImageManifest {
  image_index: number; object_key: string; storage_scope: string; status: string;
}
export const contactImages = (request: Pick<ScreenshotContactTaskRequest, "image" | "additional_images">) =>
  [request.image, ...(request.additional_images ?? [])];

export function validateContactImage(image: ContactImage): ContactImageManifest {
  const bytes = Buffer.from(image.data_base64, "base64");
  if (bytes.toString("base64") !== image.data_base64 || bytes.length !== image.byte_size ||
      createHash("sha256").update(bytes).digest("hex") !== image.content_hash)
    throw new ApiError(422, "CONTACT_IMAGE_INTEGRITY_MISMATCH", "Screenshot bytes do not match their manifest.");
  const valid = image.media_type === "image/png" ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
    : image.media_type === "image/jpeg" ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    : bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  if (!valid) throw new ApiError(422, "CONTACT_IMAGE_FORMAT_MISMATCH", "Screenshot format does not match the file bytes.");
  const { data_base64: _, ...manifest } = image;
  return manifest;
}

export async function reserveContactImages(client: PoolClient, auth: AuthContext, taskID: string,
  images: ContactImageManifest[], storage: ChatMediaStorage) {
  if (!storage.labScopeID) throw new Error("CONTACT_IMAGE_STORAGE_SCOPE_REQUIRED");
  for (const [index, image] of images.entries()) {
    await client.query(`INSERT INTO contact_task_images
      (account_id,task_id,image_index,object_key,storage_scope,media_type,byte_size,content_hash,expires_at)
      SELECT $1,$2,$3,$4,$5,$6,$7,$8,expires_at FROM screenshot_contact_tasks WHERE account_id=$1 AND id=$2`,
    [auth.accountId, taskID, index, `contact-sources/${auth.accountId}/${taskID}/${index}-${image.content_hash}`,
      storage.labScopeID, image.media_type, image.byte_size, image.content_hash]);
  }
}

// The manifest commits before the first PUT. Crash/unknown PUTs leave tracked,
// immutable keys; retries reconcile only this task and cleanup can always find them.
export async function persistContactImages(pool: Pool, auth: AuthContext, taskID: string,
  images: ContactImage[], storage: ChatMediaStorage): Promise<void> {
  const assets = await pool.query<Asset>(`SELECT * FROM contact_task_images WHERE account_id=$1 AND task_id=$2 ORDER BY image_index`, [auth.accountId,taskID]);
  for (const pending of assets.rows) {
    await inTransaction(pool, async client => {
      const task = await client.query(`SELECT id FROM screenshot_contact_tasks WHERE account_id=$1 AND id=$2
        AND created_by_user_id=$3 AND status<>'deleted' AND expires_at>now() FOR UPDATE`, [auth.accountId,taskID,auth.userId]);
      if (!task.rowCount) throw new ApiError(409, "CONTACT_TASK_SOURCE_UNAVAILABLE", "Screenshot source is unavailable.");
      const result = await client.query<Asset>(`SELECT * FROM contact_task_images WHERE account_id=$1 AND task_id=$2 AND image_index=$3 FOR UPDATE`, [auth.accountId,taskID,pending.image_index]);
      const asset=result.rows[0]!;
      if (asset.storage_scope !== storage.labScopeID) throw new Error("CONTACT_IMAGE_STORAGE_MISMATCH");
      if (asset.status === "stored") return;
      const image = images[asset.image_index];
      if (asset.status !== "pending" || !image || image.content_hash !== asset.content_hash) throw new Error("CONTACT_IMAGE_STORAGE_MISMATCH");
      await storage.put(asset.object_key, Buffer.from(image.data_base64, "base64"), asset.media_type);
      await client.query(`UPDATE contact_task_images SET status='stored' WHERE account_id=$1 AND task_id=$2 AND image_index=$3`, [auth.accountId,taskID,asset.image_index]);
    });
  }
  await pool.query(`UPDATE screenshot_contact_tasks SET status='running',lease_until=NULL,lease_epoch=lease_epoch+1,
    state=jsonb_set(jsonb_set(state,'{response,status}','"running"'),'{response,question}','null'),revision=revision+1,updated_at=now()
    WHERE account_id=$1 AND id=$2 AND created_by_user_id=$3 AND status='waiting_for_user' AND expires_at>now()
    AND state->'response'->>'question'='图片尚未全部保存，请重试原来的发送。'`, [auth.accountId,taskID,auth.userId]);
}

// The caller must check current task/source authority immediately before/after reading.
export async function readContactImage(pool: Pool, auth: AuthContext, taskID: string,
  index: number, storage: ChatMediaStorage): Promise<ContactImage | null> {
  const result = await pool.query<Asset>(`SELECT i.* FROM contact_task_images i JOIN screenshot_contact_tasks t
    ON t.account_id=i.account_id AND t.id=i.task_id WHERE i.account_id=$1 AND i.task_id=$2 AND i.image_index=$3
    AND t.created_by_user_id=$4 AND t.status<>'deleted' AND t.expires_at>now() AND i.expires_at>now() AND i.status='stored'`,
  [auth.accountId,taskID,index,auth.userId]);
  const asset = result.rows[0];
  if (!asset) return null;
  if (asset.storage_scope !== storage.labScopeID) throw new Error("CONTACT_IMAGE_STORAGE_MISMATCH");
  const stored = await storage.get(asset.object_key, asset.media_type);
  const image: ContactImage = {media_type: asset.media_type, byte_size: asset.byte_size, content_hash: asset.content_hash,
    data_base64: Buffer.from(stored.body).toString("base64")};
  validateContactImage(image);
  return image;
}

export async function purgeExpiredContactImages(pool: Pool, storage: ChatMediaStorage): Promise<void> {
  await pool.query(`UPDATE contact_task_images SET status='purge_pending' WHERE expires_at<=now() AND status NOT IN ('deleted','purge_pending')`);
  const assets = await pool.query<Asset & {account_id:string;task_id:string}>(`SELECT * FROM contact_task_images
    WHERE status='purge_pending' AND storage_scope=$1 LIMIT 100`, [storage.labScopeID]);
  let failed = false;
  for (const asset of assets.rows) {
    try {
      // Production S3 must remove all versions, not merely create a delete marker.
      if (!storage.purge) throw new Error("CONTACT_IMAGE_PERMANENT_PURGE_REQUIRED");
      await storage.purge(asset.object_key);
      await pool.query(`UPDATE contact_task_images SET status='deleted' WHERE account_id=$1 AND task_id=$2 AND image_index=$3 AND status='purge_pending'`,
        [asset.account_id,asset.task_id,asset.image_index]);
    } catch { failed = true; }
  }
  if (failed) throw new Error("CONTACT_IMAGE_PURGE_INCOMPLETE");
}
