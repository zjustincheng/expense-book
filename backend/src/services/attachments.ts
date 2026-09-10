import { randomUUID } from "node:crypto";
import {
  S3Client,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export type AttachmentStorage = { bucket: string; client: S3Client };
export function createAttachmentStorage(
  env: NodeJS.ProcessEnv,
): AttachmentStorage | undefined {
  if (!env.S3_BUCKET) return undefined;
  return {
    bucket: env.S3_BUCKET,
    client: new S3Client({ region: env.AWS_REGION }),
  };
}
export function objectKey(groupId: string, entryId: string, fileName: string) {
  const extension =
    fileName.toLowerCase().match(/\.[a-z0-9]{1,10}$/)?.[0] ?? "";
  return `groups/${groupId}/entries/${entryId}/${randomUUID()}${extension}`;
}
export async function uploadUrl(
  storage: AttachmentStorage,
  key: string,
  contentType: string,
  size: number,
) {
  return getSignedUrl(
    storage.client,
    new PutObjectCommand({
      Bucket: storage.bucket,
      Key: key,
      ContentType: contentType,
      ContentLength: size,
    }),
    { expiresIn: 300 },
  );
}
export async function downloadUrl(
  storage: AttachmentStorage,
  key: string,
  fileName: string,
) {
  return getSignedUrl(
    storage.client,
    new GetObjectCommand({
      Bucket: storage.bucket,
      Key: key,
      ResponseContentDisposition: `attachment; filename="${fileName.replaceAll('"', "")}"`,
    }),
    { expiresIn: 300 },
  );
}
export async function deleteObject(storage: AttachmentStorage, key: string) {
  await storage.client.send(
    new DeleteObjectCommand({ Bucket: storage.bucket, Key: key }),
  );
}
export async function inspectObject(storage: AttachmentStorage, key: string) {
  return storage.client.send(
    new HeadObjectCommand({ Bucket: storage.bucket, Key: key }),
  );
}
