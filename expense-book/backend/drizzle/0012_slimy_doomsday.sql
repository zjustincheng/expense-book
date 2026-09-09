CREATE TABLE "import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"groupId" uuid NOT NULL,
	"createdBy" text NOT NULL,
	"rowCount" integer NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_groupId_groups_id_fk" FOREIGN KEY ("groupId") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "import_batches_group_created" ON "import_batches" USING btree ("groupId","createdAt");