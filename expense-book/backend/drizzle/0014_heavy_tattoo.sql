CREATE TABLE "user_preferences" (
	"subject" text PRIMARY KEY NOT NULL,
	"notifications" jsonb NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
