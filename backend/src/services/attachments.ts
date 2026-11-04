import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import {
  S3Client,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export type S3AttachmentStorage = { bucket: string; client: S3Client };
export type LocalAttachmentStorage = { directory: string };
export type AttachmentStorage = S3AttachmentStorage | LocalAttachmentStorage;

export function isLocalStorage(
  storage: AttachmentStorage,
): storage is LocalAttachmentStorage {
  return "directory" in storage;
}

function resolveLocalPath(directory: string, key: string): string {
  const root = resolve(directory);
  const target = resolve(root, key);
  if (target !== root && !target.startsWith(`${root}${sep}`)) {
    throw new Error("Invalid attachment object key.");
  }
  return target;
}

export function createAttachmentStorage(
  env: NodeJS.ProcessEnv,
): AttachmentStorage | undefined {
  if (env.ATTACHMENT_DIR) {
    return { directory: resolve(env.ATTACHMENT_DIR) };
  }
  if (!env.S3_BUCKET) return undefined;
  return {
    bucket: env.S3_BUCKET,
    client: new S3Client({ region: env.AWS_REGION }),
  };
}

export function destroyAttachmentStorage(storage?: AttachmentStorage) {
  if (storage && !isLocalStorage(storage)) {
    storage.client.destroy();
  }
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
  context?: { groupId: string; attachmentId: string },
) {
  if (isLocalStorage(storage)) {
    if (!context) throw new Error("Local attachment upload requires context.");
    return `/api/groups/${context.groupId}/attachments/${context.attachmentId}/file`;
  }
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
  context?: { groupId: string; attachmentId: string },
) {
  if (isLocalStorage(storage)) {
    if (!context)
      throw new Error("Local attachment download requires context.");
    return `/api/groups/${context.groupId}/attachments/${context.attachmentId}/file`;
  }
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

export async function writeLocalObject(
  storage: LocalAttachmentStorage,
  key: string,
  body: Buffer,
  contentType: string,
) {
  const filePath = resolveLocalPath(storage.directory, key);
  const metaPath = `${filePath}.meta.json`;
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, body);
  await writeFile(
    metaPath,
    JSON.stringify({ contentType, size: body.byteLength }),
    "utf8",
  );
}

export async function readLocalObject(
  storage: LocalAttachmentStorage,
  key: string,
): Promise<Buffer> {
  const filePath = resolveLocalPath(storage.directory, key);
  try {
    return await readFile(filePath);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      throw Object.assign(new Error("NotFound"), { name: "NotFound" });
    }
    throw error;
  }
}

export async function deleteObject(storage: AttachmentStorage, key: string) {
  if (isLocalStorage(storage)) {
    const filePath = resolveLocalPath(storage.directory, key);
    await rm(filePath, { force: true });
    await rm(`${filePath}.meta.json`, { force: true });
    return;
  }
  await storage.client.send(
    new DeleteObjectCommand({ Bucket: storage.bucket, Key: key }),
  );
}

export async function inspectObject(
  storage: AttachmentStorage,
  key: string,
): Promise<{ ContentLength?: number; ContentType?: string }> {
  if (isLocalStorage(storage)) {
    const filePath = resolveLocalPath(storage.directory, key);
    try {
      const [fileStat, rawMeta] = await Promise.all([
        stat(filePath),
        readFile(`${filePath}.meta.json`, "utf8"),
      ]);
      const meta = JSON.parse(rawMeta) as {
        contentType?: string;
        size?: number;
      };
      return {
        ContentLength: fileStat.size,
        ContentType: meta.contentType,
      };
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        throw Object.assign(new Error("NotFound"), { name: "NotFound" });
      }
      throw error;
    }
  }
  return storage.client.send(
    new HeadObjectCommand({ Bucket: storage.bucket, Key: key }),
  );
}
