ALTER TABLE "groups" ADD COLUMN "openingBalance" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "openingBalanceDate" date;