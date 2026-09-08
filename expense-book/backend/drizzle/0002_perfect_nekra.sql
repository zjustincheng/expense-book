CREATE TABLE "draft_requests" (
	"groupId" uuid NOT NULL,
	"key" uuid NOT NULL,
	"actor" text NOT NULL,
	"requestHash" text NOT NULL,
	"result" jsonb NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "draft_requests_groupId_key_pk" PRIMARY KEY("groupId","key")
);
--> statement-breakpoint
CREATE TABLE "draft_revisions" (
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
CREATE TABLE "drafts" (
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
CREATE TABLE "financial_requests" (
	"groupId" uuid NOT NULL,
	"key" uuid NOT NULL,
	"actor" text NOT NULL,
	"requestHash" text NOT NULL,
	"entryIds" jsonb NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "financial_requests_groupId_key_pk" PRIMARY KEY("groupId","key")
);
--> statement-breakpoint
CREATE TABLE "financial_previews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"groupId" uuid NOT NULL,
	"actor" text NOT NULL,
	"requestHash" text NOT NULL,
	"ledgerVersion" bigint NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	CONSTRAINT "preview_group_id" UNIQUE("groupId","id")
);
--> statement-breakpoint
ALTER TABLE "entries" DROP CONSTRAINT "entry_kind";--> statement-breakpoint
ALTER TABLE "entries" ADD COLUMN "refundOf" uuid;--> statement-breakpoint
ALTER TABLE "entries" ADD COLUMN "corrects" uuid;--> statement-breakpoint
ALTER TABLE "entries" ADD COLUMN "correctionReason" text;--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "ledgerVersion" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "draft_requests" ADD CONSTRAINT "draft_requests_groupId_groups_id_fk" FOREIGN KEY ("groupId") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_revisions" ADD CONSTRAINT "draft_revisions_groupId_draftId_drafts_groupId_id_fk" FOREIGN KEY ("groupId","draftId") REFERENCES "public"."drafts"("groupId","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_groupId_groups_id_fk" FOREIGN KEY ("groupId") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_groupId_postedEntryId_entries_groupId_id_fk" FOREIGN KEY ("groupId","postedEntryId") REFERENCES "public"."entries"("groupId","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_requests" ADD CONSTRAINT "financial_requests_groupId_groups_id_fk" FOREIGN KEY ("groupId") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_previews" ADD CONSTRAINT "financial_previews_groupId_groups_id_fk" FOREIGN KEY ("groupId") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "drafts_group_state" ON "drafts" USING btree ("groupId","state");--> statement-breakpoint
CREATE INDEX "previews_expiry" ON "financial_previews" USING btree ("expiresAt");--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_groupId_refundOf_entries_groupId_id_fk" FOREIGN KEY ("groupId","refundOf") REFERENCES "public"."entries"("groupId","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_groupId_corrects_entries_groupId_id_fk" FOREIGN KEY ("groupId","corrects") REFERENCES "public"."entries"("groupId","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "entries_refund_of" ON "entries" USING btree ("refundOf");--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "one_correction" UNIQUE("corrects");--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entry_kind" CHECK ("entries"."kind" in ('income','expense','obligation','transfer','settlement','adjustment','reversal','refund'));