CREATE TABLE "recurring_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"groupId" uuid NOT NULL,
	"name" text NOT NULL,
	"input" jsonb NOT NULL,
	"frequency" text NOT NULL,
	"nextRun" date NOT NULL,
	"active" integer DEFAULT 1 NOT NULL,
	"createdBy" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recurring_group_id" UNIQUE("groupId","id"),
	CONSTRAINT "recurring_frequency" CHECK ("recurring_transactions"."frequency" in ('weekly','monthly','quarterly','yearly')),
	CONSTRAINT "recurring_active" CHECK ("recurring_transactions"."active" in (0, 1))
);
--> statement-breakpoint
ALTER TABLE "recurring_transactions" ADD CONSTRAINT "recurring_transactions_groupId_groups_id_fk" FOREIGN KEY ("groupId") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recurring_group_next_run" ON "recurring_transactions" USING btree ("groupId","active","nextRun");