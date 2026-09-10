Attachment upload lifecycle
===========================

New reservations are pending and hidden from receipt lists. After uploading, the
browser calls POST /groups/:groupId/attachments/:attachmentId/complete. The API
checks S3 content length and type before publishing the receipt. Verification
errors retain the pending reference. Existing receipts remain ready after the
migration, so this cannot retroactively identify earlier incomplete uploads.

Run the maintenance command in a backend container with its normal DATABASE_URL,
S3_BUCKET, AWS region and task-role permissions:

    node dist/cleanup-attachments.js

It processes up to 100 pending reservations older than 24 hours per invocation.
Schedule this command daily in an ECS task if automatic cleanup is desired; this
change provides the command but does not provision that schedule.

Storage deletion must succeed before a reference is removed. Failed deletions
remain retryable. Finalization and cleanup lock the attachment row to avoid races.
Ready receipts and uploads less than 24 hours old are never cleanup candidates.
The upload URL expires after five minutes. Listing attachments performs no S3
calls and makes no database changes.
