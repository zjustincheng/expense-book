CREATE TABLE "invitations" (
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
CREATE TABLE "management_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"groupId" uuid NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"details" jsonb NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "management_requests" (
	"groupId" uuid NOT NULL,
	"key" uuid NOT NULL,
	"actor" text NOT NULL,
	"requestHash" text NOT NULL,
	"result" jsonb NOT NULL,
	CONSTRAINT "management_requests_groupId_key_pk" PRIMARY KEY("groupId","key")
);
--> statement-breakpoint
ALTER TABLE "group_access" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "managementVersion" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "archivedAt" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "linkedSubject" text;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_groupId_groups_id_fk" FOREIGN KEY ("groupId") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_groupId_memberId_members_groupId_id_fk" FOREIGN KEY ("groupId","memberId") REFERENCES "public"."members"("groupId","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "management_events" ADD CONSTRAINT "management_events_groupId_groups_id_fk" FOREIGN KEY ("groupId") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "management_requests" ADD CONSTRAINT "management_requests_groupId_groups_id_fk" FOREIGN KEY ("groupId") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invitations_group" ON "invitations" USING btree ("groupId","createdAt");--> statement-breakpoint
CREATE INDEX "management_events_group" ON "management_events" USING btree ("groupId","createdAt");--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_groupId_linkedSubject_group_access_groupId_subject_fk" FOREIGN KEY ("groupId","linkedSubject") REFERENCES "public"."group_access"("groupId","subject") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "member_linked_account" UNIQUE("groupId","linkedSubject");