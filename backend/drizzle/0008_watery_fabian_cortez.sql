CREATE TABLE "split_templates" (
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
ALTER TABLE "split_templates" ADD CONSTRAINT "split_templates_groupId_groups_id_fk" FOREIGN KEY ("groupId") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "split_templates_group" ON "split_templates" USING btree ("groupId","archivedAt");