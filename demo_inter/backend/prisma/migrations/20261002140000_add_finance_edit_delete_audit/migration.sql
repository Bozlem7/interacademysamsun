-- AlterTable: edit history (last-edit snapshot) + soft delete for finance_transactions.
ALTER TABLE "finance_transactions" ADD COLUMN "updated_by" TEXT;
ALTER TABLE "finance_transactions" ADD COLUMN "updated_at" TIMESTAMP(3);
ALTER TABLE "finance_transactions" ADD COLUMN "previous_amount" DECIMAL(12,2);
ALTER TABLE "finance_transactions" ADD COLUMN "is_deleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "finance_transactions" ADD COLUMN "deleted_by" TEXT;
ALTER TABLE "finance_transactions" ADD COLUMN "deleted_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "finance_transactions_is_deleted_idx" ON "finance_transactions"("is_deleted");

-- CreateIndex
CREATE INDEX "finance_transactions_created_at_idx" ON "finance_transactions"("created_at");

-- AddForeignKey
ALTER TABLE "finance_transactions" ADD CONSTRAINT "finance_transactions_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_transactions" ADD CONSTRAINT "finance_transactions_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
