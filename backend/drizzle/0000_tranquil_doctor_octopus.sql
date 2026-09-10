CREATE TABLE "group_access" (
	"groupId" uuid NOT NULL,
	"subject" text NOT NULL,
	"role" text NOT NULL,
	CONSTRAINT "group_access_groupId_subject_pk" PRIMARY KEY("groupId","subject"),
	CONSTRAINT "valid_role" CHECK ("group_access"."role" in ('admin','editor','viewer'))
);
--> statement-breakpoint
CREATE TABLE "entry_effects" (
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
CREATE TABLE "entries" (
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
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entry_group_id" UNIQUE("groupId","id"),
	CONSTRAINT "entry_request" UNIQUE("groupId","idempotencyKey"),
	CONSTRAINT "one_reversal" UNIQUE("reverses"),
	CONSTRAINT "positive_amount" CHECK ("entries"."amount" > 0),
	CONSTRAINT "entry_kind" CHECK ("entries"."kind" in ('income','expense','obligation','transfer','settlement','adjustment','reversal'))
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"currency" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "supported_currency" CHECK ("groups"."currency" in ('USD', 'EUR', 'GBP', 'CAD', 'AUD'))
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"groupId" uuid NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "member_group_id" UNIQUE("groupId","id")
);
--> statement-breakpoint
ALTER TABLE "group_access" ADD CONSTRAINT "group_access_groupId_groups_id_fk" FOREIGN KEY ("groupId") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_effects" ADD CONSTRAINT "entry_effects_groupId_entryId_entries_groupId_id_fk" FOREIGN KEY ("groupId","entryId") REFERENCES "public"."entries"("groupId","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_effects" ADD CONSTRAINT "entry_effects_groupId_memberId_members_groupId_id_fk" FOREIGN KEY ("groupId","memberId") REFERENCES "public"."members"("groupId","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_groupId_groups_id_fk" FOREIGN KEY ("groupId") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_groupId_reverses_entries_groupId_id_fk" FOREIGN KEY ("groupId","reverses") REFERENCES "public"."entries"("groupId","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_groupId_groups_id_fk" FOREIGN KEY ("groupId") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "effects_group_member" ON "entry_effects" USING btree ("groupId","memberId");--> statement-breakpoint
CREATE INDEX "entries_group_date" ON "entries" USING btree ("groupId","date");