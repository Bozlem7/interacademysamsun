ALTER TABLE "payments" ADD COLUMN "auto_reminder_sent" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "payments" ADD COLUMN "last_reminder_date" TIMESTAMP(3);
