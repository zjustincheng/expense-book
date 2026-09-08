CREATE TABLE "attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"groupId" uuid NOT NULL,
	"entryId" uuid NOT NULL,
	"objectKey" text NOT NULL,
	"fileName" text NOT NULL,
	"contentType" text NOT NULL,
	"size" integer NOT NULL,
	"createdBy" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attachments_objectKey_unique" UNIQUE("objectKey")
);
--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_groupId_groups_id_fk" FOREIGN KEY ("groupId") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_groupId_entryId_entries_groupId_id_fk" FOREIGN KEY ("groupId","entryId") REFERENCES "public"."entries"("groupId","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attachments_entry" ON "attachments" USING btree ("groupId","entryId");