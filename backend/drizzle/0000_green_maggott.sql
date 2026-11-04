CREATE TABLE `group_access` (
	`groupId` text NOT NULL,
	`subject` text NOT NULL,
	`role` text NOT NULL,
	`email` text,
	PRIMARY KEY(`groupId`, `subject`),
	FOREIGN KEY (`groupId`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "valid_role" CHECK("group_access"."role" in ('admin','editor','viewer'))
);
--> statement-breakpoint
CREATE TABLE `attachments` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))) NOT NULL,
	`groupId` text NOT NULL,
	`entryId` text NOT NULL,
	`objectKey` text NOT NULL,
	`uploadState` text DEFAULT 'ready' NOT NULL,
	`fileName` text NOT NULL,
	`contentType` text NOT NULL,
	`size` integer NOT NULL,
	`createdBy` text NOT NULL,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`groupId`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`groupId`,`entryId`) REFERENCES `entries`(`groupId`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attachments_objectKey_unique` ON `attachments` (`objectKey`);--> statement-breakpoint
CREATE INDEX `attachments_entry` ON `attachments` (`groupId`,`entryId`);--> statement-breakpoint
CREATE TABLE `categories` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))) NOT NULL,
	`groupId` text NOT NULL,
	`name` text NOT NULL,
	`archivedAt` integer,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`groupId`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `categories_group` ON `categories` (`groupId`,`archivedAt`);--> statement-breakpoint
CREATE UNIQUE INDEX `category_group_id` ON `categories` (`groupId`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `category_group_name` ON `categories` (`groupId`,`name`);--> statement-breakpoint
CREATE TABLE `draft_requests` (
	`groupId` text NOT NULL,
	`key` text NOT NULL,
	`actor` text NOT NULL,
	`requestHash` text NOT NULL,
	`result` text NOT NULL,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	PRIMARY KEY(`groupId`, `key`),
	FOREIGN KEY (`groupId`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `draft_revisions` (
	`groupId` text NOT NULL,
	`draftId` text NOT NULL,
	`version` integer NOT NULL,
	`input` text NOT NULL,
	`state` text NOT NULL,
	`actor` text NOT NULL,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	PRIMARY KEY(`draftId`, `version`),
	FOREIGN KEY (`groupId`,`draftId`) REFERENCES `drafts`(`groupId`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `drafts` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))) NOT NULL,
	`groupId` text NOT NULL,
	`input` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`state` text DEFAULT 'draft' NOT NULL,
	`postedEntryId` text,
	`createdBy` text NOT NULL,
	`updatedBy` text NOT NULL,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`groupId`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`groupId`,`postedEntryId`) REFERENCES `entries`(`groupId`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "draft_state" CHECK("drafts"."state" in ('draft','posted','discarded')),
	CONSTRAINT "draft_version" CHECK("drafts"."version" > 0),
	CONSTRAINT "draft_posted_link" CHECK(("drafts"."state" = 'posted') = ("drafts"."postedEntryId" is not null))
);
--> statement-breakpoint
CREATE INDEX `drafts_group_state` ON `drafts` (`groupId`,`state`);--> statement-breakpoint
CREATE UNIQUE INDEX `draft_group_id` ON `drafts` (`groupId`,`id`);--> statement-breakpoint
CREATE TABLE `entry_effects` (
	`groupId` text NOT NULL,
	`entryId` text NOT NULL,
	`memberId` text NOT NULL,
	`allocatedIncome` integer NOT NULL,
	`allocatedExpense` integer NOT NULL,
	`activityCash` integer NOT NULL,
	`transferCash` integer NOT NULL,
	`settlementCash` integer NOT NULL,
	`obligation` integer NOT NULL,
	`correction` integer NOT NULL,
	PRIMARY KEY(`entryId`, `memberId`),
	FOREIGN KEY (`groupId`,`entryId`) REFERENCES `entries`(`groupId`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`groupId`,`memberId`) REFERENCES `members`(`groupId`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `effects_group_member` ON `entry_effects` (`groupId`,`memberId`);--> statement-breakpoint
CREATE TABLE `entries` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))) NOT NULL,
	`groupId` text NOT NULL,
	`kind` text NOT NULL,
	`description` text NOT NULL,
	`date` text NOT NULL,
	`amount` integer NOT NULL,
	`input` text NOT NULL,
	`actor` text NOT NULL,
	`idempotencyKey` text NOT NULL,
	`requestHash` text NOT NULL,
	`reverses` text,
	`refundOf` text,
	`corrects` text,
	`correctionReason` text,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`groupId`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`groupId`,`reverses`) REFERENCES `entries`(`groupId`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`groupId`,`refundOf`) REFERENCES `entries`(`groupId`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`groupId`,`corrects`) REFERENCES `entries`(`groupId`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "positive_amount" CHECK("entries"."amount" > 0),
	CONSTRAINT "entry_kind" CHECK("entries"."kind" in ('income','expense','obligation','transfer','settlement','adjustment','reversal','refund'))
);
--> statement-breakpoint
CREATE INDEX `entries_refund_of` ON `entries` (`refundOf`);--> statement-breakpoint
CREATE INDEX `entries_group_date` ON `entries` (`groupId`,`date`);--> statement-breakpoint
CREATE UNIQUE INDEX `entry_group_id` ON `entries` (`groupId`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `entry_request` ON `entries` (`groupId`,`idempotencyKey`);--> statement-breakpoint
CREATE UNIQUE INDEX `one_reversal` ON `entries` (`reverses`);--> statement-breakpoint
CREATE UNIQUE INDEX `one_correction` ON `entries` (`corrects`);--> statement-breakpoint
CREATE TABLE `financial_requests` (
	`groupId` text NOT NULL,
	`key` text NOT NULL,
	`actor` text NOT NULL,
	`requestHash` text NOT NULL,
	`entryIds` text NOT NULL,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	PRIMARY KEY(`groupId`, `key`),
	FOREIGN KEY (`groupId`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `groups` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))) NOT NULL,
	`name` text NOT NULL,
	`currency` text NOT NULL,
	`defaultSplitMethod` text DEFAULT 'equal' NOT NULL,
	`managementVersion` integer DEFAULT 0 NOT NULL,
	`ledgerVersion` integer DEFAULT 0 NOT NULL,
	`openingBalance` integer DEFAULT 0 NOT NULL,
	`openingBalanceDate` text,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	CONSTRAINT "supported_currency" CHECK("groups"."currency" in ('USD', 'EUR', 'GBP', 'CAD', 'AUD')),
	CONSTRAINT "default_split_method" CHECK("groups"."defaultSplitMethod" in ('equal','weights','percentages','exact'))
);
--> statement-breakpoint
CREATE TABLE `historical_reports` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))) NOT NULL,
	`groupId` text NOT NULL,
	`title` text NOT NULL,
	`fileName` text NOT NULL,
	`source` text NOT NULL,
	`sourceHash` text NOT NULL,
	`currency` text NOT NULL,
	`report` text NOT NULL,
	`createdBy` text NOT NULL,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`groupId`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `historical_reports_group` ON `historical_reports` (`groupId`,`createdAt`);--> statement-breakpoint
CREATE UNIQUE INDEX `historical_report_source` ON `historical_reports` (`groupId`,`sourceHash`);--> statement-breakpoint
CREATE TABLE `import_batches` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))) NOT NULL,
	`groupId` text NOT NULL,
	`createdBy` text NOT NULL,
	`rowCount` integer NOT NULL,
	`requestHash` text,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`groupId`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `import_batches_group_created` ON `import_batches` (`groupId`,`createdAt`);--> statement-breakpoint
CREATE TABLE `invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`groupId` text NOT NULL,
	`memberId` text NOT NULL,
	`email` text NOT NULL,
	`role` text NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`createdBy` text NOT NULL,
	`acceptedBy` text,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	`expiresAt` integer NOT NULL,
	`delivery` text DEFAULT 'link' NOT NULL,
	FOREIGN KEY (`groupId`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`groupId`,`memberId`) REFERENCES `members`(`groupId`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "invitation_role" CHECK("invitations"."role" in ('admin','editor','viewer')),
	CONSTRAINT "invitation_state" CHECK("invitations"."state" in ('pending','accepted','revoked')),
	CONSTRAINT "invitation_delivery" CHECK("invitations"."delivery" in ('link','sending','sent','failed'))
);
--> statement-breakpoint
CREATE INDEX `invitations_group` ON `invitations` (`groupId`,`createdAt`);--> statement-breakpoint
CREATE TABLE `management_events` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))) NOT NULL,
	`groupId` text NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`details` text NOT NULL,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`groupId`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `management_events_group` ON `management_events` (`groupId`,`createdAt`);--> statement-breakpoint
CREATE TABLE `management_requests` (
	`groupId` text NOT NULL,
	`key` text NOT NULL,
	`actor` text NOT NULL,
	`requestHash` text NOT NULL,
	`result` text NOT NULL,
	PRIMARY KEY(`groupId`, `key`),
	FOREIGN KEY (`groupId`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `members` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))) NOT NULL,
	`groupId` text NOT NULL,
	`name` text NOT NULL,
	`archivedAt` integer,
	`linkedSubject` text,
	FOREIGN KEY (`groupId`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`groupId`,`linkedSubject`) REFERENCES `group_access`(`groupId`,`subject`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `member_group_id` ON `members` (`groupId`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `member_linked_account` ON `members` (`groupId`,`linkedSubject`);--> statement-breakpoint
CREATE TABLE `notification_dismissals` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))) NOT NULL,
	`groupId` text NOT NULL,
	`subject` text NOT NULL,
	`notificationType` text NOT NULL,
	`notificationId` text NOT NULL,
	`dismissedAt` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`groupId`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notification_dismissal_key` ON `notification_dismissals` (`groupId`,`subject`,`notificationType`,`notificationId`);--> statement-breakpoint
CREATE TABLE `financial_previews` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))) NOT NULL,
	`groupId` text NOT NULL,
	`actor` text NOT NULL,
	`requestHash` text NOT NULL,
	`ledgerVersion` integer NOT NULL,
	`expiresAt` integer NOT NULL,
	FOREIGN KEY (`groupId`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `previews_expiry` ON `financial_previews` (`expiresAt`);--> statement-breakpoint
CREATE UNIQUE INDEX `preview_group_id` ON `financial_previews` (`groupId`,`id`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))) NOT NULL,
	`groupId` text NOT NULL,
	`name` text NOT NULL,
	`archivedAt` integer,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`groupId`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `projects_group` ON `projects` (`groupId`,`archivedAt`);--> statement-breakpoint
CREATE UNIQUE INDEX `project_group_id` ON `projects` (`groupId`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `project_group_name` ON `projects` (`groupId`,`name`);--> statement-breakpoint
CREATE TABLE `recurring_transactions` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))) NOT NULL,
	`groupId` text NOT NULL,
	`name` text NOT NULL,
	`input` text NOT NULL,
	`frequency` text NOT NULL,
	`nextRun` text NOT NULL,
	`anchorDay` integer,
	`active` integer DEFAULT 1 NOT NULL,
	`createdBy` text NOT NULL,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`groupId`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "recurring_frequency" CHECK("recurring_transactions"."frequency" in ('weekly','monthly','quarterly','yearly')),
	CONSTRAINT "recurring_active" CHECK("recurring_transactions"."active" in (0, 1))
);
--> statement-breakpoint
CREATE INDEX `recurring_group_next_run` ON `recurring_transactions` (`groupId`,`active`,`nextRun`);--> statement-breakpoint
CREATE UNIQUE INDEX `recurring_group_id` ON `recurring_transactions` (`groupId`,`id`);--> statement-breakpoint
CREATE TABLE `split_templates` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))) NOT NULL,
	`groupId` text NOT NULL,
	`name` text NOT NULL,
	`method` text NOT NULL,
	`shares` text NOT NULL,
	`archivedAt` integer,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`groupId`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "split_template_method" CHECK("split_templates"."method" in ('equal','weights','percentages','exact'))
);
--> statement-breakpoint
CREATE INDEX `split_templates_group` ON `split_templates` (`groupId`,`archivedAt`);--> statement-breakpoint
CREATE UNIQUE INDEX `split_template_group_id` ON `split_templates` (`groupId`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `split_template_group_name` ON `split_templates` (`groupId`,`name`);--> statement-breakpoint
CREATE TABLE `user_preferences` (
	`subject` text PRIMARY KEY NOT NULL,
	`notifications` text NOT NULL,
	`updatedAt` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `user_sessions` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))) NOT NULL,
	`userId` text NOT NULL,
	`tokenHash` text NOT NULL,
	`expiresAt` integer NOT NULL,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_sessions_tokenHash_unique` ON `user_sessions` (`tokenHash`);--> statement-breakpoint
CREATE INDEX `user_sessions_user` ON `user_sessions` (`userId`);--> statement-breakpoint
CREATE INDEX `user_sessions_expiry` ON `user_sessions` (`expiresAt`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))) NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`passwordHash` text NOT NULL,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);