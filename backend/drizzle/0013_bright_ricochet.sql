CREATE TABLE "notification_dismissals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"groupId" uuid NOT NULL,
	"subject" text NOT NULL,
	"notificationType" text NOT NULL,
	"notificationId" uuid NOT NULL,
	"dismissedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_dismissal_key" UNIQUE("groupId","subject","notificationType","notificationId")
);
--> statement-breakpoint
ALTER TABLE "notification_dismissals" ADD CONSTRAINT "notification_dismissals_groupId_groups_id_fk" FOREIGN KEY ("groupId") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;