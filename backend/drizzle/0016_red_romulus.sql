CREATE TABLE "historical_reports" (
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
ALTER TABLE "historical_reports" ADD CONSTRAINT "historical_reports_groupId_groups_id_fk" FOREIGN KEY ("groupId") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "historical_reports_group" ON "historical_reports" USING btree ("groupId","createdAt");