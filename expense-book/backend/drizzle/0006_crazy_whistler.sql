CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"groupId" uuid NOT NULL,
	"name" text NOT NULL,
	"archivedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "category_group_id" UNIQUE("groupId","id"),
	CONSTRAINT "category_group_name" UNIQUE("groupId","name")
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"groupId" uuid NOT NULL,
	"name" text NOT NULL,
	"archivedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_group_id" UNIQUE("groupId","id"),
	CONSTRAINT "project_group_name" UNIQUE("groupId","name")
);
--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_groupId_groups_id_fk" FOREIGN KEY ("groupId") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_groupId_groups_id_fk" FOREIGN KEY ("groupId") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "categories_group" ON "categories" USING btree ("groupId","archivedAt");--> statement-breakpoint
CREATE INDEX "projects_group" ON "projects" USING btree ("groupId","archivedAt");