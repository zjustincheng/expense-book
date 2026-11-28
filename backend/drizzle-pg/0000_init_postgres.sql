CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"passwordHash" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" uuid NOT NULL,
	"tokenHash" text NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_sessions_tokenHash_unique" UNIQUE("tokenHash")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"currency" text NOT NULL,
	"defaultSplitMethod" text DEFAULT 'equal' NOT NULL,
	"managementVersion" integer DEFAULT 0 NOT NULL,
	"ledgerVersion" bigint DEFAULT 0 NOT NULL,
	"openingBalance" bigint DEFAULT 0 NOT NULL,
	"openingBalanceDate" date,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "supported_currency" CHECK ("groups"."currency" in ('USD', 'EUR', 'GBP', 'CAD', 'AUD')),
	CONSTRAINT "default_split_method" CHECK ("groups"."defaultSplitMethod" in ('equal','weights','percentages','exact'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "historical_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"groupId" uuid NOT NULL,
	"title" text NOT NULL,
	"fileName" text NOT NULL,
	"source" text NOT NULL,
	"sourceHash" text NOT NULL,
	"currency" text NOT NULL,
	"report" jsonb NOT NULL,
	"createdBy" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "historical_report_source" UNIQUE("groupId","sourceHash")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "group_access" (
	"groupId" uuid NOT NULL,
	"subject" text NOT NULL,
	"role" text NOT NULL,
	"email" text,
	CONSTRAINT "group_access_groupId_subject_pk" PRIMARY KEY("groupId","subject"),
	CONSTRAINT "valid_role" CHECK ("group_access"."role" in ('admin','editor','viewer'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_preferences" (
	"subject" text PRIMARY KEY NOT NULL,
	"notifications" jsonb NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"groupId" uuid NOT NULL,
	"name" text NOT NULL,
	"archivedAt" timestamp with time zone,
	"linkedSubject" text,
	CONSTRAINT "member_group_id" UNIQUE("groupId","id"),
	CONSTRAINT "member_linked_account" UNIQUE("groupId","linkedSubject")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"groupId" uuid NOT NULL,
	"name" text NOT NULL,
	"archivedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_group_id" UNIQUE("groupId","id"),
	CONSTRAINT "project_group_name" UNIQUE("groupId","name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"groupId" uuid NOT NULL,
	"name" text NOT NULL,
	"archivedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "category_group_id" UNIQUE("groupId","id"),
	CONSTRAINT "category_group_name" UNIQUE("groupId","name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "split_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"groupId" uuid NOT NULL,
	"name" text NOT NULL,
	"method" text NOT NULL,
	"shares" jsonb NOT NULL,
	"archivedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "split_template_group_id" UNIQUE("groupId","id"),
	CONSTRAINT "split_template_group_name" UNIQUE("groupId","name"),
	CONSTRAINT "split_template_method" CHECK ("split_templates"."method" in ('equal','weights','percentages','exact'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "recurring_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"groupId" uuid NOT NULL,
	"name" text NOT NULL,
	"input" jsonb NOT NULL,
	"frequency" text NOT NULL,
	"nextRun" date NOT NULL,
	"anchorDay" integer,
	"active" integer DEFAULT 1 NOT NULL,
	"createdBy" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recurring_group_id" UNIQUE("groupId","id"),
	CONSTRAINT "recurring_frequency" CHECK ("recurring_transactions"."frequency" in ('weekly','monthly','quarterly','yearly')),
	CONSTRAINT "recurring_active" CHECK ("recurring_transactions"."active" in (0, 1))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"groupId" uuid NOT NULL,
	"createdBy" text NOT NULL,
	"rowCount" integer NOT NULL,
	"requestHash" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notification_dismissals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"groupId" uuid NOT NULL,
	"subject" text NOT NULL,
	"notificationType" text NOT NULL,
	"notificationId" uuid NOT NULL,
	"dismissedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_dismissal_key" UNIQUE("groupId","subject","notificationType","notificationId")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"groupId" uuid NOT NULL,
	"kind" text NOT NULL,
	"description" text NOT NULL,
	"date" date NOT NULL,
	"amount" bigint NOT NULL,
	"input" jsonb NOT NULL,
	"actor" text NOT NULL,
	"idempotencyKey" uuid NOT NULL,
	"requestHash" text NOT NULL,
	"reverses" uuid,
	"refundOf" uuid,
	"corrects" uuid,
	"correctionReason" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entry_group_id" UNIQUE("groupId","id"),
	CONSTRAINT "entry_request" UNIQUE("groupId","idempotencyKey"),
	CONSTRAINT "one_reversal" UNIQUE("reverses"),
	CONSTRAINT "one_correction" UNIQUE("corrects"),
	CONSTRAINT "positive_amount" CHECK ("entries"."amount" > 0),
	CONSTRAINT "entry_kind" CHECK ("entries"."kind" in ('income','expense','obligation','transfer','settlement','adjustment','reversal','refund'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"groupId" uuid NOT NULL,
	"entryId" uuid NOT NULL,
	"objectKey" text NOT NULL,
	"uploadState" text DEFAULT 'ready' NOT NULL,
	"fileName" text NOT NULL,
	"contentType" text NOT NULL,
	"size" integer NOT NULL,
	"createdBy" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attachments_objectKey_unique" UNIQUE("objectKey")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "entry_effects" (
	"groupId" uuid NOT NULL,
	"entryId" uuid NOT NULL,
	"memberId" uuid NOT NULL,
	"allocatedIncome" bigint NOT NULL,
	"allocatedExpense" bigint NOT NULL,
	"activityCash" bigint NOT NULL,
	"transferCash" bigint NOT NULL,
	"settlementCash" bigint NOT NULL,
	"obligation" bigint NOT NULL,
	"correction" bigint NOT NULL,
	CONSTRAINT "entry_effects_entryId_memberId_pk" PRIMARY KEY("entryId","memberId")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"groupId" uuid NOT NULL,
	"input" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"state" text DEFAULT 'draft' NOT NULL,
	"postedEntryId" uuid,
	"createdBy" text NOT NULL,
	"updatedBy" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "draft_group_id" UNIQUE("groupId","id"),
	CONSTRAINT "draft_state" CHECK ("drafts"."state" in ('draft','posted','discarded')),
	CONSTRAINT "draft_version" CHECK ("drafts"."version" > 0),
	CONSTRAINT "draft_posted_link" CHECK (("drafts"."state" = 'posted') = ("drafts"."postedEntryId" is not null))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "draft_revisions" (
	"groupId" uuid NOT NULL,
	"draftId" uuid NOT NULL,
	"version" integer NOT NULL,
	"input" jsonb NOT NULL,
	"state" text NOT NULL,
	"actor" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "draft_revisions_draftId_version_pk" PRIMARY KEY("draftId","version")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "financial_previews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"groupId" uuid NOT NULL,
	"actor" text NOT NULL,
	"requestHash" text NOT NULL,
	"ledgerVersion" bigint NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	CONSTRAINT "preview_group_id" UNIQUE("groupId","id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "financial_requests" (
	"groupId" uuid NOT NULL,
	"key" uuid NOT NULL,
	"actor" text NOT NULL,
	"requestHash" text NOT NULL,
	"entryIds" jsonb NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "financial_requests_groupId_key_pk" PRIMARY KEY("groupId","key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "draft_requests" (
	"groupId" uuid NOT NULL,
	"key" uuid NOT NULL,
	"actor" text NOT NULL,
	"requestHash" text NOT NULL,
	"result" jsonb NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "draft_requests_groupId_key_pk" PRIMARY KEY("groupId","key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "invitations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"groupId" uuid NOT NULL,
	"memberId" uuid NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"createdBy" text NOT NULL,
	"acceptedBy" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"delivery" text DEFAULT 'link' NOT NULL,
	CONSTRAINT "invitation_role" CHECK ("invitations"."role" in ('admin','editor','viewer')),
	CONSTRAINT "invitation_state" CHECK ("invitations"."state" in ('pending','accepted','revoked')),
	CONSTRAINT "invitation_delivery" CHECK ("invitations"."delivery" in ('link','sending','sent','failed'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "management_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"groupId" uuid NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"details" jsonb NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "management_requests" (
	"groupId" uuid NOT NULL,
	"key" uuid NOT NULL,
	"actor" text NOT NULL,
	"requestHash" text NOT NULL,
	"result" jsonb NOT NULL,
	CONSTRAINT "management_requests_groupId_key_pk" PRIMARY KEY("groupId","key")
);
--> statement-breakpoint
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "historical_reports" ADD CONSTRAINT "historical_reports_groupId_groups_id_fk" FOREIGN KEY ("groupId") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "group_access" ADD CONSTRAINT "group_access_groupId_groups_id_fk" FOREIGN KEY ("groupId") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_groupId_groups_id_fk" FOREIGN KEY ("groupId") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_groupId_linkedSubject_group_access_groupId_subject_fk" FOREIGN KEY ("groupId","linkedSubject") REFERENCES "public"."group_access"("groupId","subject") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_groupId_groups_id_fk" FOREIGN KEY ("groupId") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_groupId_groups_id_fk" FOREIGN KEY ("groupId") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "split_templates" ADD CONSTRAINT "split_templates_groupId_groups_id_fk" FOREIGN KEY ("groupId") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "recurring_transactions" ADD CONSTRAINT "recurring_transactions_groupId_groups_id_fk" FOREIGN KEY ("groupId") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_groupId_groups_id_fk" FOREIGN KEY ("groupId") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "notification_dismissals" ADD CONSTRAINT "notification_dismissals_groupId_groups_id_fk" FOREIGN KEY ("groupId") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_groupId_groups_id_fk" FOREIGN KEY ("groupId") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_groupId_reverses_entries_groupId_id_fk" FOREIGN KEY ("groupId","reverses") REFERENCES "public"."entries"("groupId","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_groupId_refundOf_entries_groupId_id_fk" FOREIGN KEY ("groupId","refundOf") REFERENCES "public"."entries"("groupId","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_groupId_corrects_entries_groupId_id_fk" FOREIGN KEY ("groupId","corrects") REFERENCES "public"."entries"("groupId","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_groupId_groups_id_fk" FOREIGN KEY ("groupId") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_groupId_entryId_entries_groupId_id_fk" FOREIGN KEY ("groupId","entryId") REFERENCES "public"."entries"("groupId","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "entry_effects" ADD CONSTRAINT "entry_effects_groupId_entryId_entries_groupId_id_fk" FOREIGN KEY ("groupId","entryId") REFERENCES "public"."entries"("groupId","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "entry_effects" ADD CONSTRAINT "entry_effects_groupId_memberId_members_groupId_id_fk" FOREIGN KEY ("groupId","memberId") REFERENCES "public"."members"("groupId","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_groupId_groups_id_fk" FOREIGN KEY ("groupId") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_groupId_postedEntryId_entries_groupId_id_fk" FOREIGN KEY ("groupId","postedEntryId") REFERENCES "public"."entries"("groupId","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "draft_revisions" ADD CONSTRAINT "draft_revisions_groupId_draftId_drafts_groupId_id_fk" FOREIGN KEY ("groupId","draftId") REFERENCES "public"."drafts"("groupId","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "financial_previews" ADD CONSTRAINT "financial_previews_groupId_groups_id_fk" FOREIGN KEY ("groupId") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "financial_requests" ADD CONSTRAINT "financial_requests_groupId_groups_id_fk" FOREIGN KEY ("groupId") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "draft_requests" ADD CONSTRAINT "draft_requests_groupId_groups_id_fk" FOREIGN KEY ("groupId") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_groupId_groups_id_fk" FOREIGN KEY ("groupId") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_groupId_memberId_members_groupId_id_fk" FOREIGN KEY ("groupId","memberId") REFERENCES "public"."members"("groupId","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "management_events" ADD CONSTRAINT "management_events_groupId_groups_id_fk" FOREIGN KEY ("groupId") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "management_requests" ADD CONSTRAINT "management_requests_groupId_groups_id_fk" FOREIGN KEY ("groupId") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_sessions_user" ON "user_sessions" USING btree ("userId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_sessions_expiry" ON "user_sessions" USING btree ("expiresAt");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "historical_reports_group" ON "historical_reports" USING btree ("groupId","createdAt");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "projects_group" ON "projects" USING btree ("groupId","archivedAt");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "categories_group" ON "categories" USING btree ("groupId","archivedAt");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "split_templates_group" ON "split_templates" USING btree ("groupId","archivedAt");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recurring_group_next_run" ON "recurring_transactions" USING btree ("groupId","active","nextRun");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "import_batches_group_created" ON "import_batches" USING btree ("groupId","createdAt");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "entries_refund_of" ON "entries" USING btree ("refundOf");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "entries_group_date" ON "entries" USING btree ("groupId","date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attachments_entry" ON "attachments" USING btree ("groupId","entryId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "effects_group_member" ON "entry_effects" USING btree ("groupId","memberId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "drafts_group_state" ON "drafts" USING btree ("groupId","state");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "previews_expiry" ON "financial_previews" USING btree ("expiresAt");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invitations_group" ON "invitations" USING btree ("groupId","createdAt");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "management_events_group" ON "management_events" USING btree ("groupId","createdAt");
